import { eq, and } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiReferenceImage } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { referenceImages, layouts } from '../db/schema.js';
import * as imageService from './image.service.js';

function formatReferenceImage(
  row: typeof referenceImages.$inferSelect,
): ApiReferenceImage {
  return {
    id: row.id,
    layoutId: row.layoutId,
    name: row.name,
    filePath: row.filePath,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    opacity: row.opacity,
    scale: row.scale,
    isLocked: row.isLocked,
    rotation: row.rotation,
    createdAt: row.createdAt,
  };
}

export async function getReferenceImagesByLayout(
  layoutId: number,
): Promise<ApiReferenceImage[]> {
  const rows = await db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.layoutId, layoutId))
    .orderBy(referenceImages.id);

  return rows.map(formatReferenceImage);
}

export async function uploadReferenceImage(
  layoutId: number,
  _userId: number | null,
  file: { buffer: Buffer; originalname: string },
): Promise<ApiReferenceImage> {
  // Verify layout exists
  const layoutRows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (layoutRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  // Process and save image
  const result = await imageService.processAndSaveImage(
    file.buffer,
    `ref/${layoutId}`,
  );

  const now = new Date().toISOString();

  // Insert reference image record
  const rows = await db
    .insert(referenceImages)
    .values({
      layoutId,
      name: file.originalname,
      filePath: result.filePath,
      createdAt: now,
    })
    .returning();

  return formatReferenceImage(rows[0]);
}

export async function deleteReferenceImage(
  layoutId: number,
  imageId: number,
  _userId?: number | null,
): Promise<void> {
  // Verify layout exists
  const layoutRows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (layoutRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  // Find the reference image
  const imgRows = await db
    .select()
    .from(referenceImages)
    .where(
      and(
        eq(referenceImages.id, imageId),
        eq(referenceImages.layoutId, layoutId),
      ),
    )
    .limit(1);

  if (imgRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image not found');
  }

  const img = imgRows[0];

  // Delete the file
  await imageService.deleteImage(img.filePath);

  // Delete the DB record
  await db
    .delete(referenceImages)
    .where(eq(referenceImages.id, imageId));
}
