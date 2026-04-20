import type {
  ApiResponse,
  ApiListResponse,
  ApiLayout,
  ApiLayoutDetail,
  CreateLayoutRequest,
  UpdateLayoutMetaRequest,
} from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function layoutFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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

export async function fetchLayouts(
  accessToken: string,
  cursor?: string,
  limit?: number,
): Promise<ApiListResponse<ApiLayout>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  const path = `/layouts${query ? `?${query}` : ''}`;

  return layoutFetch<ApiListResponse<ApiLayout>>(path, accessToken);
}

export async function fetchLayout(
  accessToken: string,
  id: number,
): Promise<ApiLayoutDetail> {
  const result = await layoutFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}`,
    accessToken,
  );
  return result.data;
}

export async function createLayout(
  accessToken: string,
  data: CreateLayoutRequest,
): Promise<ApiLayoutDetail> {
  const result = await layoutFetch<ApiResponse<ApiLayoutDetail>>(
    '/layouts',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
  return result.data;
}

export async function updateLayout(
  accessToken: string,
  id: number,
  data: CreateLayoutRequest,
): Promise<ApiLayoutDetail> {
  const result = await layoutFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
  return result.data;
}

export async function updateLayoutMeta(
  accessToken: string,
  id: number,
  data: UpdateLayoutMetaRequest,
): Promise<ApiLayout> {
  const result = await layoutFetch<ApiResponse<ApiLayout>>(
    `/layouts/${id}`,
    accessToken,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
  return result.data;
}

export async function deleteLayoutApi(
  accessToken: string,
  id: number,
): Promise<void> {
  await layoutFetch<void>(
    `/layouts/${id}`,
    accessToken,
    { method: 'DELETE' },
  );
}

export async function cloneLayout(
  accessToken: string,
  id: number,
): Promise<ApiLayoutDetail> {
  const result = await layoutFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}/clone`,
    accessToken,
    { method: 'POST' },
  );
  return result.data;
}

