import { useQuery } from '@tanstack/react-query';
import type { ApiLayout, ApiResponse } from '@gridfinity/shared';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/apiClient';

export function useAdminLayoutsQuery() {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return useQuery({
    queryKey: ['admin-layouts'],
    queryFn: async (): Promise<ApiLayout[]> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await apiFetch<ApiResponse<ApiLayout[]>>('/admin/layouts', {}, token);
      return result.data;
    },
    enabled: isAuthenticated && isAdmin,
  });
}
