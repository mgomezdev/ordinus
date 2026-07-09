import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listFavoritesApi,
  createFavoriteApi,
  deleteFavoriteApi,
  renameFavoriteApi,
} from '../api/favorites.api';
import type { FavoriteItem, BinCustomization, LibraryItem } from '../types/gridfinity';

const QUERY_KEY = ['favorites'] as const;

function binCustomizationsEqual(a: BinCustomization, b: BinCustomization): boolean {
  return (
    a.wallPatternEnabled === b.wallPatternEnabled &&
    a.wallPattern === b.wallPattern &&
    a.lipStyle === b.lipStyle &&
    a.fingerSlide === b.fingerSlide &&
    a.wallCutout === b.wallCutout &&
    a.height === b.height
  );
}

export function generateFavoriteName(libraryItemName: string, customization: BinCustomization): string {
  if (customization.wallPatternEnabled) {
    return `${libraryItemName} (${customization.wallPattern})`;
  }
  if (customization.lipStyle !== 'normal') {
    return `${libraryItemName} (${customization.lipStyle})`;
  }
  return libraryItemName;
}

export interface UseFavoritesResult {
  favorites: FavoriteItem[];
  isLoading: boolean;
  isFavorite: (itemId: string, customization: BinCustomization) => boolean;
  toggleFavorite: (
    libraryItem: LibraryItem,
    customization: BinCustomization,
    paramHash: string | null,
  ) => void;
  removeFavorite: (favoriteId: string) => void;
  renameFavorite: (favoriteId: string, name: string) => void;
}

export function useFavorites(): UseFavoritesResult {
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listFavoritesApi,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createFavoriteApi>[0]) => createFavoriteApi(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FavoriteItem[]>(QUERY_KEY);
      const optimistic: FavoriteItem = { ...data, id: `temp-${Date.now()}`, createdAt: Date.now() };
      queryClient.setQueryData<FavoriteItem[]>(QUERY_KEY, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFavoriteApi(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FavoriteItem[]>(QUERY_KEY);
      queryClient.setQueryData<FavoriteItem[]>(QUERY_KEY, (old) => (old ?? []).filter((f) => f.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFavoriteApi(id, name),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FavoriteItem[]>(QUERY_KEY);
      queryClient.setQueryData<FavoriteItem[]>(QUERY_KEY, (old) =>
        (old ?? []).map((f) => (f.id === id ? { ...f, name } : f)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const isFavorite = useCallback(
    (itemId: string, customization: BinCustomization): boolean => {
      const [libId, itemPartId] = itemId.split(':');
      return favorites.some(
        (f) =>
          f.libraryId === libId &&
          f.libraryItemId === itemPartId &&
          binCustomizationsEqual(f.customization, customization),
      );
    },
    [favorites],
  );

  const toggleFavorite = useCallback(
    (libraryItem: LibraryItem, customization: BinCustomization, paramHash: string | null) => {
      const [libId, itemPartId] = libraryItem.id.split(':');
      const existing = favorites.find(
        (f) =>
          f.libraryId === libId &&
          f.libraryItemId === itemPartId &&
          binCustomizationsEqual(f.customization, customization),
      );
      if (existing) {
        deleteMutation.mutate(existing.id);
      } else {
        createMutation.mutate({
          name: generateFavoriteName(libraryItem.name, customization),
          libraryId: libId,
          libraryItemId: itemPartId,
          libraryItemName: libraryItem.name,
          widthUnits: libraryItem.widthUnits,
          heightUnits: libraryItem.heightUnits,
          color: libraryItem.color,
          paramHash,
          imageUrl: libraryItem.imageUrl ?? '',
          perspectiveImageUrl: libraryItem.perspectiveImageUrl ?? null,
          perspectiveImageUrl90: libraryItem.perspectiveImageUrl90 ?? null,
          perspectiveImageUrl180: libraryItem.perspectiveImageUrl180 ?? null,
          perspectiveImageUrl270: libraryItem.perspectiveImageUrl270 ?? null,
          customization,
        });
      }
    },
    [favorites, createMutation, deleteMutation],
  );

  const removeFavorite = useCallback(
    (favoriteId: string) => deleteMutation.mutate(favoriteId),
    [deleteMutation],
  );

  const renameFavoriteCallback = useCallback(
    (favoriteId: string, name: string) => renameMutation.mutate({ id: favoriteId, name }),
    [renameMutation],
  );

  return {
    favorites,
    isLoading,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    renameFavorite: renameFavoriteCallback,
  };
}
