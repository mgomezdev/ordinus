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
  cursor?: string,
  limit?: number,
  customerId?: number | null,
): Promise<ApiListResponse<ApiLayout>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  if (customerId != null) params.set('customerId', String(customerId));
  const query = params.toString();
  const path = `/layouts${query ? `?${query}` : ''}`;

  return apiFetch<ApiListResponse<ApiLayout>>(path, { headers: JSON_HEADERS });
}

export async function fetchLayout(
  id: number,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}`,
    { headers: JSON_HEADERS },
  );
  return result.data;
}

export async function createLayout(
  data: CreateLayoutRequest,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    '/layouts',
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(data) },
  );
  return result.data;
}

export async function updateLayout(
  id: number,
  data: CreateLayoutRequest,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}`,
    { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(data) },
  );
  return result.data;
}

export async function updateLayoutMeta(
  id: number,
  data: UpdateLayoutMetaRequest,
): Promise<ApiLayout> {
  const result = await apiFetch<ApiResponse<ApiLayout>>(
    `/layouts/${id}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(data) },
  );
  return result.data;
}

export async function deleteLayoutApi(
  id: number,
): Promise<void> {
  await apiFetch<void>(
    `/layouts/${id}`,
    { method: 'DELETE', headers: JSON_HEADERS },
  );
}

export async function cloneLayout(
  id: number,
): Promise<ApiLayoutDetail> {
  const result = await apiFetch<ApiResponse<ApiLayoutDetail>>(
    `/layouts/${id}/clone`,
    { method: 'POST', headers: JSON_HEADERS },
  );
  return result.data;
}
