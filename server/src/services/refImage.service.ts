import { and, desc, eq, exists, notExists, or } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiRefImage } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { customerRefImages, refImages } from '../db/schema.js';
import * as imageService from './image.service.js';

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
  let visibility;
  if (customerId !== undefined && !isNaN(customerId)) {
    const associations = db
      .select({ id: customerRefImages.refImageId })
      .from(customerRefImages)
      .where(eq(customerRefImages.refImageId, refImages.id));
    const ownAssociation = db
      .select({ id: customerRefImages.refImageId })
      .from(customerRefImages)
      .where(and(eq(customerRefImages.refImageId, refImages.id), eq(customerRefImages.customerId, customerId)));
    visibility = or(notExists(associations), exists(ownAssociation));
  }

  const rows = await db
    .select()
    .from(refImages)
    .where(visibility)
    .orderBy(desc(refImages.createdAt));

  return rows.map(formatRefImage);
}

async function findRefImageOrThrow(imageId: number): Promise<typeof refImages.$inferSelect> {
  const rows = await db
    .select()
    .from(refImages)
    .where(eq(refImages.id, imageId))
    .limit(1);
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image not found');
  }
  return rows[0];
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

export async function renameRefImage(
  imageId: number,
  newName: string,
): Promise<ApiRefImage> {
  await findRefImageOrThrow(imageId);

  const updated = await db
    .update(refImages)
    .set({ name: newName })
    .where(eq(refImages.id, imageId))
    .returning();

  return formatRefImage(updated[0]);
}

export async function deleteRefImage(imageId: number): Promise<void> {
  const image = await findRefImageOrThrow(imageId);

  // Delete file from disk
  await imageService.deleteImage(image.filePath);

  // Delete DB row (ON DELETE SET NULL cascades to reference_images.ref_image_id)
  await db.delete(refImages).where(eq(refImages.id, imageId));
}
