import type { ApiLayout, ApiListResponse } from '@gridfinity/shared';
import { apiFetch } from './apiClient';

export async function fetchAdminUsers(accessToken: string): Promise<Array<{ id: number; username: string }>> {
  const result = await apiFetch<{ data: Array<{ id: number; username: string }> }>('/admin/users', {}, accessToken);
  return result.data;
}

export async function fetchAdminUserLayouts(accessToken: string, userId: number): Promise<ApiLayout[]> {
  const result = await apiFetch<ApiListResponse<ApiLayout>>(`/admin/layouts?userId=${userId}`, {}, accessToken);
  return result.data;
}
