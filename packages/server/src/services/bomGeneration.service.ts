import { spawn } from 'child_process';
import { eq, and } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { AppError, ErrorCodes, gridfinityExtendedDefaultParams } from '@gridfinity/shared';
import type { BOMItem, ApiBomGeneration, BomGenerationManifestEntry, BinCustomization, GeneratorParams } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { bomGenerations, libraries, libraryItems } from '../db/schema.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const DEFAULT_CUSTOMIZATION: BinCustomization = {
  wallPattern: 'none',
  lipStyle: 'normal',
  fingerSlide: 'none',
  wallCutout: 'none',
  height: 8,
};

// ── Pure extraction helpers ───────────────────────────────────────────────────

function customizationKey(item: BOMItem): string {
  const c = item.customization;
  if (!c) return 'default';
  const isDefault =
    c.wallPattern === 'none' && c.lipStyle === 'normal' &&
    c.fingerSlide === 'none' && c.wallCutout === 'none' && c.height === 8;
  if (isDefault) return 'default';
  return `${c.wallPattern}|${c.lipStyle}|${c.fingerSlide}|${c.wallCutout}|${c.height}`;
}

export interface UniqueConfig {
  widthUnits: number;
  heightUnits: number;
  customization: BinCustomization;
  qty: number;
  filename: string;
  gridfinityExtendedParams?: GeneratorParams;
  baseModelPath: string;
}

export interface StaticConfig {
  stlSourcePath: string;
  filename: string;
  qty: number;
}

function hashGeneratorParams(params: GeneratorParams): string {
  const sorted = Object.fromEntries(Object.entries(params).sort((a, b) => a[0].localeCompare(b[0])));
  const str = JSON.stringify(sorted);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function buildStlFilename(w: number, d: number, c: BinCustomization, defaultParams?: GeneratorParams): string {
  const parts = [`bin_${w}x${d}x${c.height}`];
  if (c.lipStyle !== 'normal') parts.push(c.lipStyle);
  if (c.fingerSlide !== 'none') parts.push('fingerslid');
  if (c.wallPattern !== 'none') parts.push('patterned');
  if (c.wallCutout !== 'none') parts.push('cutout');
  if (defaultParams && Object.keys(defaultParams).length > 0) {
    parts.push(hashGeneratorParams(defaultParams));
  }
  return parts.join('_') + '.stl';
}

// ── resolveItemSources ────────────────────────────────────────────────────────

export async function resolveItemSources(bomItems: BOMItem[]): Promise<{
  staticConfigs: StaticConfig[];
  uniqueConfigs: UniqueConfig[];
}> {
  const staticConfigs: StaticConfig[] = [];
  const generatedMap = new Map<string, UniqueConfig>();

  for (const item of bomItems) {
    const itemRows = await db
      .select({ stlFile: libraryItems.stlFile })
      .from(libraryItems)
      .where(and(eq(libraryItems.libraryId, item.libraryId), eq(libraryItems.id, item.itemId)))
      .limit(1);

    const stlFile = itemRows.length > 0 ? itemRows[0].stlFile : null;

    if (stlFile) {
      const filename = path.basename(stlFile);
      const existing = staticConfigs.find((s) => s.stlSourcePath === stlFile);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        staticConfigs.push({ stlSourcePath: stlFile, filename, qty: item.quantity });
      }
    } else {
      const libRows = await db
        .select({ baseModelPath: libraries.baseModelPath })
        .from(libraries)
        .where(eq(libraries.id, item.libraryId))
        .limit(1);

      const baseModelPath = libRows.length > 0 ? libRows[0].baseModelPath : null;
      if (!baseModelPath) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          `Library ${item.libraryId} has no base model and item ${item.itemId} has no static STL`,
        );
      }

      const c = item.customization ?? DEFAULT_CUSTOMIZATION;
      const defaultParams = item.gridfinityExtendedParams ?? {};
      const paramsHash = Object.keys(defaultParams).length > 0 ? hashGeneratorParams(defaultParams) : '';
      const key = `${item.widthUnits}x${item.heightUnits}::${customizationKey(item)}::${paramsHash}::${baseModelPath}`;

      const existing = generatedMap.get(key);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        const filename = buildStlFilename(
          item.widthUnits,
          item.heightUnits,
          c,
          Object.keys(defaultParams).length > 0 ? defaultParams : undefined,
        );
        generatedMap.set(key, {
          widthUnits: item.widthUnits,
          heightUnits: item.heightUnits,
          customization: c,
          qty: item.quantity,
          filename,
          gridfinityExtendedParams: Object.keys(defaultParams).length > 0 ? defaultParams : undefined,
          baseModelPath,
        });
      }
    }
  }

  return { staticConfigs, uniqueConfigs: Array.from(generatedMap.values()) };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

type RawGenRow = Pick<
  typeof bomGenerations.$inferSelect,
  'id' | 'layoutId' | 'status' | 'fileManifest' | 'threeMfPath' | 'generatedAt' | 'errorMessage'
>;

export function formatBomGeneration(row: RawGenRow): ApiBomGeneration {
  return {
    id: row.id,
    layoutId: row.layoutId,
    status: row.status as ApiBomGeneration['status'],
    fileManifest: row.fileManifest ? (JSON.parse(row.fileManifest) as BomGenerationManifestEntry[]) : null,
    threeMfPath: row.threeMfPath,
    generatedAt: row.generatedAt,
    errorMessage: row.errorMessage,
  };
}

export async function getGeneration(layoutId: number): Promise<ApiBomGeneration | null> {
  const rows = await db.select().from(bomGenerations).where(eq(bomGenerations.layoutId, layoutId)).limit(1);
  return rows.length ? formatBomGeneration(rows[0]) : null;
}

// ── Subprocess helpers ────────────────────────────────────────────────────────

const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(PYTHON_CMD, args);
    child.on('error', (err) => { reject(err); });
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${PYTHON_CMD} ${args[0]} exited ${code}: ${stderr.trim()}`));
      }
    });
  });
}

// ── Main generation pipeline ──────────────────────────────────────────────────

export async function triggerGeneration(layoutId: number, bomItems: BOMItem[]): Promise<ApiBomGeneration> {
  const { staticConfigs, uniqueConfigs } = await resolveItemSources(bomItems);

  const outDir = path.resolve(config.GENERATED_STL_DIR, `bom-layout-${layoutId}`);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await db.delete(bomGenerations).where(eq(bomGenerations.layoutId, layoutId));
  const genRows = await db.insert(bomGenerations).values({
    layoutId,
    status: 'generating',
    exportJson: JSON.stringify(bomItems),
  }).returning();

  void runGenerationPipeline(layoutId, staticConfigs, uniqueConfigs, outDir);

  return formatBomGeneration(genRows[0]);
}

async function runGenerationPipeline(
  layoutId: number,
  staticConfigs: StaticConfig[],
  uniqueConfigs: UniqueConfig[],
  outDir: string,
): Promise<void> {
  const generatorDir = path.resolve(config.GRIDFINITY_GENERATOR_DIR);
  const generateBinScript = path.join(generatorDir, 'generate_bin.py');
  const bundleScript = path.join(generatorDir, 'bundle_3mf.py');

  try {
    // Step 1: Copy static STLs
    for (const cfg of staticConfigs) {
      await fs.copyFile(cfg.stlSourcePath, path.join(outDir, cfg.filename));
      logger.info({ filename: cfg.filename }, 'Copied static STL');
    }

    // Step 2: Generate parametric STLs
    for (const cfg of uniqueConfigs) {
      const stlPath = path.join(outDir, cfg.filename);
      const paramsPath = path.join(outDir, `params_${cfg.filename.replace('.stl', '')}.json`);

      const params = buildGenerateParams(cfg);
      await fs.writeFile(paramsPath, JSON.stringify(params));
      await runPython([generateBinScript, paramsPath, '--output', stlPath, '--model', cfg.baseModelPath]);
      logger.info({ stlPath }, 'Generated STL');
    }

    // Step 3: Build manifest + bundle 3MF
    const manifest: BomGenerationManifestEntry[] = [
      ...staticConfigs.map((cfg) => ({
        filename: cfg.filename,
        widthUnits: 0,
        heightUnits: 0,
        customization: DEFAULT_CUSTOMIZATION,
        qty: cfg.qty,
      })),
      ...uniqueConfigs.map((cfg) => ({
        filename: cfg.filename,
        widthUnits: cfg.widthUnits,
        heightUnits: cfg.heightUnits,
        customization: cfg.customization,
        qty: cfg.qty,
      })),
    ];
    const manifestPath = path.join(outDir, 'manifest.json');
    const threeMfPath = path.join(outDir, `bom-${layoutId}.3mf`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await runPython([bundleScript, manifestPath, outDir, threeMfPath]);

    try {
      await db.update(bomGenerations)
        .set({ status: 'ready', fileManifest: JSON.stringify(manifest), threeMfPath, generatedAt: new Date().toISOString() })
        .where(eq(bomGenerations.layoutId, layoutId));
    } catch (dbErr) {
      logger.error({ layoutId, err: dbErr }, 'Failed to update generation status to ready');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ layoutId, err: msg }, 'BOM generation failed');
    await db.update(bomGenerations)
      .set({ status: 'error', errorMessage: msg })
      .where(eq(bomGenerations.layoutId, layoutId));
  }
}

export function buildGenerateParams(cfg: UniqueConfig): Record<string, unknown> {
  const c = cfg.customization;

  const params: Record<string, unknown> = {
    ...gridfinityExtendedDefaultParams,
    ...(cfg.gridfinityExtendedParams ?? {}),
    width: [cfg.widthUnits, 0],
    depth: [cfg.heightUnits, 0],
    height: [c.height, 0],
    lip_style: c.lipStyle,
    fingerslide: c.fingerSlide,
  };

  if (c.wallPattern !== 'none') {
    params.wallpattern_enabled = true;
    params.wallpattern_style = c.wallPattern;
  } else {
    delete params.wallpattern_enabled;
    delete params.wallpattern_style;
  }

  if (c.wallCutout !== 'none') {
    params.wallcutout_enabled = true;
    if (c.wallCutout === 'vertical') params.wallcutout_walls = [1, 0, 1, 0];
    else if (c.wallCutout === 'horizontal') params.wallcutout_walls = [0, 1, 0, 1];
    else if (c.wallCutout === 'both') params.wallcutout_walls = [1, 1, 1, 1];
  } else {
    params.wallcutout_enabled = false;
    delete params.wallcutout_walls;
  }

  return params;
}
