import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import type { BinCustomization } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { favorites } from '../db/schema.js';

export interface FavoriteRow {
  id: string;
  userId: number;
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

export async function listFavorites(userId: number): Promise<FavoriteRow[]> {
  return db.select().from(favorites).where(eq(favorites.userId, userId));
}

export async function createFavorite(
  userId: number,
  data: CreateFavoriteData,
): Promise<FavoriteRow> {
  const id = nanoid();
  const createdAt = Date.now();
  const row = {
    id,
    userId,
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
  userId: number,
): Promise<boolean> {
  const result = await db
    .delete(favorites)
    .where(and(eq(favorites.id, favoriteId), eq(favorites.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}

export async function renameFavorite(
  favoriteId: string,
  userId: number,
  name: string,
): Promise<boolean> {
  const result = await db
    .update(favorites)
    .set({ name })
    .where(and(eq(favorites.id, favoriteId), eq(favorites.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}
