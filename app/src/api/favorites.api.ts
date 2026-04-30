import type { FavoriteItem, BinCustomization } from '../types/gridfinity';
import { apiFetch } from './apiClient';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

interface FavoritesListResponse {
  data: FavoriteItem[];
}

interface FavoriteResponse {
  data: FavoriteItem;
}

export interface CreateFavoriteRequest {
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
  customization: BinCustomization;
}

export async function listFavoritesApi(token: string): Promise<FavoriteItem[]> {
  const res = await apiFetch<FavoritesListResponse>(
    '/favorites',
    { headers: JSON_HEADERS },
    token,
  );
  return res.data;
}

export async function createFavoriteApi(
  data: CreateFavoriteRequest,
  token: string,
): Promise<FavoriteItem> {
  const res = await apiFetch<FavoriteResponse>(
    '/favorites',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(data) },
    token,
  );
  return res.data;
}

export async function deleteFavoriteApi(id: string, token: string): Promise<void> {
  await apiFetch<void>(`/favorites/${id}`, { method: 'DELETE', headers: JSON_HEADERS }, token);
}

export async function renameFavoriteApi(id: string, name: string, token: string): Promise<void> {
  await apiFetch<void>(
    `/favorites/${id}/name`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ name }) },
    token,
  );
}
