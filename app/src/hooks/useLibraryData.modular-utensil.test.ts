import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLibraryData } from './useLibraryData';
import type { LibraryItem } from '../types/gridfinity';
import type { DataSourceAdapter } from '../api/adapters/types';
import { createTestWrapper } from '../test/testWrapper';

vi.mock('./useUserStls.js', () => ({
  useUserStlsQuery: () => ({ data: [], isLoading: false }),
}));

describe('useLibraryData - Modular Utensil Library', () => {
  const mockModularUtensilItems: LibraryItem[] = [
    {
      id: '1x1-blank',
      name: '1x1 -blank',
      widthUnits: 1,
      heightUnits: 1,
      color: '#10B981',
      categories: ['modular', 'utensil'],
      imageUrl: '-blank 1x1.png',
    },
    {
      id: '1x1-endcap',
      name: '1x1 -endcap',
      widthUnits: 1,
      heightUnits: 1,
      color: '#10B981',
      categories: ['modular', 'utensil'],
      imageUrl: '-endcap 1x1.png',
    },
    {
      id: '2x2-endcap',
      name: '2x2 -endcap',
      widthUnits: 2,
      heightUnits: 2,
      color: '#10B981',
      categories: ['modular', 'utensil'],
      imageUrl: '-endcap 2x2.png',
    },
  ];

  const selectedLibrary = ['modular-utensil'];

  function createAdapter(): DataSourceAdapter {
    return {
      async getLibraries() {
        return [
          {
            id: 'modular-utensil',
            name: 'modular-utensil',
            path: '/libraries/modular-utensil/index.json',
            itemCount: mockModularUtensilItems.length,
          },
        ];
      },
      async getLibraryItems(libraryId: string) {
        if (libraryId === 'modular-utensil') return mockModularUtensilItems;
        return [];
      },
      resolveImageUrl(libraryId: string, imagePath: string) {
        if (imagePath.startsWith('/libraries/') || imagePath.startsWith('http')) {
          return imagePath;
        }
        return `/libraries/${libraryId}/${imagePath}`;
      },
    };
  }

  it('should load modular-utensil library', async () => {
    const adapter = createAdapter();
    const wrapper = createTestWrapper(adapter);

    const { result } = renderHook(() => useLibraryData(selectedLibrary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.items[0].id).toBe('modular-utensil:1x1-blank');
    expect(result.current.items[1].id).toBe('modular-utensil:1x1-endcap');
    expect(result.current.items[2].id).toBe('modular-utensil:2x2-endcap');
  });

  it('should resolve image paths for modular-utensil library items', async () => {
    const adapter = createAdapter();
    const wrapper = createTestWrapper(adapter);

    const { result } = renderHook(() => useLibraryData(selectedLibrary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Check that relative image paths are resolved to library-specific paths
    expect(result.current.items[0].imageUrl).toBe('/libraries/modular-utensil/-blank 1x1.png');
    expect(result.current.items[1].imageUrl).toBe('/libraries/modular-utensil/-endcap 1x1.png');
    expect(result.current.items[2].imageUrl).toBe('/libraries/modular-utensil/-endcap 2x2.png');
  });

  it('should handle items with special characters in filenames', async () => {
    const specialItems: LibraryItem[] = [
      {
        id: '1x1-blank',
        name: '1x1 -blank',
        widthUnits: 1,
        heightUnits: 1,
        color: '#10B981',
        categories: [],
        imageUrl: '-blank 1x1.png', // Filename starts with hyphen
      },
    ];

    const adapter: DataSourceAdapter = {
      async getLibraries() {
        return [
          {
            id: 'modular-utensil',
            name: 'modular-utensil',
            path: '/libraries/modular-utensil/index.json',
            itemCount: 1,
          },
        ];
      },
      async getLibraryItems(libraryId: string) {
        if (libraryId === 'modular-utensil') return specialItems;
        return [];
      },
      resolveImageUrl(libraryId: string, imagePath: string) {
        if (imagePath.startsWith('/libraries/') || imagePath.startsWith('http')) {
          return imagePath;
        }
        return `/libraries/${libraryId}/${imagePath}`;
      },
    };
    const wrapper = createTestWrapper(adapter);

    const { result } = renderHook(() => useLibraryData(selectedLibrary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should handle filenames starting with hyphen
    expect(result.current.items[0].imageUrl).toBe('/libraries/modular-utensil/-blank 1x1.png');
  });

  it('should preserve green color (#10B981) for modular-utensil items', async () => {
    const adapter = createAdapter();
    const wrapper = createTestWrapper(adapter);

    const { result } = renderHook(() => useLibraryData(selectedLibrary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // All items should have the green color
    result.current.items.forEach((item) => {
      expect(item.color).toBe('#10B981');
    });
  });

  it('should include modular and utensil categories', async () => {
    const adapter = createAdapter();
    const wrapper = createTestWrapper(adapter);

    const { result } = renderHook(() => useLibraryData(selectedLibrary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // All items should have modular and utensil categories
    result.current.items.forEach((item) => {
      expect(Array.isArray(item.categories)).toBe(true);
      expect(item.categories).toContain('modular');
      expect(item.categories).toContain('utensil');
      expect(item.categories).toHaveLength(2);
    });
  });

  it('should filter items by modular category', async () => {
    const adapter = createAdapter();
    const wrapper = createTestWrapper(adapter);

    const { result } = renderHook(() => useLibraryData(selectedLibrary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const modularItems = result.current.getItemsByCategory('modular');
    expect(modularItems).toHaveLength(3);
    expect(modularItems.every((item) => item.categories.includes('modular'))).toBe(true);
  });

  it('should filter items by utensil category', async () => {
    const adapter = createAdapter();
    const wrapper = createTestWrapper(adapter);

    const { result } = renderHook(() => useLibraryData(selectedLibrary), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const utensilItems = result.current.getItemsByCategory('utensil');
    expect(utensilItems).toHaveLength(3);
    expect(utensilItems.every((item) => item.categories.includes('utensil'))).toBe(true);
  });
});
