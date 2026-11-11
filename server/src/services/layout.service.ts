import { eq, and, lt, desc, sql, or, inArray } from 'drizzle-orm';
import { AppError, ErrorCodes, GRID_RESOLUTION } from '@gridfinity/shared';
import { logger } from '../logger.js';
import type { ApiLayout, ApiLayoutDetail, ApiRefImagePlacement, ApiReferenceImage, BinCustomization, CustomBinSpec, Quad } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { layouts, placedItems, referenceImages, refImages, customers } from '../db/schema.js';
import { formatLayout, formatPlacedItem } from './formatters.js';
import * as layoutThumbnailService from './layoutThumbnail.service.js';
import { releaseWarps } from './refImageWarp.service.js';
import { randomUUID } from 'node:crypto';
import { layoutWrite, layoutChanged, checkLiveGeometry } from './layoutWrites.js';
import { modelRows, modelSourceSnapshot, prepareGuestModels } from './guestModels.service.js';

type LayoutRow = typeof layouts.$inferSelect;
type PlacedItemRow = typeof placedItems.$inferSelect;
type PlacedItemInsert = typeof placedItems.$inferInsert;
type RefPlacementInsert = typeof referenceImages.$inferInsert;

interface CursorData {
  createdAt: string;
  id: number;
}

interface CreateLayoutData {
  baseRevision?: number;
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
    stableId?: string;
    itemId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    customization?: BinCustomization;
    customSpec?: CustomBinSpec;
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

type ReferenceImageRow = typeof referenceImages.$inferSelect;

function formatReferenceImage(row: ReferenceImageRow): ApiReferenceImage {
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

function formatRefPlacement(
  row: ReferenceImageRow,
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

async function findLayoutOrThrow(layoutId: number): Promise<LayoutRow> {
  const rows = await db.select().from(layouts).where(eq(layouts.id, layoutId)).limit(1);
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  }
  return rows[0];
}

async function customerNameFor(customerId: number | null | undefined): Promise<string | undefined> {
  if (!customerId) return undefined;
  const rows = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, customerId)).limit(1);
  return rows[0]?.name;
}

function toPlacedItemValues(layoutId: number, items: CreateLayoutData['placedItems']): PlacedItemInsert[] {
  return items.map((item, index) => {
    const { libraryId, itemId } = unprefixItemId(item.itemId);
    return {
      layoutId,
      stableId: randomUUID(),
      libraryId,
      itemId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      sortOrder: index,
      customization: item.customization ? JSON.stringify(item.customization) : null,
      customSpec: item.customSpec ? JSON.stringify(item.customSpec) : null,
    };
  });
}

function toRefPlacementValues(
  layoutId: number,
  placements: CreateLayoutData['refImagePlacements'] = [],
  now: string,
): RefPlacementInsert[] {
  return placements.map(p => ({
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
}

async function insertPlacedItems(values: PlacedItemInsert[]): Promise<PlacedItemRow[]> {
  if (values.length === 0) return [];
  return db.insert(placedItems).values(values).returning();
}

async function insertRefPlacements(values: RefPlacementInsert[]): Promise<ApiRefImagePlacement[]> {
  if (values.length === 0) return [];
  const rows = await db.insert(referenceImages).values(values).returning();
  return rows.map(row => formatRefPlacement(row, null)); // imageUrl resolved on load
}

// Thumbnail failures never block saving the layout.
async function tryGenerateThumbnail(
  layoutId: number,
  gridX: number,
  gridY: number,
  items: PlacedItemRow[],
): Promise<string | undefined> {
  try {
    return await layoutThumbnailService.generate(
      layoutId,
      gridX,
      gridY,
      items.map(({ libraryId, itemId, x, y, width, height, rotation }) => ({
        libraryId, itemId, x, y, width, height, rotation,
      })),
    );
  } catch (err) {
    logger.warn({ err, layoutId }, 'Thumbnail generation failed — layout saved without thumbnail');
    return undefined;
  }
}

// Inserting a stale/unknown ref image id trips the FK constraint, so reject
// it before any existing placements are touched.
async function assertRefImagesExist(placements: CreateLayoutData['refImagePlacements'] = []): Promise<void> {
  if (placements.length === 0) return;
  const requestedIds = [...new Set(placements.map(p => p.refImageId))];
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

  const customerFilter = customerId !== undefined && !isNaN(customerId)
    ? eq(layouts.customerId, customerId)
    : undefined;

  // Fetch layouts with customer name via LEFT JOIN
  const rows = await db
    .select({
      layout: layouts,
      customerName: customers.name,
    })
    .from(layouts)
    .leftJoin(customers, eq(layouts.customerId, customers.id))
    .where(and(customerFilter, cursorCondition))
    .orderBy(desc(layouts.createdAt), desc(layouts.id))
    .limit(safeLimit + 1);

  const hasMore = rows.length > safeLimit;
  const data = rows.slice(0, safeLimit).map(row =>
    formatLayout(row.layout, row.customerName ?? undefined),
  );

  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem
    ? encodeCursor({ createdAt: lastItem.createdAt, id: lastItem.id })
    : undefined;

  return { data, nextCursor, hasMore };
}

async function readLayoutById(
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
    placedItems: itemRows.map(row => formatPlacedItem(row, !!layout.liveGuarded)),
    referenceImages: refPlacementRows.map(row => formatReferenceImage(row.ri)),
    refImagePlacements,
  };
}

async function createLayoutInner(
  data: CreateLayoutData,
): Promise<ApiLayoutDetail> {
  const now = new Date().toISOString();

  const [layout] = await db
    .insert(layouts)
    .values({
      userId: null,
      customerId: data.customerId ?? null,
      name: data.name,
      description: data.description ?? null,
      gridX: data.gridX,
      gridY: data.gridY,
      gridResolution: GRID_RESOLUTION,
      widthMm: data.widthMm,
      depthMm: data.depthMm,
      spacerHorizontal: data.spacerHorizontal ?? 'none',
      spacerVertical: data.spacerVertical ?? 'none',
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const insertedItems = await insertPlacedItems(toPlacedItemValues(layout.id, data.placedItems));
  const refImagePlacements = await insertRefPlacements(
    toRefPlacementValues(layout.id, data.refImagePlacements, now),
  );
  const thumbnailFilename = await tryGenerateThumbnail(layout.id, data.gridX, data.gridY, insertedItems);

  return {
    ...formatLayout({ ...layout, thumbnailPath: thumbnailFilename ?? null }, await customerNameFor(data.customerId)),
    placedItems: insertedItems.map(row => formatPlacedItem(row)),
    refImagePlacements,
  };
}

async function updateLayoutInner(
  layoutId: number,
  data: CreateLayoutData,
): Promise<ApiLayoutDetail> {
  const now = new Date().toISOString();

  await assertRefImagesExist(data.refImagePlacements);

  // Delete-and-reinsert runs in one transaction so a failure partway through
  // (e.g. an FK violation) rolls back instead of leaving the layout without
  // its placed items and reference images. Note: db.transaction()/
  // client.transaction() can't be used for this — for a `:memory:` DB (used
  // in tests) it hands the connection to a separate Transaction object, and
  // any later query on `db` lazily opens a brand-new, empty in-memory
  // database. Plain BEGIN/COMMIT/ROLLBACK on the same connection avoids that.
  let updated: LayoutRow;
  let insertedItems: PlacedItemRow[];
  let refImagePlacements: ApiRefImagePlacement[];
  const previousWarps = await layoutWarpPaths(layoutId);
  await db.run(sql`BEGIN IMMEDIATE`);
  try {
    const existing = await findLayoutOrThrow(layoutId);
    if (existing.liveGuarded && data.baseRevision !== existing.revision) throw new AppError(ErrorCodes.CONFLICT, 'This configuration changed. Reload it or open the live editor before saving.');
    if (existing.liveGuarded) {
      if (data.gridX !== Math.floor(data.widthMm / 42) || data.gridY !== Math.floor(data.depthMm / 42)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Drawer dimensions must match the grid');
      checkLiveGeometry(data.gridX, data.gridY, data.placedItems);
    }
    const customerId = data.customerId !== undefined ? data.customerId : existing.customerId;
    [updated] = await db
      .update(layouts)
      .set({
        customerId,
        name: data.name,
        description: data.description ?? null,
        gridX: data.gridX,
        gridY: data.gridY,
        gridResolution: GRID_RESOLUTION,
        widthMm: data.widthMm,
        depthMm: data.depthMm,
        spacerHorizontal: data.spacerHorizontal ?? 'none',
        spacerVertical: data.spacerVertical ?? 'none',
        updatedAt: now,
        revision: existing.revision + 1,
      })
      .where(eq(layouts.id, layoutId))
      .returning();

    const values = toPlacedItemValues(layoutId, data.placedItems);
    if (existing.liveGuarded) {
      const previous = await db.select().from(placedItems).where(eq(placedItems.layoutId, layoutId));
      const identities = data.placedItems.flatMap(item => item.stableId ? [item.stableId] : []);
      if (new Set(identities).size !== identities.length) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Each bin must have a distinct identity');
      for (let index = 0; index < values.length; index++) {
        const identity = data.placedItems[index].stableId;
        if (!identity) continue;
        const old = previous.find(item => item.stableId === identity);
        if (!old && (await db.select({ id: placedItems.id }).from(placedItems).where(eq(placedItems.stableId, identity))).length) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Bin identity belongs to another configuration');
        values[index].stableId = identity;
        if (old) {
          values[index].id = old.id;
          if (old.libraryId === values[index].libraryId && old.itemId === values[index].itemId) values[index].sourceSnapshot = old.sourceSnapshot;
        }
      }
    }
    await db.delete(placedItems).where(eq(placedItems.layoutId, layoutId));
    await db.delete(referenceImages).where(eq(referenceImages.layoutId, layoutId));
    insertedItems = await insertPlacedItems(values);
    if (existing.liveGuarded) {
      for (const row of await modelRows(layoutId)) if (!row.source_snapshot) await db.update(placedItems).set({ sourceSnapshot: modelSourceSnapshot(row) }).where(eq(placedItems.id, Number(row.id)));
    }
    refImagePlacements = await insertRefPlacements(
      toRefPlacementValues(layoutId, data.refImagePlacements, now),
    );
    await db.run(sql`COMMIT`);
  } catch (err) {
    await db.run(sql`ROLLBACK`);
    throw err;
  }

  // Re-aligned or unaligned images leave their old warp behind
  await releaseWarps(previousWarps);

  const thumbnailFilename = await tryGenerateThumbnail(layoutId, data.gridX, data.gridY, insertedItems);
  if (updated.liveGuarded) await prepareGuestModels(layoutId);

  return {
    ...formatLayout(
      { ...updated, thumbnailPath: thumbnailFilename ?? updated.thumbnailPath ?? null },
      await customerNameFor(updated.customerId),
    ),
    placedItems: insertedItems.map(row => formatPlacedItem(row, !!updated.liveGuarded)),
    refImagePlacements,
  };
}

async function updateLayoutMetaInner(
  layoutId: number,
  data: { name?: string; description?: string; customerId?: number | null; baseRevision?: number },
): Promise<ApiLayout> {
  const existing = await findLayoutOrThrow(layoutId);
  if (existing.liveGuarded && data.baseRevision !== existing.revision) throw new AppError(ErrorCodes.CONFLICT, 'This configuration changed. Refresh the saved configurations before renaming.');

  const setValues: Partial<typeof layouts.$inferInsert> = { updatedAt: new Date().toISOString(), revision: existing.revision + 1 };
  if (data.name !== undefined) setValues.name = data.name;
  if (data.description !== undefined) setValues.description = data.description;
  if (data.customerId !== undefined) setValues.customerId = data.customerId;

  const [updated] = await db
    .update(layouts)
    .set(setValues)
    .where(and(eq(layouts.id, layoutId), eq(layouts.revision, existing.revision)))
    .returning();

  if (!updated) throw new AppError(ErrorCodes.CONFLICT, 'This configuration changed. Refresh before saving.');

  const customerId = data.customerId !== undefined ? data.customerId : existing.customerId;
  return formatLayout(updated, await customerNameFor(customerId));
}

async function deleteLayoutInner(
  layoutId: number,
): Promise<void> {
  await findLayoutOrThrow(layoutId);

  await layoutThumbnailService.deleteThumbnail(layoutId);
  const warps = await layoutWarpPaths(layoutId);

  // Delete layout (CASCADE will delete placed_items)
  await db.delete(layouts).where(eq(layouts.id, layoutId));
  await releaseWarps(warps);
}

async function cloneLayoutInner(
  sourceLayoutId: number,
): Promise<ApiLayoutDetail> {
  const source = await findLayoutOrThrow(sourceLayoutId);
  const now = new Date().toISOString();

  // Create new layout preserving customer association
  const [newLayout] = await db
    .insert(layouts)
    .values({
      userId: null,
      customerId: source.customerId,
      name: `Copy of ${source.name}`,
      description: source.description,
      gridX: source.gridX,
      gridY: source.gridY,
      gridResolution: source.gridResolution,
      widthMm: source.widthMm,
      depthMm: source.depthMm,
      spacerHorizontal: source.spacerHorizontal,
      spacerVertical: source.spacerVertical,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const sourceItems = await db
    .select()
    .from(placedItems)
    .where(eq(placedItems.layoutId, sourceLayoutId))
    .orderBy(placedItems.sortOrder);
  const insertedItems = await insertPlacedItems(
    sourceItems.map(({ id, ...item }) => ({ ...item, stableId: randomUUID(), layoutId: newLayout.id })),
  );

  const sourceRefPlacements = await db
    .select()
    .from(referenceImages)
    .where(eq(referenceImages.layoutId, sourceLayoutId))
    .orderBy(referenceImages.id);
  const refImagePlacements = await insertRefPlacements(
    sourceRefPlacements.map(({ id, ...p }) => ({ ...p, layoutId: newLayout.id, createdAt: now })),
  );

  const thumbnailFilename = await tryGenerateThumbnail(newLayout.id, newLayout.gridX, newLayout.gridY, insertedItems);

  return {
    ...formatLayout({ ...newLayout, thumbnailPath: thumbnailFilename ?? null }, await customerNameFor(source.customerId)),
    placedItems: insertedItems.map(row => formatPlacedItem(row)),
    refImagePlacements,
  };
}

export const getLayoutById = (id: number) => layoutWrite(() => readLayoutById(id));
export const createLayout = (data: CreateLayoutData) => layoutWrite(() => createLayoutInner(data));
export const cloneLayout = (id: number) => layoutWrite(() => cloneLayoutInner(id));
export const updateLayout = (id: number, data: CreateLayoutData) => layoutWrite(async () => {
  const result = await updateLayoutInner(id, data); layoutChanged(id); return result;
});
export const updateLayoutMeta = (id: number, data: { name?: string; description?: string; customerId?: number | null; baseRevision?: number }) => layoutWrite(async () => {
  const result = await updateLayoutMetaInner(id, data); layoutChanged(id); return result;
});
export const deleteLayout = (id: number) => layoutWrite(async () => { await deleteLayoutInner(id); layoutChanged(id); });
