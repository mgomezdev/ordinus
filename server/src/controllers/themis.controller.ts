import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { BomGenerationManifestEntry } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/connection.js';
import { layouts, bomGenerations } from '../db/schema.js';
import { config } from '../config.js';
import { uploadStlToThemis, createThemisProject, addThemisProjectItem } from '../services/themis.service.js';
import { logger } from '../logger.js';


export async function sendToThemisHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Read THEMIS_URL from env directly so tests can override it at runtime.
    const themisUrl = process.env['THEMIS_URL'] ?? config.THEMIS_URL;
    if (!themisUrl) {
      res.status(503).json({ error: { message: 'THEMIS_URL is not configured' } });
      return;
    }

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

    // Upload unique STL files; collect filename → Themis file id mapping.
    const fileIdMap = new Map<string, number>();
    const seen = new Set<string>();
    for (const entry of manifest) {
      if (seen.has(entry.filename)) continue;
      seen.add(entry.filename);
      const bytes = await fs.readFile(path.join(outDir, entry.filename));
      const fileId = await uploadStlToThemis(themisUrl, bytes, entry.filename, folder);
      fileIdMap.set(entry.filename, fileId);
      logger.info({ filename: entry.filename, fileId }, 'Uploaded STL to Themis');
    }

    const projectId = await createThemisProject(
      themisUrl,
      layout.name,
      'Imported from Ordinus',
      undefined,  // no username — auth removed
      layoutId,
    );
    logger.info({ projectId, layoutId }, 'Created Themis project');

    for (const entry of manifest) {
      const fileId = fileIdMap.get(entry.filename);
      if (fileId === undefined) continue;
      await addThemisProjectItem(themisUrl, projectId, fileId, entry.qty);
    }

    // Write Themis project ID back to bom_generations for bidirectional link.
    await db.update(bomGenerations)
      .set({ themisProjectId: projectId })
      .where(eq(bomGenerations.layoutId, layoutId));

    const projectUrl = `${themisUrl}/projects/${projectId}`;
    res.status(200).json({ data: { projectUrl } });
  } catch (err) {
    next(err);
  }
}
