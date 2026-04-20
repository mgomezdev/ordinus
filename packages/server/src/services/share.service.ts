import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiSharedProject, ApiSharedLayoutView, ApiPlacedItem, ApiLayout } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { sharedProjects, layouts, placedItems, users } from '../db/schema.js';

function formatSharedProject(row: typeof sharedProjects.$inferSelect): ApiSharedProject {
  return {
    id: row.id,
    layoutId: row.layoutId,
    slug: row.slug,
    createdBy: row.createdBy,
    expiresAt: row.expiresAt,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
  };
}

function formatLayout(row: typeof layouts.$inferSelect): ApiLayout {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    gridX: row.gridX,
    gridY: row.gridY,
    widthMm: row.widthMm,
    depthMm: row.depthMm,
    spacerHorizontal: row.spacerHorizontal,
    spacerVertical: row.spacerVertical,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function formatPlacedItem(row: typeof placedItems.$inferSelect): ApiPlacedItem {
  return {
    id: row.id,
    layoutId: row.layoutId,
    libraryId: row.libraryId,
    itemId: row.itemId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    sortOrder: row.sortOrder,
  };
}

const MAX_SLUG_RETRIES = 3;

export async function createShare(
  layoutId: number,
  userId: number,
  expiresInDays?: number,
): Promise<ApiSharedProject> {
  // Verify layout exists and user owns it
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

  const now = new Date().toISOString();
  let expiresAt: string | null = null;
  if (expiresInDays) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiresInDays);
    expiresAt = expiryDate.toISOString();
  }

  // Try generating a unique slug with retries
  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    const slug = nanoid(12);
    try {
      const rows = await db
        .insert(sharedProjects)
        .values({
          layoutId,
          slug,
          createdBy: userId,
          expiresAt,
          viewCount: 0,
          createdAt: now,
        })
        .returning();

      return formatSharedProject(rows[0]);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Check for unique constraint violation (slug collision)
      if (errorMessage.includes('UNIQUE') && attempt < MAX_SLUG_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }

  throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to generate unique share slug');
}

export async function getSharedLayout(slug: string): Promise<ApiSharedLayoutView> {
  const shareRows = await db
    .select()
    .from(sharedProjects)
    .where(eq(sharedProjects.slug, slug))
    .limit(1);

  if (shareRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Shared layout not found');
  }

  const share = shareRows[0];

  // Check expiry
  if (share.expiresAt) {
    const now = new Date();
    const expiresAt = new Date(share.expiresAt);
    if (now > expiresAt) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Share link has expired');
    }
  }

  // Get layout
  const layoutRows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, share.layoutId))
    .limit(1);

  if (layoutRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  // Get placed items
  const itemRows = await db
    .select()
    .from(placedItems)
    .where(eq(placedItems.layoutId, share.layoutId))
    .orderBy(placedItems.sortOrder);

  // Get creator username
  const userRows = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, share.createdBy))
    .limit(1);

  const sharedBy = userRows.length > 0 ? userRows[0].username : 'Unknown';

  // Increment view count
  await db
    .update(sharedProjects)
    .set({ viewCount: sql`${sharedProjects.viewCount} + 1` })
    .where(eq(sharedProjects.id, share.id));

  return {
    layout: formatLayout(layoutRows[0]),
    placedItems: itemRows.map(formatPlacedItem),
    sharedBy,
  };
}

export async function deleteShare(
  shareId: number,
  userId: number,
): Promise<void> {
  const shareRows = await db
    .select()
    .from(sharedProjects)
    .where(eq(sharedProjects.id, shareId))
    .limit(1);

  if (shareRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Share link not found');
  }

  if (shareRows[0].createdBy !== userId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  await db.delete(sharedProjects).where(eq(sharedProjects.id, shareId));
}

export async function getSharesByLayout(
  layoutId: number,
  userId: number,
): Promise<ApiSharedProject[]> {
  // Verify layout ownership
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

  const rows = await db
    .select()
    .from(sharedProjects)
    .where(and(eq(sharedProjects.layoutId, layoutId), eq(sharedProjects.createdBy, userId)));

  return rows.map(formatSharedProject);
}
