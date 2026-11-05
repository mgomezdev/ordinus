import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiLayoutDetail, CreateLayoutRequest } from '@gridfinity/shared';
import {
  fetchLayouts,
  createLayout,
  updateLayout,
  deleteLayoutApi,
  cloneLayout,
} from '../api/layouts.api';

export function useLayoutsQuery(customerId?: number | null) {
  return useQuery({
    queryKey: ['layouts', customerId ?? null],
    queryFn: async () => {
      const result = await fetchLayouts(undefined, undefined, customerId);
      return result.data;
    },
  });
}

export function useSaveLayoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateLayoutRequest): Promise<ApiLayoutDetail> => {
      return createLayout(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

export function useUpdateLayoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CreateLayoutRequest }): Promise<ApiLayoutDetail> => {
      return updateLayout(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

export function useDeleteLayoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      await deleteLayoutApi(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}

export function useCloneLayoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<ApiLayoutDetail> => {
      return cloneLayout(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layouts'] });
    },
  });
}
