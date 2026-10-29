import type { ApiResponse, ApiRefImage, ApiRefImageWarp, Quad } from '@gridfinity/shared';
import { apiFetch } from './apiClient';

export async function fetchRefImages(): Promise<ApiRefImage[]> {
  const result = await apiFetch<{ data: ApiRefImage[] }>('/ref-images', {});
  return result.data;
}

async function uploadToEndpoint(endpoint: string, file: File): Promise<ApiRefImage> {
  const formData = new FormData();
  formData.append('image', file);
  const result = await apiFetch<ApiResponse<ApiRefImage>>(endpoint, { method: 'POST', body: formData });
  return result.data;
}

export const uploadRefImage = (file: File) => uploadToEndpoint('/ref-images', file);

export const uploadGlobalRefImage = (file: File) => uploadToEndpoint('/ref-images/global', file);

export async function renameRefImage(
  id: number,
  name: string,
): Promise<ApiRefImage> {
  const result = await apiFetch<ApiResponse<ApiRefImage>>(
    `/ref-images/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
  return result.data;
}

export async function deleteRefImage(id: number): Promise<void> {
  await apiFetch<void>(`/ref-images/${id}`, { method: 'DELETE' });
}

export async function warpRefImage(
  id: number,
  corners: Quad,
  aspectRatio: number,
): Promise<ApiRefImageWarp> {
  const result = await apiFetch<ApiResponse<ApiRefImageWarp>>(
    `/ref-images/${id}/warp`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ corners, aspectRatio }),
    },
  );
  return result.data;
}

/** Deletes a warped image unless a saved layout still uses it. */
export async function deleteWarpedImage(warpPath: string): Promise<boolean> {
  const filename = warpPath.split('/').pop() ?? '';
  const result = await apiFetch<ApiResponse<{ deleted: boolean }>>(
    `/ref-images/warps/${encodeURIComponent(filename)}`,
    { method: 'DELETE' },
  );
  return result.data.deleted;
}
