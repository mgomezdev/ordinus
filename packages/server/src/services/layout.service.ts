import { eq, and, lt, desc, sql, or } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiLayout, ApiLayoutDetail, ApiPlacedItem, ApiRefImagePlacement, BinCustomization } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { layouts, placedItems, userStorage, referenceImages, refImages, users } from '../db/schema.js';
import * as referenceImageService from './referenceImage.service.js';

interface CursorData {
  createdAt: string;
  id: number;
}

function encodeCursor(data: CursorData): string {
  const json = JSON.stringify(data);
  // base64url encoding
  return Buffer.from(json).toString('base64url');
}

function decodeCursor(cursor: string): CursorData {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(json) as CursorData;
    if (typeof data.createdAt !== 'string' || typeof data.id !== 'number') {
      throw new Error('Invalid cursor shape');
    }
    return data;
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid cursor');
  }
}

function formatLayout(row: typeof layouts.$inferSelect, ownerUsername?: string, ownerEmail?: string): ApiLayout {
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
    ...(ownerUsername !== undefined ? { ownerUsername } : {}),
    ...(ownerEmail !== undefined ? { ownerEmail } : {}),
  };
}

function parseCustomization(json: string | null): BinCustomization | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as BinCustomization;
  } catch {
    return undefined;
  }
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
    ...(row.customization ? { customization: parseCustomization(row.customization) } : {}),
  };
}

function unprefixItemId(prefixedId: string): { libraryId: string; itemId: string } {
  const colonIndex = prefixedId.indexOf(':');
  if (colonIndex === -1) {
    return { libraryId: 'bins_standard', itemId: prefixedId };
  }
  return {
    libraryId: prefixedId.substring(0, colonIndex),
    itemId: prefixedId.substring(colonIndex + 1),
  };
}

export async function getLayoutsByUser(
  userId: number,
  cursor?: string,
  limit: number = 20,
): Promise<{ data: ApiLayout[]; nextCursor?: string; hasMore: boolean }> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  let cursorCondition;
  if (cursor) {
    const cursorData = decodeCursor(cursor);
    cursorCondition = or(
      lt(layouts.createdAt, cursorData.createdAt),
      and(
        eq(layouts.createdAt, cursorData.createdAt),
        lt(layouts.id, cursorData.id),
      ),
    );
  }

  const conditions = cursorCondition
    ? and(eq(layouts.userId, userId), cursorCondition)
    : eq(layouts.userId, userId);

  const rows = await db
    .select()
    .from(layouts)
    .where(conditions)
    .orderBy(desc(layouts.createdAt), desc(layouts.id))
    .limit(safeLimit + 1);

  const hasMore = rows.length > safeLimit;
  const data = rows.slice(0, safeLimit).map(row => formatLayout(row));

  let nextCursor: string | undefined;
  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1];
    nextCursor = encodeCursor({
      createdAt: lastItem.createdAt,
      id: lastItem.id,
    });
  }

  return { data, nextCursor, hasMore };
}

export async function getLayoutById(
  layoutId: number,
  userId: number,
  isAdmin = false,
): Promise<ApiLayoutDetail> {
  const rows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  const layout = rows[0];

  if (layout.userId !== userId && !isAdmin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  // Resolve owner username for admin views
  let ownerUsername: string | undefined;
  if (isAdmin) {
    const userRows = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, layout.userId))
      .limit(1);
    ownerUsername = userRows[0]?.username;
  }

  const itemRows = await db
    .select()
    .from(placedItems)
    .where(eq(placedItems.layoutId, layoutId))
    .orderBy(placedItems.sortOrder);

  const legacyRefImages = await referenceImageService.getReferenceImagesByLayout(layoutId);

  // Fetch ref image placements with LEFT JOIN to resolve imageUrl
  const refPlacementRows = await db
    .select({
      ri: referenceImages,
      refImgPath: refImages.filePath,
    })
    .from(referenceImages)
    .leftJoin(refImages, eq(referenceImages.refImageId, refImages.id))
    .where(eq(referenceImages.layoutId, layoutId))
    .orderBy(referenceImages.id);

  const refImagePlacements: ApiRefImagePlacement[] = refPlacementRows.map(row => ({
    id: row.ri.id,
    layoutId: row.ri.layoutId,
    refImageId: row.ri.refImageId,
    name: row.ri.name,
    imageUrl: row.ri.refImageId !== null ? (row.refImgPath ?? null) : null,
    x: row.ri.x,
    y: row.ri.y,
    width: row.ri.width,
    height: row.ri.height,
    opacity: row.ri.opacity,
    scale: row.ri.scale,
    isLocked: row.ri.isLocked,
    rotation: row.ri.rotation,
  }));

  return {
    ...formatLayout(layout, ownerUsername),
    placedItems: itemRows.map(formatPlacedItem),
    referenceImages: legacyRefImages,
    refImagePlacements,
  };
}

interface CreateLayoutData {
  name: string;
  description?: string;
  gridX: number;
  gridY: number;
  widthMm: number;
  depthMm: number;
  spacerHorizontal?: string;
  spacerVertical?: string;
  placedItems: Array<{
    itemId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    customization?: BinCustomization;
  }>;
  refImagePlacements?: Array<{
    refImageId: number;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    scale: number;
    isLocked: boolean;
    rotation: number;
  }>;
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

export async function createLayout(
  userId: number,
  data: CreateLayoutData,
): Promise<ApiLayoutDetail> {
  // Check quota
  const storage = await ensureStorageRow(userId);
  if (storage.layoutCount >= storage.maxLayouts) {
    throw new AppError(
      ErrorCodes.QUOTA_EXCEEDED,
      `Layout limit reached (${storage.maxLayouts}). Delete existing layouts to save new ones.`,
    );
  }

  const now = new Date().toISOString();

  // Use a batch for transaction-like behavior
  const layoutRows = await db
    .insert(layouts)
    .values({
      userId,
      name: data.name,
      description: data.description ?? null,
      gridX: data.gridX,
      gridY: data.gridY,
      widthMm: data.widthMm,
      depthMm: data.depthMm,
      spacerHorizontal: data.spacerHorizontal ?? 'none',
      spacerVertical: data.spacerVertical ?? 'none',
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const layout = layoutRows[0];

  // Insert placed items
  const itemValues = data.placedItems.map((item, index) => {
    const { libraryId, itemId } = unprefixItemId(item.itemId);
    return {
      layoutId: layout.id,
      libraryId,
      itemId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      sortOrder: index,
      customization: item.customization ? JSON.stringify(item.customization) : null,
      shadowBoxId: libraryId === 'shadowbox' ? itemId : null,
    };
  });

  let insertedItems: Array<typeof placedItems.$inferSelect> = [];
  if (itemValues.length > 0) {
    insertedItems = await db
      .insert(placedItems)
      .values(itemValues)
      .returning();
  }

  // Insert ref image placements
  const refPlacementPlacements: ApiRefImagePlacement[] = [];
  if (data.refImagePlacements && data.refImagePlacements.length > 0) {
    const refValues = data.refImagePlacements.map(p => ({
      layoutId: layout.id,
      refImageId: p.refImageId,
      name: p.name,
      filePath: '',
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      opacity: p.opacity,
      scale: p.scale,
      isLocked: p.isLocked,
      rotation: p.rotation,
      createdAt: now,
    }));

    const insertedRefs = await db
      .insert(referenceImages)
      .values(refValues)
      .returning();

    for (const row of insertedRefs) {
      refPlacementPlacements.push({
        id: row.id,
        layoutId: row.layoutId,
        refImageId: row.refImageId,
        name: row.name,
        imageUrl: null, // Will be resolved on load
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        opacity: row.opacity,
        scale: row.scale,
        isLocked: row.isLocked,
        rotation: row.rotation,
      });
    }
  }

  // Update storage quota
  await db
    .update(userStorage)
    .set({ layoutCount: sql`${userStorage.layoutCount} + 1` })
    .where(eq(userStorage.userId, userId));

  return {
    ...formatLayout(layout),
    placedItems: insertedItems.map(formatPlacedItem),
    refImagePlacements: refPlacementPlacements,
  };
}

export async function updateLayout(
  layoutId: number,
  userId: number,
  data: CreateLayoutData,
  isAdmin = false,
): Promise<ApiLayoutDetail> {
  // Verify ownership
  const existing = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  if (existing[0].userId !== userId && !isAdmin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  const now = new Date().toISOString();

  // Update layout
  const updatedRows = await db
    .update(layouts)
    .set({
      name: data.name,
      description: data.description ?? null,
      gridX: data.gridX,
      gridY: data.gridY,
      widthMm: data.widthMm,
      depthMm: data.depthMm,
      spacerHorizontal: data.spacerHorizontal ?? 'none',
      spacerVertical: data.spacerVertical ?? 'none',
      updatedAt: now,
    })
    .where(eq(layouts.id, layoutId))
    .returning();

  // Delete old placed items and ref image placements
  await db
    .delete(placedItems)
    .where(eq(placedItems.layoutId, layoutId));
  await db
    .delete(referenceImages)
    .where(eq(referenceImages.layoutId, layoutId));

  // Insert new placed items
  const itemValues = data.placedItems.map((item, index) => {
    const { libraryId, itemId } = unprefixItemId(item.itemId);
    return {
      layoutId,
      libraryId,
      itemId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      sortOrder: index,
      customization: item.customization ? JSON.stringify(item.customization) : null,
      shadowBoxId: libraryId === 'shadowbox' ? itemId : null,
    };
  });

  let insertedItems: Array<typeof placedItems.$inferSelect> = [];
  if (itemValues.length > 0) {
    insertedItems = await db
      .insert(placedItems)
      .values(itemValues)
      .returning();
  }

  // Insert ref image placements
  const refPlacementPlacements: ApiRefImagePlacement[] = [];
  if (data.refImagePlacements && data.refImagePlacements.length > 0) {
    const refValues = data.refImagePlacements.map(p => ({
      layoutId,
      refImageId: p.refImageId,
      name: p.name,
      filePath: '',
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      opacity: p.opacity,
      scale: p.scale,
      isLocked: p.isLocked,
      rotation: p.rotation,
      createdAt: now,
    }));

    const insertedRefs = await db
      .insert(referenceImages)
      .values(refValues)
      .returning();

    for (const row of insertedRefs) {
      refPlacementPlacements.push({
        id: row.id,
        layoutId: row.layoutId,
        refImageId: row.refImageId,
        name: row.name,
        imageUrl: null,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        opacity: row.opacity,
        scale: row.scale,
        isLocked: row.isLocked,
        rotation: row.rotation,
      });
    }
  }

  return {
    ...formatLayout(updatedRows[0]),
    placedItems: insertedItems.map(formatPlacedItem),
    refImagePlacements: refPlacementPlacements,
  };
}

export async function updateLayoutMeta(
  layoutId: number,
  userId: number,
  data: { name?: string; description?: string },
): Promise<ApiLayout> {
  // Verify ownership
  const existing = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }


  if (existing[0].userId !== userId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) setValues.name = data.name;
  if (data.description !== undefined) setValues.description = data.description;

  const updatedRows = await db
    .update(layouts)
    .set(setValues)
    .where(eq(layouts.id, layoutId))
    .returning();

  return formatLayout(updatedRows[0]);
}

export async function deleteLayout(
  layoutId: number,
  userId: number,
): Promise<void> {
  // Verify ownership
  const existing = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }



  if (existing[0].userId !== userId) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  // Delete layout (CASCADE will delete placed_items)
  await db.delete(layouts).where(eq(layouts.id, layoutId));

  // Decrement quota
  await db
    .update(userStorage)
    .set({ layoutCount: sql`MAX(${userStorage.layoutCount} - 1, 0)` })
    .where(eq(userStorage.userId, userId));
}

// ============================================================
// Admin queries
// ============================================================

export async function getUsers(): Promise<Array<{ id: number; username: string }>> {
  const rows = await db.select({ id: users.id, username: users.username }).from(users).orderBy(users.username);
  return rows;
}

export async function cloneLayout(
  sourceLayoutId: number,
  requestingUserId: number,
  isAdmin = false,
): Promise<ApiLayoutDetail> {
  // Fetch source layout
  const sourceRows = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, sourceLayoutId))
    .limit(1);

  if (sourceRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  const source = sourceRows[0];

  // Ownership check: admin can clone any, users can only clone their own
  if (source.userId !== requestingUserId && !isAdmin) {
    throw new AppError(ErrorCodes.FORBIDDEN, 'Access denied');
  }

  // Check quota
  const storage = await ensureStorageRow(requestingUserId);
  if (storage.layoutCount >= storage.maxLayouts) {
    throw new AppError(
      ErrorCodes.QUOTA_EXCEEDED,
      `Layout limit reached (${storage.maxLayouts}). Delete existing layouts to save new ones.`,
    );
  }

  const now = new Date().toISOString();

  // Create new layout as draft
  const newLayoutRows = await db
    .insert(layouts)
    .values({
      userId: requestingUserId,
      name: `Copy of ${source.name}`,
      description: source.description,
      gridX: source.gridX,
      gridY: source.gridY,
      widthMm: source.widthMm,
      depthMm: source.depthMm,
      spacerHorizontal: source.spacerHorizontal,
      spacerVertical: source.spacerVertical,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const newLayout = newLayoutRows[0];

  // Copy placed items
  const sourceItems = await db
    .select()
    .from(placedItems)
    .where(eq(placedItems.layoutId, sourceLayoutId))
    .orderBy(placedItems.sortOrder);

  let insertedItems: Array<typeof placedItems.$inferSelect> = [];
  if (sourceItems.length > 0) {
    const itemValues = sourceItems.map(item => ({
      layoutId: newLayout.id,
      libraryId: item.libraryId,
      itemId: item.itemId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      sortOrder: item.sortOrder,
      customization: item.customization,
    }));
    insertedItems = await db
      .insert(placedItems)
      .values(itemValues)
      .returning();
  }

  // Copy ref image placements
  const sourceRefPlacements = await db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.layoutId, sourceLayoutId))
    .orderBy(referenceImages.id);

  const refPlacementResults: ApiRefImagePlacement[] = [];
  if (sourceRefPlacements.length > 0) {
    const refValues = sourceRefPlacements.map(p => ({
      layoutId: newLayout.id,
      refImageId: p.refImageId,
      name: p.name,
      filePath: p.filePath,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      opacity: p.opacity,
      scale: p.scale,
      isLocked: p.isLocked,
      rotation: p.rotation,
      createdAt: now,
    }));

    const insertedRefs = await db
      .insert(referenceImages)
      .values(refValues)
      .returning();

    for (const row of insertedRefs) {
      refPlacementResults.push({
        id: row.id,
        layoutId: row.layoutId,
        refImageId: row.refImageId,
        name: row.name,
        imageUrl: null,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        opacity: row.opacity,
        scale: row.scale,
        isLocked: row.isLocked,
        rotation: row.rotation,
      });
    }
  }

  // Update storage quota
  await db
    .update(userStorage)
    .set({ layoutCount: sql`${userStorage.layoutCount} + 1` })
    .where(eq(userStorage.userId, requestingUserId));

  return {
    ...formatLayout(newLayout),
    placedItems: insertedItems.map(formatPlacedItem),
    refImagePlacements: refPlacementResults,
  };
}
