import { useCallback, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { LibraryItem, LibraryMeta } from '../types/gridfinity';
import type { ApiUserStl } from '@gridfinity/shared';
import { useDataSource } from '../contexts/DataSourceContext';
import { prefixItemId } from '../utils/libraryHelpers';
import { useUserStlsQuery, usePublicUserStlsQuery } from './useUserStls';
import { getUserStlImageUrl } from '../api/userStls.api';

function userStlToLibraryItem(item: ApiUserStl): LibraryItem {
  return {
    id: `user-stl:${item.id}`,
    libraryId: 'user-stl',
    name: item.name,
    widthUnits: item.gridX ?? 1,
    heightUnits: item.gridY ?? 1,
    color: '#F97316',
    categories: ['user-upload'],
    imageUrl: item.imageUrl ? getUserStlImageUrl(item.id, item.imageUrl) : undefined,
    perspectiveImageUrl: item.perspImageUrls[0]
      ? getUserStlImageUrl(item.id, item.perspImageUrls[0])
      : undefined,
  };
}

interface UseLibraryDataResult {
  items: LibraryItem[];
  isLoading: boolean;
  error: Error | null;
  getItemById: (prefixedId: string) => LibraryItem | undefined;
  getItemsByCategory: (category: string) => LibraryItem[];
  getItemsByLibrary: (libraryId: string) => LibraryItem[];
  refreshLibrary: () => Promise<void>;
  getLibraryMeta: (libraryId: string) => Promise<LibraryMeta>;
}

/**
 * Hook for loading library items from multiple library sources
 *
 * @param selectedLibraryIds - Array of library IDs to load (e.g., ['bins_standard', 'simple-utensils'])
 * @returns Library items with prefixed IDs and resolved image paths
 */
export function useLibraryData(
  selectedLibraryIds: string[]
): UseLibraryDataResult {
  const adapter = useDataSource();
  const queryClient = useQueryClient();

  // Use useQueries to fetch items for each selected library in parallel
  const queries = useQueries({
    queries: selectedLibraryIds.map((libraryId) => ({
      queryKey: ['library-items', libraryId],
      queryFn: () => adapter.getLibraryItems(libraryId),
      select: (rawItems: LibraryItem[]) =>
        rawItems.map((item) => ({
          ...item,
          id: prefixItemId(libraryId, item.id),
          imageUrl: item.imageUrl
            ? adapter.resolveImageUrl(libraryId, item.imageUrl)
            : undefined,
          perspectiveImageUrl: item.perspectiveImageUrl
            ? adapter.resolveImageUrl(libraryId, item.perspectiveImageUrl)
            : undefined,
        })),
    })),
  });

  const { data: userStls = [] } = useUserStlsQuery();
  const userStlItems = useMemo(
    () => userStls.filter((s) => s.status === 'ready').map(userStlToLibraryItem),
    [userStls]
  );

  const { data: publicStls = [] } = usePublicUserStlsQuery();
  const publicStlItems = useMemo(
    () => publicStls.filter((s) => s.status === 'ready').map(userStlToLibraryItem),
    [publicStls]
  );

  // Combine results from all queries; own items take priority over community items
  const items = useMemo(() => {
    const ownIds = new Set(userStlItems.map((i) => i.id));
    const communityItems = publicStlItems.filter((i) => !ownIds.has(i.id));
    return [...queries.flatMap((q) => q.data ?? []), ...userStlItems, ...communityItems];
  }, [queries, userStlItems, publicStlItems]);

  const isLoading = queries.some((q) => q.isLoading);

  const error = useMemo(() => {
    const firstError = queries.find((q) => q.error)?.error;
    return firstError instanceof Error ? firstError : firstError ? new Error(String(firstError)) : null;
  }, [queries]);

  const getItemById = useCallback(
    (prefixedId: string): LibraryItem | undefined => {
      return items.find((item) => item.id === prefixedId);
    },
    [items]
  );

  const getItemsByCategory = useCallback(
    (category: string): LibraryItem[] => {
      return items.filter((item) => item.categories.includes(category));
    },
    [items]
  );

  const getItemsByLibrary = useCallback(
    (libraryId: string): LibraryItem[] => {
      const prefix = `${libraryId}:`;
      return items.filter((item) => item.id.startsWith(prefix));
    },
    [items]
  );

  const refreshLibrary = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['library-items'] });
  }, [queryClient]);

  const getLibraryMeta = useCallback(
    (libraryId: string): Promise<LibraryMeta> => {
      return adapter.getLibraryMeta(libraryId);
    },
    [adapter]
  );

  return {
    items,
    isLoading,
    error,
    getItemById,
    getItemsByCategory,
    getItemsByLibrary,
    refreshLibrary,
    getLibraryMeta,
  };
}
