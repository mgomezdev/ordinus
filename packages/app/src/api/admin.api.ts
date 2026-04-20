import type { ApiLayout, ApiListResponse } from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function adminFetch<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = (errorBody?.error?.message as string | undefined) ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function fetchAdminUsers(accessToken: string): Promise<Array<{ id: number; username: string }>> {
  const result = await adminFetch<{ data: Array<{ id: number; username: string }> }>('/admin/users', accessToken);
  return result.data;
}

export async function fetchAdminUserLayouts(accessToken: string, userId: number): Promise<ApiLayout[]> {
  const result = await adminFetch<ApiListResponse<ApiLayout>>(`/admin/layouts?userId=${userId}`, accessToken);
  return result.data;
}
