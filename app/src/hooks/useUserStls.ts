import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchUserStls,
  uploadUserStl,
  updateUserStl,
  deleteUserStl,
  reprocessUserStl,
  replaceUserStlFile,
} from '../api/userStls.api';
import type { ApiUserStl } from '@gridfinity/shared';

export const USER_STLS_QUERY_KEY = ['user-stls'] as const;

const POLL_INTERVAL_MS = 3000;

function hasActiveJobs(items: ApiUserStl[]): boolean {
  return items.some((i) => i.status === 'pending' || i.status === 'processing');
}

export function useUserStlsQuery() {
  return useQuery({
    queryKey: USER_STLS_QUERY_KEY,
    queryFn: fetchUserStls,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && hasActiveJobs(data) ? POLL_INTERVAL_MS : false;
    },
  });
}

export function useUploadUserStlMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name, opts }: { file: File; name: string; opts?: { gridX?: number; gridY?: number; gridZ?: number; visibility?: string } }) => {
      return uploadUserStl(file, name, opts);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useUpdateUserStlMutation() {
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
      return updateUserStl(id, data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useDeleteUserStlMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUserStl(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useReprocessUserStlMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reprocessUserStl(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}

export function useReplaceUserStlFileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => replaceUserStlFile(id, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USER_STLS_QUERY_KEY });
    },
  });
}
