import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { useFavorites } from './useFavorites';
import type { FavoriteItem, BinCustomization } from '../types/gridfinity';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockRename = vi.fn();

vi.mock('../api/favorites.api', () => ({
  listFavoritesApi: (...args: unknown[]) => mockList(...args),
  createFavoriteApi: (...args: unknown[]) => mockCreate(...args),
  deleteFavoriteApi: (...args: unknown[]) => mockDelete(...args),
  renameFavoriteApi: (...args: unknown[]) => mockRename(...args),
}));

const defaultCustomization: BinCustomization = {
  wallPatternEnabled: false, wallPattern: 'grid',
  lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4,
};

const voronoiCustomization: BinCustomization = {
  wallPatternEnabled: true, wallPattern: 'voronoi',
  lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4,
};

const mockFavorite: FavoriteItem = {
  id: 'fav1', name: 'Bin 2×3×7 (voronoi)', createdAt: 1000,
  libraryId: 'bins_standard', libraryItemId: 'bin_2x3x7', libraryItemName: 'Bin 2×3×7',
  widthUnits: 2, heightUnits: 3, color: '#3B82F6',
  paramHash: null, imageUrl: '/img.png',
  perspectiveImageUrl: null, perspectiveImageUrl90: null,
  perspectiveImageUrl180: null, perspectiveImageUrl270: null,
  customization: voronoiCustomization,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([mockFavorite]);
    mockCreate.mockResolvedValue({ ...mockFavorite, id: 'fav2' });
    mockDelete.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
  });

  it('returns favorites from API', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.favorites[0].id).toBe('fav1');
  });

  it('isFavorite returns true for matching itemId + customization', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFavorite('bins_standard:bin_2x3x7', voronoiCustomization)).toBe(true);
    expect(result.current.isFavorite('bins_standard:bin_2x3x7', defaultCustomization)).toBe(false);
  });

  it('isFavorite returns false for different libraryItemId', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFavorite('bins_standard:bin_1x1x5', voronoiCustomization)).toBe(false);
  });

  it('returns favorites as array', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => !result.current.isLoading);
    expect(Array.isArray(result.current.favorites)).toBe(true);
  });
});

// Suppress unused import warning — act is used indirectly via waitFor
void act;

describe('useFavorites — custom bins', () => {
  const customSpec = { width: 2.5, depth: 1.5, height: 3.5, overrides: { magnet_diameter: 6.5 } };
  const customItem = {
    id: 'custom:custom-abc123', libraryId: 'custom', name: 'Custom 2.5×1.5×3.5',
    widthUnits: 2.5, heightUnits: 1.5, color: '#3B82F6', categories: ['custom'], paramHash: 'a'.repeat(64), customSpec,
  };
  const customFavorite: FavoriteItem = {
    ...mockFavorite, id: 'fav-custom', name: customItem.name, libraryId: 'custom', libraryItemId: 'custom-abc123',
    widthUnits: 2.5, heightUnits: 1.5, paramHash: 'a'.repeat(64), imageUrl: '', customization: defaultCustomization, customSpec,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue(customFavorite);
    mockDelete.mockResolvedValue(undefined);
  });

  it('creates a favorite carrying the custom spec and half-unit size', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleFavorite(customItem, defaultCustomization, customItem.paramHash));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      name: customItem.name, libraryId: 'custom', libraryItemId: 'custom-abc123',
      widthUnits: 2.5, heightUnits: 1.5, paramHash: customItem.paramHash, customSpec,
    });
  });

  it('matches a custom favorite by id regardless of customization', async () => {
    mockList.mockResolvedValue([customFavorite]);
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));

    expect(result.current.isFavorite(customItem.id, voronoiCustomization)).toBe(true);
    expect(result.current.isFavorite('custom:custom-other', defaultCustomization)).toBe(false);
  });

  it('removes an existing custom favorite when toggled again', async () => {
    mockList.mockResolvedValue([customFavorite]);
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.favorites).toHaveLength(1));

    act(() => result.current.toggleFavorite(customItem, voronoiCustomization, customItem.paramHash));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('fav-custom'));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
