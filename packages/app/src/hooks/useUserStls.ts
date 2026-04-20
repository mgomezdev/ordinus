import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchUserStls,
  uploadUserStl,
  updateUserStl,
  deleteUserStl,
  reprocessUserStl,
  replaceUserStlFile,
  fetchAdminUserStls,
  promoteUserStl,
} from '../api/userStls.api';
import type { ApiUserStl } from '@gridfinity/shared';

export const USER_STLS_QUERY_KEY = ['user-stls'] as const;
export const ADMIN_USER_STLS_QUERY_KEY = ['admin-user-stls'] as const;

const POLL_INTERVAL_MS = 3000;

function hasActiveJobs(items: ApiUserStl[]): boolean {
  return items.some((i) => i.status === 'pending' || i.status === 'processing');
}

export function useUserStlsQuery() {
  const { getAccessToken, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: USER_STLS_QUERY_KEY,
    queryFn: () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return fetchUserStls(token);
    },
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && hasActiveJobs(data) ? POLL_INTERVAL_MS : false;
    },
  });
}

export function useUploadUserStlMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return uploadUserStl(file, name, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useUpdateUserStlMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      gridX?: number | null;
      gridY?: number | null;
    }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return updateUserStl(id, data, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useDeleteUserStlMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return deleteUserStl(id, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useReprocessUserStlMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return reprocessUserStl(id, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useReplaceUserStlFileMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return replaceUserStlFile(id, file, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useAdminUserStlsQuery() {
  const { getAccessToken } = useAuth();
  return useQuery({
    queryKey: ADMIN_USER_STLS_QUERY_KEY,
    queryFn: () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return fetchAdminUserStls(token);
    },
  });
}

export function usePromoteUserStlMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return promoteUserStl(id, token);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_USER_STLS_QUERY_KEY });
    },
  });
}
