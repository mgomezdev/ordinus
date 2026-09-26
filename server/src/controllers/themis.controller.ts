import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { BomGenerationManifestEntry } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection.js';
import { layouts, bomGenerations, customers } from '../db/schema.js';
import { config } from '../config.js';
import { uploadStlToThemis, createThemisProject, addThemisProjectItem, addThemisProjectLink, getThemisProject, ThemisTimeoutError } from '../services/themis.service.js';
import { getSetting } from '../services/settings.service.js';
import { logger } from '../logger.js';


export async function sendToThemisHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const themisUrl = (await getSetting('themis_url')) || config.THEMIS_URL;
    if (!themisUrl) {
      res.status(503).json({ error: { message: 'Themis URL is not configured in settings' } });
      return;
    }
    const themisApiKey = await getSetting('themis_api_key') || undefined;

    const layoutId = parseInt(req.params['layoutId'] as string, 10);
    if (isNaN(layoutId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');

    const layoutRows = await db.select().from(layouts).where(eq(layouts.id, layoutId)).limit(1);
    if (!layoutRows.length) throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
    const layout = layoutRows[0];

    const genRows = await db.select().from(bomGenerations).where(eq(bomGenerations.layoutId, layoutId)).limit(1);
    if (!genRows.length || genRows[0].status !== 'ready') {
      res.status(409).json({ error: { message: 'BOM generation is not ready' } });
      return;
    }

    const gen = genRows[0];
    const manifest: BomGenerationManifestEntry[] = gen.fileManifest
      ? (JSON.parse(gen.fileManifest) as BomGenerationManifestEntry[])
      : [];

    const outDir = path.resolve(config.GENERATED_STL_DIR, `bom-layout-${layoutId}`);
    // All Ordinus STLs share one Themis folder so the content-hash dedup works
    // across layouts that use the same bin model.
    const folder = '/Gridfinity';

    // Resume a partially-sent project from a prior failed attempt instead of
    // creating a duplicate. File uploads dedup by content hash in Themis, so
    // re-uploading is safe; items/links already present are skipped below.
    let existingItemFileIds = new Set<number>();
    let existingLinkUrls = new Set<string>();
    let projectId = gen.themisProjectId;
    if (projectId !== null) {
      try {
        const project = await getThemisProject(themisUrl, projectId, themisApiKey);
        existingItemFileIds = new Set(project.items.map((i) => i.file_id));
        existingLinkUrls = new Set(project.links.map((l) => l.url));
      } catch (err) {
        // A timeout doesn't mean the project is gone — surface it rather
        // than silently creating a duplicate project.
        if (err instanceof ThemisTimeoutError) throw err;
        // Project no longer exists on Themis (e.g. deleted) — create a new one.
        projectId = null;
      }
    }

    // Upload unique STL files; collect filename → Themis file id mapping.
    const fileIdMap = new Map<string, number>();
    const seen = new Set<string>();
    for (const entry of manifest) {
      if (seen.has(entry.filename)) continue;
      seen.add(entry.filename);
      const bytes = await fs.readFile(path.join(outDir, entry.filename));
      const fileId = await uploadStlToThemis(themisUrl, bytes, entry.filename, folder, themisApiKey);
      fileIdMap.set(entry.filename, fileId);
      logger.info({ filename: entry.filename, fileId }, 'Uploaded STL to Themis');
    }

    let customerName: string | undefined;
    if (layout.customerId) {
      const customerRows = await db.select().from(customers)
        .where(eq(customers.id, layout.customerId)).limit(1);
      if (customerRows.length) customerName = customerRows[0]!.name;
    }

    if (projectId === null) {
      projectId = await createThemisProject(
        themisUrl,
        layout.name,
        'Imported from Ordinus',
        undefined,  // no username — auth removed
        layoutId,
        customerName,
        themisApiKey,
      );
      logger.info({ projectId, layoutId }, 'Created Themis project');

      // Persist immediately so a later failure resumes this project instead
      // of orphaning it and creating a duplicate on retry.
      await db.update(bomGenerations)
        .set({ themisProjectId: projectId })
        .where(eq(bomGenerations.layoutId, layoutId));
    }

    for (const entry of manifest) {
      const fileId = fileIdMap.get(entry.filename);
      if (fileId === undefined) continue;
      if (existingItemFileIds.has(fileId)) continue;
      await addThemisProjectItem(themisUrl, projectId, fileId, entry.qty, themisApiKey);
    }

    const publicUrl = config.PUBLIC_URL;
    const backlinkUrl = `${publicUrl}/layouts/${layoutId}`;
    if (!existingLinkUrls.has(backlinkUrl)) {
      await addThemisProjectLink(themisUrl, projectId, backlinkUrl, 'Ordinus layout', themisApiKey);
      logger.info({ projectId, layoutId }, 'Added Ordinus backlink to Themis project');
    }

    const projectUrl = `${themisUrl}/projects/${projectId}`;
    // Ordinus never assigns filament profiles, so any non-empty send always needs them
    const needsFilamentProfiles = manifest.length > 0;
    res.status(200).json({ data: { projectUrl, needsFilamentProfiles } });
  } catch (err) {
    if (err instanceof ThemisTimeoutError) {
      res.status(504).json({ error: { message: err.message } });
      return;
    }
    next(err);
  }
}
