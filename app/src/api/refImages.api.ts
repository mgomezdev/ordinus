import type { ApiResponse, ApiRefImage } from '@gridfinity/shared';
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
