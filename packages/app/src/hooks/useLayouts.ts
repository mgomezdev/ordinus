import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiLayout, ApiLayoutDetail, CreateLayoutRequest, UpdateLayoutMetaRequest } from '@gridfinity/shared';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchLayouts,
  fetchLayout,
  createLayout,
  updateLayout,
  updateLayoutMeta,
  deleteLayoutApi,
  cloneLayout,
} from '../api/layouts.api';

export function useLayoutsQuery() {
  const { getAccessToken, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['layouts'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const result = await fetchLayouts(token);
      return result.data;
    },
    enabled: isAuthenticated,
  });
}

export function useLayoutQuery(id: number | null) {
  const { getAccessToken, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['layouts', id],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      if (id === null) throw new Error('No layout ID');
      return fetchLayout(token, id);
    },
    enabled: isAuthenticated && id !== null,
  });
}

export function useSaveLayoutMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateLayoutRequest): Promise<ApiLayoutDetail> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return createLayout(token, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-layouts'] });
    },
  });
}

export function useUpdateLayoutMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CreateLayoutRequest }): Promise<ApiLayoutDetail> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return updateLayout(token, id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-layouts'] });
    },
  });
}

export function useUpdateLayoutMetaMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateLayoutMetaRequest }): Promise<ApiLayout> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return updateLayoutMeta(token, id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

export function useDeleteLayoutMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await deleteLayoutApi(token, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

export function useCloneLayoutMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<ApiLayoutDetail> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return cloneLayout(token, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

