import { resolve, sep, isAbsolute } from 'node:path';
import { realpath, writeFile } from 'node:fs/promises';
import type { Row } from '@libsql/client';
import { AppError, ErrorCodes, buildCustomBinParams, validateCustomBinSpec } from '@gridfinity/shared';
import type { BinCustomization, GuestBinModel } from '@gridfinity/shared';
import { authClient as client } from '../db/connection.js';
import { config } from '../config.js';
import { computeParamHash } from '../utils/generationParams.js';
import { buildGenerateParams } from './bomGeneration.service.js';
import { parseCustomization } from './formatters.js';
import { generationPipeline } from './generationPipeline.service.js';
import { logger } from '../logger.js';
import type { GuestAccess } from './guestPreview.service.js';

interface ImageFile { root: string; relative: string }
interface ModelSource {
  top: ImageFile | null;
  perspective: ImageFile | null;
  generation?: { hash: string; params: Record<string, unknown>; baseModelPath: string | null };
}
const defaults: BinCustomization = { wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 4 };
function json(raw: unknown): unknown {
  try { return typeof raw === 'string' ? JSON.parse(raw) as unknown : null; } catch { return null; }
}
export async function modelRows(layoutId: number): Promise<Row[]> {
  const result = await client.execute({
    sql: `SELECT p.id, p.library_id, p.rotation, p.custom_spec, p.customization, p.source_snapshot,
      li.width_units, li.height_units, li.param_hash, li.image_path, li.perspective_image_path,
      l.base_model_path, l.parameters, u.image_url, u.persp_image_urls,
      (SELECT base_model_path FROM libraries WHERE id = 'bins_standard') AS custom_base
      FROM placed_items p LEFT JOIN library_items li ON li.library_id = p.library_id AND li.id = p.item_id
      LEFT JOIN libraries l ON l.id = p.library_id
      LEFT JOIN user_stl_uploads u ON p.library_id = 'user-stl' AND u.id = p.item_id
      WHERE p.layout_id = ? ORDER BY p.sort_order`, args: [layoutId],
  });
  return result.rows;
}
function source(row: Row): ModelSource {
  if (row.source_snapshot) {
    const frozen = json(row.source_snapshot);
    if (frozen && typeof frozen === 'object' && !Array.isArray(frozen)) row = { ...row, ...frozen };
  }
  const rotation = Number(row.rotation);
  let params: Record<string, unknown> | undefined;
  let baseModelPath: string | null = typeof row.base_model_path === 'string' ? row.base_model_path : null;
  if (row.custom_spec) {
    const validated = validateCustomBinSpec(json(row.custom_spec));
    if (!validated.ok) return { top: null, perspective: null };
    params = buildCustomBinParams(validated.spec);
    baseModelPath = typeof row.custom_base === 'string' ? row.custom_base : null;
  } else if (row.library_id !== 'user-stl' && (row.customization || row.param_hash) && baseModelPath) {
    const parameters = json(row.parameters);
    params = buildGenerateParams({ widthUnits: Number(row.width_units), heightUnits: Number(row.height_units),
      customization: parseCustomization(typeof row.customization === 'string' ? row.customization : null) ?? defaults,
      parameters: parameters && typeof parameters === 'object' ? parameters as Record<string, unknown> : undefined,
      baseModelPath, qty: 1, filename: 'bin.stl' });
  }
  if (params) {
    const hash = !row.custom_spec && !row.customization && typeof row.param_hash === 'string' && /^[a-f0-9]{64}$/.test(row.param_hash)
      ? row.param_hash : computeParamHash(params);
    return { top: { root: config.GENERATED_STL_DIR, relative: `${hash}/ortho.png` },
      perspective: { root: config.GENERATED_STL_DIR, relative: `${hash}/perspective_${rotation}.png` },
      generation: { hash, params, baseModelPath } };
  }
  // Never substitute a default image for a saved customization we cannot resolve.
  if (row.custom_spec || row.customization) return { top: null, perspective: null };
  if (row.library_id === 'user-stl') {
    const images = json(row.persp_image_urls);
    const image = (value: unknown): ImageFile | null => typeof value === 'string' && !/[\\/]/.test(value)
      ? { root: config.USER_STL_IMAGE_DIR, relative: `global/${value}` } : null;
    return { top: image(row.image_url), perspective: image(Array.isArray(images) ? images[rotation / 90] : null) };
  }
  let perspective = typeof row.perspective_image_path === 'string' ? row.perspective_image_path : null;
  if (perspective && rotation) perspective = perspective.endsWith('-perspective.png')
    ? perspective.replace(/-perspective\.png$/, `-perspective-${rotation}.png`) : null;
  return { top: typeof row.image_path === 'string' ? { root: config.IMAGE_DIR, relative: row.image_path } : null,
    perspective: perspective ? { root: config.IMAGE_DIR, relative: perspective } : null };
}
async function safeFile(image: ImageFile | null): Promise<string | null> {
  if (!image || isAbsolute(image.relative) || !/\.(png|webp|jpe?g)$/i.test(image.relative)) return null;
  const root = resolve(image.root);
  const full = resolve(root, image.relative);
  if (!full.startsWith(root + sep)) return null;
  try {
    const [actualRoot, actual] = await Promise.all([realpath(root), realpath(full)]);
    return actual.startsWith(actualRoot + sep) ? actual : null;
  } catch { return null; }
}
async function modelFile(model: ModelSource, view: 'top' | 'perspective'): Promise<string | null> {
  const image = model[view];
  if (!image || !model.generation) return safeFile(image);
  for (const kind of ['library', 'custom']) {
    const file = await safeFile({ ...image, relative: `${kind}/${image.relative}` });
    if (file) {
      if (kind === 'custom') void writeFile(resolve(config.GENERATED_STL_DIR, kind, model.generation.hash, '.accessed'), '').catch(() => {});
      return file;
    }
  }
  return null;
}
/** Owner-only preparation: guests can read readiness/images, never enqueue jobs. */
export async function prepareGuestModels(layoutId: number): Promise<void> {
  for (const row of await modelRows(layoutId)) {
    try {
      const generated = source(row).generation;
      if (generated?.baseModelPath) await generationPipeline.enqueue(generated.hash, generated.params, generated.baseModelPath);
    } catch (err) { logger.warn({ err, binId: Number(row.id) }, 'Could not prepare shared bin preview'); }
  }
}
export async function guestModels(access: GuestAccess): Promise<GuestBinModel[]> {
  return Promise.all((await modelRows(access.layoutId)).map(async row => {
    const model = source(row);
    const [top, perspective] = await Promise.all([modelFile(model, 'top'), modelFile(model, 'perspective')]);
    const status = top && perspective ? 'ready' : model.generation ? await generationPipeline.getStatus(model.generation.hash) : 'not-found';
    const base = `/api/v1/guest/${access.linkId}/bins/${row.id}`;
    return { id: Number(row.id), topUrl: top ? `${base}/top` : null, perspectiveUrl: perspective ? `${base}/perspective` : null,
      topRotation: Number(row.rotation), status: status === 'pending' ? 'pending' : top || perspective ? 'ready' : 'unavailable' };
  }));
}
export async function guestModelPath(access: GuestAccess, binId: number, view: 'top' | 'perspective'): Promise<string> {
  const row = (await modelRows(access.layoutId)).find(bin => Number(bin.id) === binId);
  const file = row ? await modelFile(source(row), view) : null;
  if (!file) throw new AppError(ErrorCodes.NOT_FOUND, 'Bin preview is unavailable');
  return file;
}

export function modelSourceSnapshot(row: Row): string {
  const fields = ['width_units', 'height_units', 'param_hash', 'image_path', 'perspective_image_path', 'base_model_path', 'parameters', 'image_url', 'persp_image_urls', 'custom_base'];
  return JSON.stringify(Object.fromEntries(fields.map(key => [key, row[key] ?? null])));
}
