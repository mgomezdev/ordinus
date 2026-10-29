import { eq, and, lt, desc, sql, or, inArray } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { logger } from '../logger.js';
import type { ApiLayout, ApiLayoutDetail, ApiRefImagePlacement, BinCustomization, Quad } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { layouts, placedItems, referenceImages, refImages, customers } from '../db/schema.js';
import * as referenceImageService from './referenceImage.service.js';
import { formatLayout, formatPlacedItem } from './formatters.js';
import * as layoutThumbnailService from './layoutThumbnail.service.js';
import { releaseWarps } from './refImageWarp.service.js';

interface CursorData {
  createdAt: string;
  id: number;
}

async function layoutWarpPaths(layoutId: number): Promise<Array<string | null>> {
  const rows = await db
    .select({ warpedFilePath: referenceImages.warpedFilePath })
    .from(referenceImages)
    .where(eq(referenceImages.layoutId, layoutId));
  return rows.map(r => r.warpedFilePath);
}

function parseCorners(raw: string | null): Quad | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Quad;
  } catch {
    return null;
  }
}

function formatRefPlacement(
  row: typeof referenceImages.$inferSelect,
  imageUrl: string | null,
): ApiRefImagePlacement {
  const corners = parseCorners(row.corners);
  return {
    id: row.id,
    layoutId: row.layoutId,
    refImageId: row.refImageId,
    name: row.name,
    imageUrl,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    opacity: row.opacity,
    scale: row.scale,
    isLocked: row.isLocked,
    rotation: row.rotation,
    corners,
    warpedImageUrl: corners ? row.warpedFilePath : null,
  };
}

function encodeCursor(data: CursorData): string {
  const json = JSON.stringify(data);
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

export async function getAllLayouts(
  cursor?: string,
  limit: number = 20,
  customerId?: number,
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

  let conditions;
  if (customerId !== undefined && !isNaN(customerId)) {
    const customerFilter = eq(layouts.customerId, customerId);
    conditions = cursorCondition ? and(customerFilter, cursorCondition) : customerFilter;
  } else {
    conditions = cursorCondition;
  }

  // Fetch layouts with customer name via LEFT JOIN
  const rows = await db
    .select({
      layout: layouts,
      customerName: customers.name,
    })
    .from(layouts)
    .leftJoin(customers, eq(layouts.customerId, customers.id))
    .where(conditions)
    .orderBy(desc(layouts.createdAt), desc(layouts.id))
    .limit(safeLimit + 1);

  const hasMore = rows.length > safeLimit;
  const data = rows.slice(0, safeLimit).map(row =>
    formatLayout(row.layout, row.customerName ?? undefined),
  );

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

// Keep the old name as an alias for backward compatibility
export const getLayoutsByUser = getAllLayouts;

export async function getLayoutById(
  layoutId: number,
): Promise<ApiLayoutDetail> {
  const rows = await db
    .select({
      layout: layouts,
      customerName: customers.name,
    })
    .from(layouts)
    .leftJoin(customers, eq(layouts.customerId, customers.id))
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  const { layout, customerName } = rows[0];

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

  const refImagePlacements: ApiRefImagePlacement[] = refPlacementRows.map(row =>
    formatRefPlacement(row.ri, row.ri.refImageId !== null ? (row.refImgPath ?? null) : null),
  );

  return {
    ...formatLayout(layout, customerName ?? undefined),
    placedItems: itemRows.map(formatPlacedItem),
    referenceImages: legacyRefImages,
    refImagePlacements,
  };
}

interface CreateLayoutData {
  name: string;
  description?: string;
  customerId?: number | null;
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
    corners?: Quad | null;
    warpedImageUrl?: string | null;
  }>;
}

export async function createLayout(
  data: CreateLayoutData,
): Promise<ApiLayoutDetail> {
  const now = new Date().toISOString();

  const layoutRows = await db
    .insert(layouts)
    .values({
      userId: null,
      customerId: data.customerId ?? null,
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
      corners: p.corners ? JSON.stringify(p.corners) : null,
      warpedFilePath: p.corners ? (p.warpedImageUrl ?? null) : null,
      createdAt: now,
    }));

    const insertedRefs = await db
      .insert(referenceImages)
      .values(refValues)
      .returning();

    for (const row of insertedRefs) {
      refPlacementPlacements.push(formatRefPlacement(row, null)); // imageUrl resolved on load
    }
  }

  let thumbnailFilename: string | undefined;
  try {
    thumbnailFilename = await layoutThumbnailService.generate(
      layout.id,
      data.gridX,
      data.gridY,
      insertedItems.map(i => ({
        libraryId: i.libraryId,
        itemId: i.itemId,
        x: i.x,
        y: i.y,
        width: i.width,
        height: i.height,
        rotation: i.rotation,
      })),
    );
  } catch (err) {
    logger.warn({ err, layoutId: layout.id }, 'Thumbnail generation failed — layout saved without thumbnail');
  }

  // Fetch customer name if needed
  let customerName: string | undefined;
  if (data.customerId) {
    const custRows = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, data.customerId)).limit(1);
    customerName = custRows[0]?.name;
  }

  return {
    ...formatLayout({ ...layout, thumbnailPath: thumbnailFilename ?? null }, customerName),
    placedItems: insertedItems.map(formatPlacedItem),
    refImagePlacements: refPlacementPlacements,
  };
}

export async function updateLayout(
  layoutId: number,
  data: CreateLayoutData,
): Promise<ApiLayoutDetail> {
  const existing = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  const now = new Date().toISOString();

  // Validate ref image ids up front — inserting a stale/unknown id trips the
  // FK constraint after the old placements have already been deleted below,
  // so catching it here avoids losing data to a doomed insert.
  if (data.refImagePlacements && data.refImagePlacements.length > 0) {
    const requestedIds = [...new Set(data.refImagePlacements.map(p => p.refImageId))];
    const foundRows = await db
      .select({ id: refImages.id })
      .from(refImages)
      .where(inArray(refImages.id, requestedIds));
    const foundIds = new Set(foundRows.map(r => r.id));
    const missingIds = requestedIds.filter(id => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new AppError(ErrorCodes.CONFLICT, `Reference image(s) not found: ${missingIds.join(', ')}`);
    }
  }

  // Delete-and-reinsert runs in one transaction so a failure partway through
  // (e.g. an FK violation) rolls back instead of leaving the layout without
  // its placed items and reference images. Note: db.transaction()/
  // client.transaction() can't be used for this — for a `:memory:` DB (used
  // in tests) it hands the connection to a separate Transaction object, and
  // any later query on `db` lazily opens a brand-new, empty in-memory
  // database. Plain BEGIN/COMMIT/ROLLBACK on the same connection avoids that.
  let updatedRows: Array<typeof layouts.$inferSelect>;
  let insertedItems: Array<typeof placedItems.$inferSelect> = [];
  const refPlacementPlacements: ApiRefImagePlacement[] = [];
  const previousWarps = await layoutWarpPaths(layoutId);
  await db.run(sql`BEGIN`);
  try {
    updatedRows = await db
      .update(layouts)
      .set({
        customerId: data.customerId !== undefined ? data.customerId : existing[0].customerId,
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
      };
    });

    if (itemValues.length > 0) {
      insertedItems = await db
        .insert(placedItems)
        .values(itemValues)
        .returning();
    }

    // Insert ref image placements
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
        corners: p.corners ? JSON.stringify(p.corners) : null,
        warpedFilePath: p.corners ? (p.warpedImageUrl ?? null) : null,
        createdAt: now,
      }));

      const insertedRefs = await db
        .insert(referenceImages)
        .values(refValues)
        .returning();

      for (const row of insertedRefs) {
        refPlacementPlacements.push(formatRefPlacement(row, null));
      }
    }
    await db.run(sql`COMMIT`);
  } catch (err) {
    await db.run(sql`ROLLBACK`);
    throw err;
  }

  // Re-aligned or unaligned images leave their old warp behind
  await releaseWarps(previousWarps);

  let thumbnailFilename: string | undefined;
  try {
    thumbnailFilename = await layoutThumbnailService.generate(
      layoutId,
      data.gridX,
      data.gridY,
      insertedItems.map(i => ({
        libraryId: i.libraryId,
        itemId: i.itemId,
        x: i.x,
        y: i.y,
        width: i.width,
        height: i.height,
        rotation: i.rotation,
      })),
    );
  } catch (err) {
    logger.warn({ err, layoutId }, 'Thumbnail generation failed — layout saved without thumbnail');
  }

  // Fetch customer name
  const effectiveCustomerId = data.customerId !== undefined ? data.customerId : existing[0].customerId;
  let customerName: string | undefined;
  if (effectiveCustomerId) {
    const custRows = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, effectiveCustomerId)).limit(1);
    customerName = custRows[0]?.name;
  }

  return {
    ...formatLayout({ ...updatedRows[0], thumbnailPath: thumbnailFilename ?? updatedRows[0].thumbnailPath ?? null }, customerName),
    placedItems: insertedItems.map(formatPlacedItem),
    refImagePlacements: refPlacementPlacements,
  };
}

export async function updateLayoutMeta(
  layoutId: number,
  data: { name?: string; description?: string; customerId?: number | null },
): Promise<ApiLayout> {
  const existing = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) setValues.name = data.name;
  if (data.description !== undefined) setValues.description = data.description;
  if (data.customerId !== undefined) setValues.customerId = data.customerId;

  const updatedRows = await db
    .update(layouts)
    .set(setValues)
    .where(eq(layouts.id, layoutId))
    .returning();

  const effectiveCustomerId = data.customerId !== undefined ? data.customerId : existing[0].customerId;
  let customerName: string | undefined;
  if (effectiveCustomerId) {
    const custRows = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, effectiveCustomerId)).limit(1);
    customerName = custRows[0]?.name;
  }

  return formatLayout(updatedRows[0], customerName);
}

export async function deleteLayout(
  layoutId: number,
): Promise<void> {
  const existing = await db
    .select()
    .from(layouts)
    .where(eq(layouts.id, layoutId))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }

  await layoutThumbnailService.deleteThumbnail(layoutId);
  const warps = await layoutWarpPaths(layoutId);

  // Delete layout (CASCADE will delete placed_items)
  await db.delete(layouts).where(eq(layouts.id, layoutId));
  await releaseWarps(warps);
}

export async function cloneLayout(
  sourceLayoutId: number,
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

  const now = new Date().toISOString();

  // Create new layout preserving customer association
  const newLayoutRows = await db
    .insert(layouts)
    .values({
      userId: null,
      customerId: source.customerId,
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
      corners: p.corners,
      warpedFilePath: p.warpedFilePath,
      createdAt: now,
    }));

    const insertedRefs = await db
      .insert(referenceImages)
      .values(refValues)
      .returning();

    for (const row of insertedRefs) {
      refPlacementResults.push(formatRefPlacement(row, null));
    }
  }

  let thumbnailFilename: string | undefined;
  try {
    thumbnailFilename = await layoutThumbnailService.generate(
      newLayout.id,
      newLayout.gridX,
      newLayout.gridY,
      insertedItems.map(i => ({
        libraryId: i.libraryId,
        itemId: i.itemId,
        x: i.x,
        y: i.y,
        width: i.width,
        height: i.height,
        rotation: i.rotation,
      })),
    );
  } catch (err) {
    logger.warn({ err, layoutId: newLayout.id }, 'Thumbnail generation failed — layout saved without thumbnail');
  }

  // Fetch customer name
  let customerName: string | undefined;
  if (source.customerId) {
    const custRows = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, source.customerId)).limit(1);
    customerName = custRows[0]?.name;
  }

  return {
    ...formatLayout({ ...newLayout, thumbnailPath: thumbnailFilename ?? null }, customerName),
    placedItems: insertedItems.map(formatPlacedItem),
    refImagePlacements: refPlacementResults,
  };
}

// Legacy compatibility — kept but no longer called internally
export async function getUsers(): Promise<Array<{ id: number; username: string }>> {
  return [];
}
