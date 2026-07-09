import { eq, desc } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiRefImage } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { refImages } from '../db/schema.js';
import * as imageService from './image.service.js';
import { client } from '../db/client.js';

function formatRefImage(row: typeof refImages.$inferSelect): ApiRefImage {
  return {
    id: row.id,
    ownerId: null,
    name: row.name,
    isGlobal: true,
    imageUrl: row.filePath,
    fileSize: row.fileSize,
    createdAt: row.createdAt,
  };
}

/**
 * List ref images with optional customer context filter.
 * Images with NO customer associations → visible everywhere
 * Images with ONE OR MORE customer associations → only visible in those customers' contexts
 */
export async function listRefImages(customerId?: number): Promise<ApiRefImage[]> {
  if (customerId !== undefined && !isNaN(customerId)) {
    const result = await client.execute({
      sql: `SELECT id, name, file_path, file_size, created_at
            FROM ref_images ri
            WHERE NOT EXISTS (SELECT 1 FROM customer_ref_images cri WHERE cri.ref_image_id = ri.id)
               OR EXISTS (SELECT 1 FROM customer_ref_images cri WHERE cri.ref_image_id = ri.id AND cri.customer_id = ?)
            ORDER BY ri.created_at DESC`,
      args: [customerId],
    });
    return result.rows.map(row => ({
      id: Number(row.id),
      ownerId: null,
      name: String(row.name),
      isGlobal: true,
      imageUrl: String(row.file_path),
      fileSize: Number(row.file_size),
      createdAt: String(row.created_at),
    }));
  }

  const rows = await db
    .select()
    .from(refImages)
    .orderBy(desc(refImages.createdAt));

  return rows.map(formatRefImage);
}

export async function uploadRefImage(
  file: { buffer: Buffer; originalname: string },
): Promise<ApiRefImage> {
  const result = await imageService.processAndSaveImage(file.buffer, 'ref-lib');

  const now = new Date().toISOString();

  const rows = await db
    .insert(refImages)
    .values({
      name: file.originalname,
      filePath: result.filePath,
      fileSize: result.sizeBytes,
      createdAt: now,
    })
    .returning();

  return formatRefImage(rows[0]);
}

// Kept for compatibility with the schema migration — no longer uploads global images separately
export async function uploadGlobalRefImage(
  file: { buffer: Buffer; originalname: string },
): Promise<ApiRefImage> {
  return uploadRefImage(file);
}

export async function renameRefImage(
  imageId: number,
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

  const updated = await db
    .update(refImages)
    .set({ name: newName })
    .where(eq(refImages.id, imageId))
    .returning();

  return formatRefImage(updated[0]);
}

export async function deleteRefImage(imageId: number): Promise<void> {
  const rows = await db
    .select()
    .from(refImages)
    .where(eq(refImages.id, imageId))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image not found');
  }

  // Delete file from disk
  await imageService.deleteImage(rows[0].filePath);

  // Delete DB row (ON DELETE SET NULL cascades to reference_images.ref_image_id)
  await db.delete(refImages).where(eq(refImages.id, imageId));
}
