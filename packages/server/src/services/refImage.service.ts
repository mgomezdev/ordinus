import { eq, or, isNull, desc, sql } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiRefImage } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { refImages, userStorage } from '../db/schema.js';
import * as imageService from './image.service.js';

function formatRefImage(row: typeof refImages.$inferSelect): ApiRefImage {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    isGlobal: row.ownerId === null,
    imageUrl: row.filePath,
    fileSize: row.fileSize,
    createdAt: row.createdAt,
  };
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

export async function listRefImages(userId: number): Promise<ApiRefImage[]> {
  const rows = await db
    .select()
    .from(refImages)
    .where(or(eq(refImages.ownerId, userId), isNull(refImages.ownerId)))
    .orderBy(desc(refImages.createdAt));

  return rows.map(formatRefImage);
}

export async function uploadRefImage(
  userId: number,
  file: { buffer: Buffer; originalname: string },
): Promise<ApiRefImage> {
  // Check storage quota
  const storage = await ensureStorageRow(userId);
  if (storage.imageBytes + file.buffer.length > storage.maxImageBytes) {
    throw new AppError(
      ErrorCodes.QUOTA_EXCEEDED,
      `Image storage quota exceeded (${storage.maxImageBytes / 1024 / 1024}MB limit)`,
    );
  }

  // Process and save image
  const result = await imageService.processAndSaveImage(file.buffer, 'ref-lib');

  const now = new Date().toISOString();

  // Insert ref_images row
  const rows = await db
    .insert(refImages)
    .values({
      ownerId: userId,
      name: file.originalname,
      filePath: result.filePath,
      fileSize: result.sizeBytes,
      uploadedBy: userId,
      createdAt: now,
    })
    .returning();

  // Update user storage
  await db
    .update(userStorage)
    .set({ imageBytes: sql`${userStorage.imageBytes} + ${result.sizeBytes}` })
    .where(eq(userStorage.userId, userId));

  return formatRefImage(rows[0]);
}

export async function uploadGlobalRefImage(
  uploadedBy: number,
  file: { buffer: Buffer; originalname: string },
): Promise<ApiRefImage> {
  // No quota check for global images
  const result = await imageService.processAndSaveImage(file.buffer, 'ref-lib');

  const now = new Date().toISOString();

  const rows = await db
    .insert(refImages)
    .values({
      ownerId: null,
      name: file.originalname,
      filePath: result.filePath,
      fileSize: result.sizeBytes,
      uploadedBy,
      createdAt: now,
    })
    .returning();

  return formatRefImage(rows[0]);
}

export async function renameRefImage(
  imageId: number,
  userId: number,
  userRole: string,
  newName: string,
): Promise<ApiRefImage> {
  const rows = await db
    .select()
    .from(refImages)
    .where(eq(refImages.id, imageId))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image not found');
  }

  const img = rows[0];

  // Check permissions: own image or admin
  if (img.ownerId !== null && img.ownerId !== userId && userRole !== 'admin') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }
  if (img.ownerId === null && userRole !== 'admin') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  const updated = await db
    .update(refImages)
    .set({ name: newName })
    .where(eq(refImages.id, imageId))
    .returning();

  return formatRefImage(updated[0]);
}

export async function deleteRefImage(
  imageId: number,
  userId: number,
  userRole: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(refImages)
    .where(eq(refImages.id, imageId))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image not found');
  }

  const img = rows[0];

  // Check permissions
  if (img.ownerId !== null && img.ownerId !== userId && userRole !== 'admin') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }
  if (img.ownerId === null && userRole !== 'admin') {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  // Delete file from disk
  await imageService.deleteImage(img.filePath);

  // Delete DB row (ON DELETE SET NULL cascades to reference_images.ref_image_id)
  await db.delete(refImages).where(eq(refImages.id, imageId));

  // Deduct from user storage if it was a user-owned image
  if (img.ownerId !== null) {
    await db
      .update(userStorage)
      .set({ imageBytes: sql`MAX(${userStorage.imageBytes} - ${img.fileSize}, 0)` })
      .where(eq(userStorage.userId, img.ownerId));
  }
}
