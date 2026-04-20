import type { ApiResponse, ApiBomGeneration, BOMItem } from '@gridfinity/shared';
import { apiFetch, API_BASE_URL } from './apiClient';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function triggerBomGeneration(layoutId: number, bomItems: BOMItem[], accessToken: string): Promise<ApiBomGeneration> {
  const result = await apiFetch<ApiResponse<ApiBomGeneration>>(
    `/bom/generate/${layoutId}`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ bomItems }) },
    accessToken,
  );
  return result.data;
}

export async function getBomGeneration(layoutId: number, accessToken: string): Promise<ApiBomGeneration | null> {
  try {
    const result = await apiFetch<ApiResponse<ApiBomGeneration>>(
      `/bom/generation/${layoutId}`,
      { method: 'GET', headers: JSON_HEADERS },
      accessToken,
    );
    return result.data;
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
}

export function getFileDownloadUrl(layoutId: number, filename: string): string {
  return `${API_BASE_URL}/bom/generation/${layoutId}/files/${encodeURIComponent(filename)}`;
}
