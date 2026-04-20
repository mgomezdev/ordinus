import path from 'path';
import { eq, and, sql } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiLibrary, ApiLibraryItem, ApiCategory } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { libraries, libraryItems, categories, itemCategories } from '../db/schema.js';

export async function getAllLibraries(activeOnly?: boolean): Promise<ApiLibrary[]> {
  const conditions = activeOnly ? eq(libraries.isActive, true) : undefined;

  const libRows = await db
    .select()
    .from(libraries)
    .where(conditions)
    .orderBy(libraries.sortOrder);

  // Get item counts per library in a single query
  const countRows = await db
    .select({
      libraryId: libraryItems.libraryId,
      count: sql<number>`count(*)`,
    })
    .from(libraryItems)
    .groupBy(libraryItems.libraryId);

  const countMap = new Map(countRows.map((r) => [r.libraryId, Number(r.count)]));

  return libRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    itemCount: countMap.get(row.id) ?? 0,
  }));
}

export async function getLibraryById(id: string): Promise<ApiLibrary> {
  const rows = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, `Library '${id}' not found`);
  }

  // Get item count for this library
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryItems)
    .where(eq(libraryItems.libraryId, id));

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    itemCount: Number(countRows[0]?.count ?? 0),
  };
}

interface ItemFilters {
  category?: string;
  width?: number;
  height?: number;
}

export async function getLibraryItems(
  libraryId: string,
  filters?: ItemFilters,
): Promise<ApiLibraryItem[]> {
  // First verify the library exists
  const libRows = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.id, libraryId))
    .limit(1);

  if (libRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, `Library '${libraryId}' not found`);
  }

  // Build conditions
  const conditions = [eq(libraryItems.libraryId, libraryId)];

  if (filters?.width !== undefined) {
    conditions.push(eq(libraryItems.widthUnits, filters.width));
  }
  if (filters?.height !== undefined) {
    conditions.push(eq(libraryItems.heightUnits, filters.height));
  }

  // If category filter, join through item_categories
  let itemRows;
  if (filters?.category) {
    itemRows = await db
      .selectDistinct({
        id: libraryItems.id,
        libraryId: libraryItems.libraryId,
        name: libraryItems.name,
        widthUnits: libraryItems.widthUnits,
        heightUnits: libraryItems.heightUnits,
        color: libraryItems.color,
        imagePath: libraryItems.imagePath,
        perspectiveImagePath: libraryItems.perspectiveImagePath,
        isActive: libraryItems.isActive,
        sortOrder: libraryItems.sortOrder,
        stlFile: libraryItems.stlFile,
      })
      .from(libraryItems)
      .innerJoin(
        itemCategories,
        and(
          eq(itemCategories.libraryId, libraryItems.libraryId),
          eq(itemCategories.itemId, libraryItems.id),
        ),
      )
      .where(and(...conditions, eq(itemCategories.categoryId, filters.category)))
      .orderBy(libraryItems.sortOrder);
  } else {
    itemRows = await db
      .select({
        id: libraryItems.id,
        libraryId: libraryItems.libraryId,
        name: libraryItems.name,
        widthUnits: libraryItems.widthUnits,
        heightUnits: libraryItems.heightUnits,
        color: libraryItems.color,
        imagePath: libraryItems.imagePath,
        perspectiveImagePath: libraryItems.perspectiveImagePath,
        isActive: libraryItems.isActive,
        sortOrder: libraryItems.sortOrder,
        stlFile: libraryItems.stlFile,
      })
      .from(libraryItems)
      .where(and(...conditions))
      .orderBy(libraryItems.sortOrder);
  }

  // Fetch categories for all items in one query
  const itemIds = itemRows.map((item) => item.id);
  if (itemIds.length === 0) {
    return [];
  }

  const catRows = await db
    .select({
      libraryId: itemCategories.libraryId,
      itemId: itemCategories.itemId,
      categoryId: itemCategories.categoryId,
    })
    .from(itemCategories)
    .where(eq(itemCategories.libraryId, libraryId));

  // Build a map of item -> categories
  const catMap = new Map<string, string[]>();
  for (const row of catRows) {
    const key = `${row.libraryId}:${row.itemId}`;
    const existing = catMap.get(key) ?? [];
    existing.push(row.categoryId);
    catMap.set(key, existing);
  }

  return itemRows.map((item) => ({
    id: item.id,
    libraryId: item.libraryId,
    name: item.name,
    widthUnits: item.widthUnits,
    heightUnits: item.heightUnits,
    color: item.color,
    imagePath: item.imagePath,
    perspectiveImagePath: item.perspectiveImagePath,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    stlFile: item.stlFile ? path.basename(item.stlFile) : null,
    categories: catMap.get(`${item.libraryId}:${item.id}`) ?? [],
  }));
}

export async function getLibraryItemById(
  libraryId: string,
  itemId: string,
): Promise<ApiLibraryItem> {
  const rows = await db
    .select({
      id: libraryItems.id,
      libraryId: libraryItems.libraryId,
      name: libraryItems.name,
      widthUnits: libraryItems.widthUnits,
      heightUnits: libraryItems.heightUnits,
      color: libraryItems.color,
      imagePath: libraryItems.imagePath,
      perspectiveImagePath: libraryItems.perspectiveImagePath,
      isActive: libraryItems.isActive,
      sortOrder: libraryItems.sortOrder,
      stlFile: libraryItems.stlFile,
    })
    .from(libraryItems)
    .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, itemId)))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(
      ErrorCodes.NOT_FOUND,
      `Item '${itemId}' not found in library '${libraryId}'`,
    );
  }

  const item = rows[0];

  // Fetch categories for this item
  const catRows = await db
    .select({ categoryId: itemCategories.categoryId })
    .from(itemCategories)
    .where(
      and(
        eq(itemCategories.libraryId, libraryId),
        eq(itemCategories.itemId, itemId),
      ),
    );

  return {
    id: item.id,
    libraryId: item.libraryId,
    name: item.name,
    widthUnits: item.widthUnits,
    heightUnits: item.heightUnits,
    color: item.color,
    imagePath: item.imagePath,
    perspectiveImagePath: item.perspectiveImagePath,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    stlFile: item.stlFile ? path.basename(item.stlFile) : null,
    categories: catRows.map((r) => r.categoryId),
  };
}

export async function getAllCategories(): Promise<ApiCategory[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(categories.sortOrder);

  return rows;
}

// ============================================================
// Admin CRUD operations
// ============================================================

interface CreateLibraryData {
  id: string;
  name: string;
  description?: string;
  version?: string;
  sortOrder?: number;
}

export async function createLibrary(data: CreateLibraryData): Promise<ApiLibrary> {
  const now = new Date().toISOString();

  // Check for duplicate ID
  const existing = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.id, data.id))
    .limit(1);

  if (existing.length > 0) {
    throw new AppError(ErrorCodes.CONFLICT, `Library '${data.id}' already exists`);
  }

  const rows = await db
    .insert(libraries)
    .values({
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      version: data.version ?? '1.0.0',
      isActive: true,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    itemCount: 0,
  };
}

interface UpdateLibraryData {
  name?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function updateLibrary(
  id: string,
  data: UpdateLibraryData,
): Promise<ApiLibrary> {
  const existing = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, `Library '${id}' not found`);
  }

  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) setValues.name = data.name;
  if (data.description !== undefined) setValues.description = data.description;
  if (data.isActive !== undefined) setValues.isActive = data.isActive;
  if (data.sortOrder !== undefined) setValues.sortOrder = data.sortOrder;

  const updatedRows = await db
    .update(libraries)
    .set(setValues)
    .where(eq(libraries.id, id))
    .returning();

  const row = updatedRows[0];

  // Get item count
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(libraryItems)
    .where(eq(libraryItems.libraryId, id));

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    itemCount: Number(countRows[0]?.count ?? 0),
  };
}

export async function deleteLibrary(id: string): Promise<void> {
  const existing = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, `Library '${id}' not found`);
  }

  // Soft delete: set isActive = false
  await db
    .update(libraries)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(libraries.id, id));
}

interface CreateItemData {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color?: string;
  imagePath?: string;
  perspectiveImagePath?: string;
  sortOrder?: number;
  categories?: string[];
}

export async function createItem(
  libraryId: string,
  data: CreateItemData,
): Promise<ApiLibraryItem> {
  // Verify library exists
  const libRows = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(eq(libraries.id, libraryId))
    .limit(1);

  if (libRows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, `Library '${libraryId}' not found`);
  }

  // Check for duplicate item ID in this library
  const existingItem = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, data.id)))
    .limit(1);

  if (existingItem.length > 0) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      `Item '${data.id}' already exists in library '${libraryId}'`,
    );
  }

  const now = new Date().toISOString();

  await db
    .insert(libraryItems)
    .values({
      libraryId,
      id: data.id,
      name: data.name,
      widthUnits: data.widthUnits,
      heightUnits: data.heightUnits,
      color: data.color ?? '#3B82F6',
      imagePath: data.imagePath ?? null,
      perspectiveImagePath: data.perspectiveImagePath ?? null,
      isActive: true,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });

  // Insert category associations
  const categoryIds = data.categories ?? [];
  for (const categoryId of categoryIds) {
    await db
      .insert(itemCategories)
      .values({ libraryId, itemId: data.id, categoryId });
  }

  return {
    id: data.id,
    libraryId,
    name: data.name,
    widthUnits: data.widthUnits,
    heightUnits: data.heightUnits,
    color: data.color ?? '#3B82F6',
    imagePath: data.imagePath ?? null,
    perspectiveImagePath: data.perspectiveImagePath ?? null,
    isActive: true,
    sortOrder: data.sortOrder ?? 0,
    categories: categoryIds,
  };
}

interface UpdateItemData {
  name?: string;
  widthUnits?: number;
  heightUnits?: number;
  color?: string;
  imagePath?: string;
  perspectiveImagePath?: string;
  isActive?: boolean;
  sortOrder?: number;
  categories?: string[];
}

export async function updateItem(
  libraryId: string,
  itemId: string,
  data: UpdateItemData,
): Promise<ApiLibraryItem> {
  const existing = await db
    .select()
    .from(libraryItems)
    .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, itemId)))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(
      ErrorCodes.NOT_FOUND,
      `Item '${itemId}' not found in library '${libraryId}'`,
    );
  }

  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };

  if (data.name !== undefined) setValues.name = data.name;
  if (data.widthUnits !== undefined) setValues.widthUnits = data.widthUnits;
  if (data.heightUnits !== undefined) setValues.heightUnits = data.heightUnits;
  if (data.color !== undefined) setValues.color = data.color;
  if (data.imagePath !== undefined) setValues.imagePath = data.imagePath;
  if (data.perspectiveImagePath !== undefined) setValues.perspectiveImagePath = data.perspectiveImagePath;
  if (data.isActive !== undefined) setValues.isActive = data.isActive;
  if (data.sortOrder !== undefined) setValues.sortOrder = data.sortOrder;

  await db
    .update(libraryItems)
    .set(setValues)
    .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, itemId)));

  // Update categories if provided
  if (data.categories !== undefined) {
    // Delete existing associations
    await db
      .delete(itemCategories)
      .where(
        and(
          eq(itemCategories.libraryId, libraryId),
          eq(itemCategories.itemId, itemId),
        ),
      );

    // Insert new associations
    for (const categoryId of data.categories) {
      await db
        .insert(itemCategories)
        .values({ libraryId, itemId, categoryId });
    }
  }

  // Return updated item
  return getLibraryItemById(libraryId, itemId);
}

export async function deleteItem(
  libraryId: string,
  itemId: string,
): Promise<void> {
  const existing = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, itemId)))
    .limit(1);

  if (existing.length === 0) {
    throw new AppError(
      ErrorCodes.NOT_FOUND,
      `Item '${itemId}' not found in library '${libraryId}'`,
    );
  }

  // Soft delete: set isActive = false
  await db
    .update(libraryItems)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, itemId)));
}
