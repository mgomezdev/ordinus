import { useQuery } from '@tanstack/react-query';
import type { ApiLayout } from '@gridfinity/shared';
import { useAuth } from '../contexts/AuthContext';
import { fetchAdminUsers, fetchAdminUserLayouts } from '../api/admin.api';

export function useAdminUsersQuery() {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<Array<{ id: number; username: string }>> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return fetchAdminUsers(token);
    },
    enabled: isAuthenticated && isAdmin,
  });
}

export function useAdminUserLayoutsQuery(userId: number | null) {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return useQuery({
    queryKey: ['admin-user-layouts', userId],
    queryFn: async (): Promise<ApiLayout[]> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      if (userId === null) throw new Error('No userId');
      return fetchAdminUserLayouts(token, userId);
    },
    enabled: isAuthenticated && isAdmin && userId !== null,
  });
}
