import type { ApiResponse, ApiRefImage } from '@gridfinity/shared';
import { apiFetch } from './apiClient';

export async function fetchRefImages(
  accessToken: string,
): Promise<ApiRefImage[]> {
  const result = await apiFetch<{ data: ApiRefImage[] }>(
    '/ref-images',
    {},
    accessToken,
  );
  return result.data;
}

export async function uploadRefImage(
  accessToken: string,
  file: File,
): Promise<ApiRefImage> {
  const formData = new FormData();
  formData.append('image', file);

  const result = await apiFetch<ApiResponse<ApiRefImage>>(
    '/ref-images',
    { method: 'POST', body: formData },
    accessToken,
  );
  return result.data;
}

export async function uploadGlobalRefImage(
  accessToken: string,
  file: File,
): Promise<ApiRefImage> {
  const formData = new FormData();
  formData.append('image', file);

  const result = await apiFetch<ApiResponse<ApiRefImage>>(
    '/ref-images/global',
    { method: 'POST', body: formData },
    accessToken,
  );
  return result.data;
}

export async function renameRefImage(
  accessToken: string,
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
    accessToken,
  );
  return result.data;
}

export async function deleteRefImage(
  accessToken: string,
  id: number,
): Promise<void> {
  await apiFetch<void>(
    `/ref-images/${id}`,
    { method: 'DELETE' },
    accessToken,
  );
}
