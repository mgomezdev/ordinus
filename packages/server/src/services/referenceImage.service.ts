import { eq, and, sql } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiReferenceImage } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { referenceImages, layouts, userStorage } from '../db/schema.js';
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

async function ensureStorageRow(userId: number): Promise<typeof userStorage.$inferSelect> {
  const existing = await db
    .select()
    .from(userStorage)
    .where(eq(userStorage.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const inserted = await db
    .insert(userStorage)
    .values({ userId, layoutCount: 0, imageBytes: 0 })
    .returning();

  return inserted[0];
}

export async function uploadReferenceImage(
  layoutId: number,
  userId: number,
  file: { buffer: Buffer; originalname: string },
): Promise<ApiReferenceImage> {
  // Verify layout exists and belongs to user
  const layoutRows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (layoutRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  if (layoutRows[0].userId !== userId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  // Check storage quota
  const storage = await ensureStorageRow(userId);
  if (storage.imageBytes + file.buffer.length > storage.maxImageBytes) {
    throw new AppError(
      ErrorCodes.QUOTA_EXCEEDED,
      `Image storage quota exceeded (${storage.maxImageBytes / 1024 / 1024}MB limit)`,
    );
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

  // Update user storage
  await db
    .update(userStorage)
    .set({ imageBytes: sql`${userStorage.imageBytes} + ${result.sizeBytes}` })
    .where(eq(userStorage.userId, userId));

  return formatReferenceImage(rows[0]);
}

export async function deleteReferenceImage(
  layoutId: number,
  imageId: number,
  userId: number,
): Promise<void> {
  // Verify layout exists and belongs to user
  const layoutRows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (layoutRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  if (layoutRows[0].userId !== userId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
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

  // Delete the file and get its size
  const freedBytes = await imageService.deleteImage(img.filePath);

  // Delete the DB record
  await db
    .delete(referenceImages)
    .where(eq(referenceImages.id, imageId));

  // Update user storage
  if (freedBytes > 0) {
    await db
      .update(userStorage)
      .set({ imageBytes: sql`MAX(${userStorage.imageBytes} - ${freedBytes}, 0)` })
      .where(eq(userStorage.userId, userId));
  }
}
