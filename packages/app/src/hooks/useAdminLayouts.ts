import { useQuery } from '@tanstack/react-query';
import type { ApiLayout } from '@gridfinity/shared';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function adminFetch<T>(path: string, accessToken: string, options: RequestInit = {}): Promise<T> {
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
    const message = (errorBody as { error?: { message?: string } } | null)?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as T;
}

export function useAdminLayoutsQuery() {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return useQuery({
    queryKey: ['admin-layouts'],
    queryFn: async (): Promise<ApiLayout[]> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await adminFetch<{ data: ApiLayout[] }>('/admin/layouts', token);
      return result.data;
    },
    enabled: isAuthenticated && isAdmin,
  });
}
