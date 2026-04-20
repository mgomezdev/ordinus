import type {
  ApiResponse,
  ApiSharedProject,
  ApiSharedLayoutView,
} from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function shareFetch<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
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

export async function createShareLink(
  accessToken: string,
  layoutId: number,
  expiresInDays?: number,
): Promise<ApiSharedProject> {
  const result = await shareFetch<ApiResponse<ApiSharedProject>>(
    `/layouts/${layoutId}/share`,
    {
      method: 'POST',
      body: JSON.stringify(expiresInDays ? { expiresInDays } : {}),
    },
    accessToken,
  );
  return result.data;
}

export async function getSharedLayout(
  slug: string,
): Promise<ApiSharedLayoutView> {
  const result = await shareFetch<ApiResponse<ApiSharedLayoutView>>(
    `/shared/${slug}`,
  );
  return result.data;
}

export async function deleteShareLink(
  accessToken: string,
  shareId: number,
): Promise<void> {
  await shareFetch<void>(
    `/shared/${shareId}`,
    { method: 'DELETE' },
    accessToken,
  );
}

export async function getSharesByLayout(
  accessToken: string,
  layoutId: number,
): Promise<ApiSharedProject[]> {
  const result = await shareFetch<ApiResponse<ApiSharedProject[]>>(
    `/layouts/${layoutId}/shares`,
    {},
    accessToken,
  );
  return result.data;
}
