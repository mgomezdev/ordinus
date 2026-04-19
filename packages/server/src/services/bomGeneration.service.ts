import { spawn } from 'child_process';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { BOMItem, ApiBomGeneration, BomGenerationManifestEntry, BinCustomization, GeneratorParams } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { bomSubmissions, bomGenerations } from '../db/schema.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const DEFAULT_CUSTOMIZATION: BinCustomization = {
  wallPattern: 'none',
  lipStyle: 'normal',
  fingerSlide: 'none',
  wallCutout: 'none',
  height: 8,
};

// ── Pure extraction helpers (exported for testing) ──────────────────────────

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
  defaultParameters?: GeneratorParams;
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

export function extractUniqueConfigs(bomItems: BOMItem[]): UniqueConfig[] {
  const map = new Map<string, UniqueConfig>();

  for (const item of bomItems) {
    const c = item.customization ?? DEFAULT_CUSTOMIZATION;
    const defaultParams = item.defaultParameters ?? {};
    const paramsHash = Object.keys(defaultParams).length > 0 ? hashGeneratorParams(defaultParams) : '';
    const key = `${item.widthUnits}x${item.heightUnits}::${customizationKey(item)}::${paramsHash}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += item.quantity;
    } else {
      const filename = buildStlFilename(item.widthUnits, item.heightUnits, c, defaultParams);
      map.set(key, {
        widthUnits: item.widthUnits,
        heightUnits: item.heightUnits,
        customization: c,
        qty: item.quantity,
        filename,
        defaultParameters: Object.keys(defaultParams).length > 0 ? defaultParams : undefined,
      });
    }
  }

  return Array.from(map.values());
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

// ── DB helpers ────────────────────────────────────────────────────────────

type RawGenRow = Pick<
  typeof bomGenerations.$inferSelect,
  'id' | 'submissionId' | 'status' | 'fileManifest' | 'threeMfPath' | 'generatedAt' | 'errorMessage'
>;

export function formatBomGeneration(row: RawGenRow): ApiBomGeneration {
  return {
    id: row.id,
    submissionId: row.submissionId,
    status: row.status as ApiBomGeneration['status'],
    fileManifest: row.fileManifest ? (JSON.parse(row.fileManifest) as BomGenerationManifestEntry[]) : null,
    threeMfPath: row.threeMfPath,
    generatedAt: row.generatedAt,
    errorMessage: row.errorMessage,
  };
}

export async function getGeneration(submissionId: number): Promise<ApiBomGeneration | null> {
  const rows = await db.select().from(bomGenerations).where(eq(bomGenerations.submissionId, submissionId)).limit(1);
  return rows.length ? formatBomGeneration(rows[0]) : null;
}

// ── Subprocess helpers ────────────────────────────────────────────────────

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

// ── Main generation pipeline ──────────────────────────────────────────────

export async function triggerGeneration(submissionId: number): Promise<ApiBomGeneration> {
  const subRows = await db.select().from(bomSubmissions).where(eq(bomSubmissions.id, submissionId)).limit(1);
  if (!subRows.length) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'BOM submission not found');
  }

  const exportJson = subRows[0].exportJson;
  const bomItems: BOMItem[] = JSON.parse(exportJson) as BOMItem[];
  const uniqueConfigs = extractUniqueConfigs(bomItems);

  const outDir = path.resolve(config.GENERATED_STL_DIR, `bom-${submissionId}`);
  await fs.mkdir(outDir, { recursive: true });

  // Upsert generation record with 'generating' status
  await db.delete(bomGenerations).where(eq(bomGenerations.submissionId, submissionId));
  const genRows = await db.insert(bomGenerations).values({ submissionId, status: 'generating' }).returning();

  void runGenerationPipeline(submissionId, uniqueConfigs, outDir);

  return formatBomGeneration(genRows[0]);
}

async function runGenerationPipeline(
  submissionId: number,
  configs: UniqueConfig[],
  outDir: string,
): Promise<void> {
  const generatorDir = path.resolve(config.GRIDFINITY_GENERATOR_DIR);
  const generateBinScript = path.join(generatorDir, 'generate_bin.py');
  const bundleScript = path.join(generatorDir, 'bundle_3mf.py');

  try {
    // Generate each unique STL
    for (const cfg of configs) {
      const stlPath = path.join(outDir, cfg.filename);
      const paramsPath = path.join(outDir, `params_${cfg.filename.replace('.stl', '')}.json`);

      const params = buildGenerateParams(cfg);
      await fs.writeFile(paramsPath, JSON.stringify(params));
      await runPython([generateBinScript, paramsPath, '--output', stlPath]);
      logger.info({ stlPath }, 'Generated STL');
    }

    // Bundle into 3MF
    const manifest: BomGenerationManifestEntry[] = configs.map(cfg => ({
      filename: cfg.filename,
      widthUnits: cfg.widthUnits,
      heightUnits: cfg.heightUnits,
      customization: cfg.customization,
      qty: cfg.qty,
    }));
    const manifestPath = path.join(outDir, 'manifest.json');
    const threeMfPath = path.join(outDir, `bom-${submissionId}.3mf`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await runPython([bundleScript, manifestPath, outDir, threeMfPath]);

    await db.update(bomGenerations)
      .set({ status: 'ready', fileManifest: JSON.stringify(manifest), threeMfPath, generatedAt: new Date().toISOString() })
      .where(eq(bomGenerations.submissionId, submissionId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ submissionId, err: msg }, 'BOM generation failed');
    await db.update(bomGenerations)
      .set({ status: 'error', errorMessage: msg })
      .where(eq(bomGenerations.submissionId, submissionId));
  }
}

export function buildGenerateParams(cfg: UniqueConfig): Record<string, unknown> {
  const c = cfg.customization;

  const params: Record<string, unknown> = {
    label_style: 'disabled',
    ...(cfg.defaultParameters ?? {}),
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
