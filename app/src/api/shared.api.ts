import type {
  ApiResponse,
  ApiSharedProject,
  ApiSharedLayoutView,
} from '@gridfinity/shared';
import { apiFetch } from './apiClient';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function createShareLink(
  accessToken: string,
  layoutId: number,
  expiresInDays?: number,
): Promise<ApiSharedProject> {
  const result = await apiFetch<ApiResponse<ApiSharedProject>>(
    `/layouts/${layoutId}/share`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(expiresInDays ? { expiresInDays } : {}),
    },
    accessToken,
  );
  return result.data;
}

export async function getSharedLayout(
  slug: string,
): Promise<ApiSharedLayoutView> {
  const result = await apiFetch<ApiResponse<ApiSharedLayoutView>>(
    `/shared/${slug}`,
    { headers: JSON_HEADERS },
  );
  return result.data;
}

export async function deleteShareLink(
  accessToken: string,
  shareId: number,
): Promise<void> {
  await apiFetch<void>(
    `/shared/${shareId}`,
    { method: 'DELETE', headers: JSON_HEADERS },
    accessToken,
  );
}

export async function getSharesByLayout(
  accessToken: string,
  layoutId: number,
): Promise<ApiSharedProject[]> {
  const result = await apiFetch<ApiResponse<ApiSharedProject[]>>(
    `/layouts/${layoutId}/shares`,
    { headers: JSON_HEADERS },
    accessToken,
  );
  return result.data;
}
