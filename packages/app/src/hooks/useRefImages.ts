import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApiRefImage } from '@gridfinity/shared';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchRefImages,
  uploadRefImage,
  uploadGlobalRefImage,
  renameRefImage,
  deleteRefImage,
} from '../api/refImages.api';

export function useRefImagesQuery() {
  const { getAccessToken, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['ref-images'],
    queryFn: async () => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return fetchRefImages(token);
    },
    enabled: isAuthenticated,
  });
}

export function useUploadRefImageMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<ApiRefImage> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return uploadRefImage(token, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}

export function useUploadGlobalRefImageMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<ApiRefImage> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return uploadGlobalRefImage(token, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}

export function useRenameRefImageMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }): Promise<ApiRefImage> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return renameRefImage(token, id, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}

export function useDeleteRefImageMutation() {
  const { getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      await deleteRefImage(token, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ref-images'] });
    },
  });
}
