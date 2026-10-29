import { resolve, join } from 'node:path';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import {
  AppError,
  ErrorCodes,
  UNIT_SQUARE,
  computeHomography,
  invertHomography,
  computeWarpBounds,
  validateQuad,
} from '@gridfinity/shared';
import type { ApiRefImageWarp, Quad, WarpBounds } from '@gridfinity/shared';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { refImages } from '../db/schema.js';

/** How far (in grid widths/depths) the warped photo may extend past each grid edge. */
export const WARP_MAX_OVERFLOW = 0.5;
/** Pixel size of the grid region's longer side in the warped output. */
export const WARP_GRID_LONG_SIDE_PX = 1600;
/** Source photos are downscaled to this longest side before warping. */
const WARP_SOURCE_MAX_PX = 2400;
export const WARP_SUBDIR = 'ref-warp';
export const WARPED_IMAGE_PATH_PATTERN = /^ref-warp\/[0-9a-f-]{36}\.webp$/;
const WARP_WEBP_QUALITY = 85;
const CHANNELS = 4;

export interface RgbaImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface WarpedPixels extends RgbaImage {
  bounds: WarpBounds;
}

/**
 * Perspective-warps `src` so the quad `cornersPx` (TL, TR, BR, BL in source
 * pixels) fills the grid. Output covers the whole warped photo (clamped to
 * WARP_MAX_OVERFLOW past the grid); pixels outside the photo are transparent.
 */
export function warpPixels(
  src: RgbaImage,
  cornersPx: Quad,
  aspectRatio: number,
  gridLongSidePx: number,
): WarpedPixels {
  const srcToGrid = computeHomography(cornersPx, UNIT_SQUARE);
  const gridToSrc = invertHomography(srcToGrid);
  const bounds = computeWarpBounds(srcToGrid, src.width, src.height, WARP_MAX_OVERFLOW);

  const gridPxW = aspectRatio >= 1 ? gridLongSidePx : gridLongSidePx * aspectRatio;
  const gridPxH = aspectRatio >= 1 ? gridLongSidePx / aspectRatio : gridLongSidePx;
  const width = Math.max(1, Math.round((bounds.maxX - bounds.minX) * gridPxW));
  const height = Math.max(1, Math.round((bounds.maxY - bounds.minY) * gridPxH));
  const out = new Uint8Array(width * height * CHANNELS);

  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = gridToSrc;
  const { data, width: sw, height: sh } = src;
  const maxX = sw - 1;
  const maxY = sh - 1;

  for (let oy = 0; oy < height; oy++) {
    const v = bounds.minY + ((oy + 0.5) / height) * (bounds.maxY - bounds.minY);
    for (let ox = 0; ox < width; ox++) {
      const u = bounds.minX + ((ox + 0.5) / width) * (bounds.maxX - bounds.minX);
      const w = h6 * u + h7 * v + h8;
      if (w <= 0) continue;
      const sx = (h0 * u + h1 * v + h2) / w;
      const sy = (h3 * u + h4 * v + h5) / w;
      if (sx < 0 || sy < 0 || sx > sw || sy > sh) continue;

      // Bilinear sample around the pixel centre
      const fx = Math.min(maxX, Math.max(0, sx - 0.5));
      const fy = Math.min(maxY, Math.max(0, sy - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(maxX, x0 + 1);
      const y1 = Math.min(maxY, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = (y0 * sw + x0) * CHANNELS;
      const i10 = (y0 * sw + x1) * CHANNELS;
      const i01 = (y1 * sw + x0) * CHANNELS;
      const i11 = (y1 * sw + x1) * CHANNELS;
      const o = (oy * width + ox) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) {
        const top = data[i00 + c] + (data[i10 + c] - data[i00 + c]) * tx;
        const bottom = data[i01 + c] + (data[i11 + c] - data[i01 + c]) * tx;
        out[o + c] = Math.round(top + (bottom - top) * ty);
      }
    }
  }

  return { data: out, width, height, bounds };
}

/**
 * Warps library reference image `refImageId` so the normalised `corners`
 * land on the grid corners, saves the result and returns its placement.
 * The original library image is left untouched.
 */
export async function warpRefImage(
  refImageId: number,
  corners: Quad,
  aspectRatio: number,
): Promise<ApiRefImageWarp> {
  const rows = await db.select().from(refImages).where(eq(refImages.id, refImageId)).limit(1);
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image not found');
  }

  const imageDir = resolve(config.IMAGE_DIR);
  let input: Buffer;
  try {
    input = await readFile(join(imageDir, rows[0].filePath));
  } catch {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image file not found');
  }

  const { data, info } = await sharp(input)
    .resize(WARP_SOURCE_MAX_PX, WARP_SOURCE_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Angles are only meaningful in pixel space (normalised coords distort them)
  const cornersPx = corners.map(p => ({ x: p.x * info.width, y: p.y * info.height })) as Quad;
  const validation = validateQuad(cornersPx);
  if (!validation.valid) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, validation.issues.join(' '));
  }
  let warped: WarpedPixels;
  try {
    warped = warpPixels(
      { data, width: info.width, height: info.height },
      cornersPx,
      aspectRatio,
      WARP_GRID_LONG_SIDE_PX,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to warp image';
    throw new AppError(ErrorCodes.VALIDATION_ERROR, message);
  }

  const output = await sharp(Buffer.from(warped.data.buffer), {
    raw: { width: warped.width, height: warped.height, channels: CHANNELS },
  })
    .webp({ quality: WARP_WEBP_QUALITY, alphaQuality: 100 })
    .toBuffer();

  const targetDir = join(imageDir, WARP_SUBDIR);
  await mkdir(targetDir, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  const finalPath = join(targetDir, filename);
  await writeFile(`${finalPath}.tmp`, output);
  await rename(`${finalPath}.tmp`, finalPath);

  const { bounds } = warped;
  return {
    warpedImageUrl: `${WARP_SUBDIR}/${filename}`,
    x: bounds.minX * 100,
    y: bounds.minY * 100,
    width: (bounds.maxX - bounds.minX) * 100,
    height: (bounds.maxY - bounds.minY) * 100,
  };
}
