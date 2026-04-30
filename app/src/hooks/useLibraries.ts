import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Library } from '../types/gridfinity';
import { useDataSource } from '../contexts/DataSourceContext';

export interface UseLibrariesResult {
  availableLibraries: Library[];
  isLoading: boolean;
  error: Error | null;
  refreshLibraries: () => Promise<void>;
}

/**
 * Hook for loading all available libraries.
 * All libraries are always active — selection is not user-configurable.
 */
export function useLibraries(): UseLibrariesResult {
  const adapter = useDataSource();
  const queryClient = useQueryClient();

  const { data: libraryInfos, isLoading, error: queryError } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => adapter.getLibraries(),
  });

  const availableLibraries: Library[] = (libraryInfos ?? []).map((info) => ({
    id: info.id,
    name: info.name,
    path: info.path,
    isEnabled: true,
    itemCount: info.itemCount,
  }));

  const refreshLibraries = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['libraries'] });
  }, [queryClient]);

  return {
    availableLibraries,
    isLoading,
    error: queryError ?? null,
    refreshLibraries,
  };
}
