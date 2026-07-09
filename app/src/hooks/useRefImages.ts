import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiRefImage } from '@gridfinity/shared';
import {
  fetchRefImages,
  uploadRefImage,
  uploadGlobalRefImage,
  renameRefImage,
  deleteRefImage,
} from '../api/refImages.api';

export function useRefImagesQuery() {
  return useQuery({
    queryKey: ['ref-images'],
    queryFn: fetchRefImages,
  });
}

export function useUploadRefImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<ApiRefImage> => {
      return uploadRefImage(file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}

export function useUploadGlobalRefImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<ApiRefImage> => {
      return uploadGlobalRefImage(file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}

export function useRenameRefImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }): Promise<ApiRefImage> => {
      return renameRefImage(id, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}

export function useDeleteRefImageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      await deleteRefImage(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}
