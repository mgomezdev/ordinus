import type {
  ApiResponse,
  ApiListResponse,
  ApiLayout,
  ApiLayoutDetail,
  CreateLayoutRequest,
  UpdateLayoutMetaRequest,
} from '@gridfinity/shared';
import { apiFetch } from './apiClient';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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

  return apiFetch<ApiListResponse<ApiLayout>>(path, { headers: JSON_HEADERS }, accessToken);
}

export async function fetchLayout(
  accessToken: string,
  id: number,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}`,
    { headers: JSON_HEADERS },
    accessToken,
  );
  return result.data;
}

export async function createLayout(
  accessToken: string,
  data: CreateLayoutRequest,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    '/layouts',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(data) },
    accessToken,
  );
  return result.data;
}

export async function updateLayout(
  accessToken: string,
  id: number,
  data: CreateLayoutRequest,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}`,
    { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(data) },
    accessToken,
  );
  return result.data;
}

export async function updateLayoutMeta(
  accessToken: string,
  id: number,
  data: UpdateLayoutMetaRequest,
): Promise<ApiLayout> {
  const result = await apiFetch<ApiResponse<ApiLayout>>(
    `/layouts/${id}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(data) },
    accessToken,
  );
  return result.data;
}

export async function deleteLayoutApi(
  accessToken: string,
  id: number,
): Promise<void> {
  await apiFetch<void>(
    `/layouts/${id}`,
    { method: 'DELETE', headers: JSON_HEADERS },
    accessToken,
  );
}

export async function cloneLayout(
  accessToken: string,
  id: number,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}/clone`,
    { method: 'POST', headers: JSON_HEADERS },
    accessToken,
  );
  return result.data;
}
