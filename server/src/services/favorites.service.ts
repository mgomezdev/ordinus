import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import type { BinCustomization } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { favorites } from '../db/schema.js';

export interface FavoriteRow {
  id: string;
  userId: number | null;
  name: string;
  libraryId: string;
  libraryItemId: string;
  libraryItemName: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  paramHash: string | null;
  imageUrl: string;
  perspectiveImageUrl: string | null;
  perspectiveImageUrl90: string | null;
  perspectiveImageUrl180: string | null;
  perspectiveImageUrl270: string | null;
  customization: string;
  createdAt: number;
}

export interface CreateFavoriteData {
  name: string;
  libraryId: string;
  libraryItemId: string;
  libraryItemName: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  paramHash?: string | null;
  imageUrl: string;
  perspectiveImageUrl?: string | null;
  perspectiveImageUrl90?: string | null;
  perspectiveImageUrl180?: string | null;
  perspectiveImageUrl270?: string | null;
  customization: BinCustomization;
}

export async function listAllFavorites(): Promise<FavoriteRow[]> {
  return db.select().from(favorites).orderBy(favorites.createdAt);
}

// Backward compat alias
export async function listFavorites(_userId?: number): Promise<FavoriteRow[]> {
  return listAllFavorites();
}

export async function createFavorite(
  data: CreateFavoriteData,
): Promise<FavoriteRow> {
  const id = nanoid();
  const createdAt = Date.now();
  const row = {
    id,
    userId: null as number | null,
    name: data.name,
    libraryId: data.libraryId,
    libraryItemId: data.libraryItemId,
    libraryItemName: data.libraryItemName,
    widthUnits: data.widthUnits,
    heightUnits: data.heightUnits,
    color: data.color,
    paramHash: data.paramHash ?? null,
    imageUrl: data.imageUrl,
    perspectiveImageUrl: data.perspectiveImageUrl ?? null,
    perspectiveImageUrl90: data.perspectiveImageUrl90 ?? null,
    perspectiveImageUrl180: data.perspectiveImageUrl180 ?? null,
    perspectiveImageUrl270: data.perspectiveImageUrl270 ?? null,
    customization: JSON.stringify(data.customization),
    createdAt,
  };
  await db.insert(favorites).values(row);
  return row;
}

export async function deleteFavorite(
  favoriteId: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(eq(favorites.id, favoriteId))
    .limit(1);
  if (existing.length === 0) return false;
  await db.delete(favorites).where(eq(favorites.id, favoriteId));
  return true;
}

export async function renameFavorite(
  favoriteId: string,
  name: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(eq(favorites.id, favoriteId))
    .limit(1);
  if (existing.length === 0) return false;
  await db.update(favorites).set({ name }).where(eq(favorites.id, favoriteId));
  return true;
}
