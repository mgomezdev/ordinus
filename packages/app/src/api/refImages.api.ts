import type { ApiResponse, ApiRefImage } from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function refImageFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export async function fetchRefImages(
  accessToken: string,
): Promise<ApiRefImage[]> {
  const result = await refImageFetch<{ data: ApiRefImage[] }>(
    '/ref-images',
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

  const result = await refImageFetch<ApiResponse<ApiRefImage>>(
    '/ref-images',
    accessToken,
    {
      method: 'POST',
      body: formData,
    },
  );
  return result.data;
}

export async function uploadGlobalRefImage(
  accessToken: string,
  file: File,
): Promise<ApiRefImage> {
  const formData = new FormData();
  formData.append('image', file);

  const result = await refImageFetch<ApiResponse<ApiRefImage>>(
    '/ref-images/global',
    accessToken,
    {
      method: 'POST',
      body: formData,
    },
  );
  return result.data;
}

export async function renameRefImage(
  accessToken: string,
  id: number,
  name: string,
): Promise<ApiRefImage> {
  const result = await refImageFetch<ApiResponse<ApiRefImage>>(
    `/ref-images/${id}`,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    },
  );
  return result.data;
}

export async function deleteRefImage(
  accessToken: string,
  id: number,
): Promise<void> {
  await refImageFetch<void>(
    `/ref-images/${id}`,
    accessToken,
    { method: 'DELETE' },
  );
}
