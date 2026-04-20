import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLibraryData } from './useLibraryData';
import type { LibraryItem, LibraryMeta } from '../types/gridfinity';
import type { DataSourceAdapter } from '../api/adapters/types';
import { createTestWrapper, createTestWrapperWithAdapter } from '../test/testWrapper';

vi.mock('./useUserStls.js', () => ({
  useUserStlsQuery: () => ({ data: [], isLoading: false }),
}));

describe('useLibraryData', () => {
  const mockDefaultItems: LibraryItem[] = [
    { id: 'bin-1x1', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#3B82F6', categories: ['bin'] },
    { id: 'bin-2x2', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#3B82F6', categories: ['bin'] },
  ];

  const mockCommunityItems: LibraryItem[] = [
    { id: 'custom-1x1', name: 'Custom 1x1', widthUnits: 1, heightUnits: 1, color: '#EF4444', categories: ['custom'] },
  ];

  // Stable array references for tests
  const singleLibrary = ['bins_standard'];
  const multipleLibraries = ['bins_standard', 'community'];
  const emptyLibraries: string[] = [];

  function createAdapter(
    itemsByLibrary: Record<string, LibraryItem[]>,
    options?: { failFor?: string[]; metaByLibrary?: Record<string, LibraryMeta> }
  ): DataSourceAdapter {
    return {
      async getLibraries() {
        return Object.keys(itemsByLibrary).map((id) => ({
          id,
          name: id,
          path: `/libraries/${id}/index.json`,
          itemCount: itemsByLibrary[id].length,
        }));
      },
      async getLibraryItems(libraryId: string) {
        if (options?.failFor?.includes(libraryId)) {
          throw new Error(`Failed to fetch ${libraryId}: Server Error`);
        }
        return itemsByLibrary[libraryId] ?? [];
      },
      async getLibraryMeta(libraryId: string): Promise<LibraryMeta> {
        return options?.metaByLibrary?.[libraryId] ?? { customizableFields: [], customizationDefaults: {} };
      },
      resolveImageUrl(libraryId: string, imagePath: string) {
        if (imagePath.startsWith('/libraries/') || imagePath.startsWith('http')) {
          return imagePath;
        }
        return `/libraries/${libraryId}/${imagePath}`;
      },
    };
  }

  describe('Multi-Library Loading', () => {
    it('should load single library', async () => {
      const adapter = createAdapter({ bins_standard: mockDefaultItems });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items[0].id).toBe('bins_standard:bin-1x1');
      expect(result.current.items[1].id).toBe('bins_standard:bin-2x2');
    });

    it('should load multiple libraries in parallel', async () => {
      const adapter = createAdapter({
        bins_standard: mockDefaultItems,
        community: mockCommunityItems,
      });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(multipleLibraries), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toHaveLength(3);
      expect(result.current.items.map((i) => i.id)).toContain('bins_standard:bin-1x1');
      expect(result.current.items.map((i) => i.id)).toContain('community:custom-1x1');
    });

    it('should prefix item IDs with library name', async () => {
      const adapter = createAdapter({ bins_standard: mockDefaultItems });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      result.current.items.forEach((item) => {
        expect(item.id).toMatch(/^bins_standard:/);
      });
    });

    it('should resolve image paths to library-specific directories', async () => {
      const itemsWithImages: LibraryItem[] = [
        {
          id: 'bin-1x1',
          name: '1x1 Bin',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'bin-1x1.png',
        },
      ];

      const adapter = createAdapter({ bins_standard: itemsWithImages });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items[0].imageUrl).toBe('/libraries/bins_standard/bin-1x1.png');
    });

    it('should resolve perspectiveImageUrl paths', async () => {
      const itemsWithPerspective: LibraryItem[] = [
        {
          id: 'bin-1x1',
          name: '1x1 Bin',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'bin-1x1.png',
          perspectiveImageUrl: 'bin-1x1-perspective.png',
        },
      ];

      const adapter = createAdapter({ bins_standard: itemsWithPerspective });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items[0].perspectiveImageUrl).toBe('/libraries/bins_standard/bin-1x1-perspective.png');
    });

    it('should leave perspectiveImageUrl undefined when not present', async () => {
      const itemsWithoutPerspective: LibraryItem[] = [
        {
          id: 'bin-1x1',
          name: '1x1 Bin',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'bin-1x1.png',
        },
      ];

      const adapter = createAdapter({ bins_standard: itemsWithoutPerspective });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items[0].perspectiveImageUrl).toBeUndefined();
    });

    it('should maintain backward compatibility with absolute paths', async () => {
      const itemsWithAbsolutePaths: LibraryItem[] = [
        {
          id: 'bin-1x1',
          name: '1x1 Bin',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: '/libraries/bins_standard/images/bin-1x1.png',
        },
      ];

      const adapter = createAdapter({ bins_standard: itemsWithAbsolutePaths });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should pass through unchanged
      expect(result.current.items[0].imageUrl).toBe('/libraries/bins_standard/images/bin-1x1.png');
    });

    it('should handle empty library selection', async () => {
      const adapter = createAdapter({});
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(emptyLibraries), {
        wrapper,
      });

      // With no library IDs, useQueries creates zero queries, so isLoading should be false
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const adapter = createAdapter({}, { failFor: ['bins_standard'] });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // With TanStack Query, a failed query results in error state
      expect(result.current.error).toBeInstanceOf(Error);
    });

    it('should skip libraries not in adapter (returns empty)', async () => {
      const adapter = createAdapter({ bins_standard: mockDefaultItems });
      const wrapper = createTestWrapper(adapter);
      const nonExistentLibrary = ['non-existent'];

      const { result } = renderHook(() => useLibraryData(nonExistentLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toEqual([]);
    });

    it('should handle partial failures (some libraries load, others fail)', async () => {
      const adapter = createAdapter(
        { bins_standard: mockDefaultItems, community: mockCommunityItems },
        { failFor: ['community'] }
      );
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(multipleLibraries), {
        wrapper,
      });

      await waitFor(() => {
        // Wait for all queries to settle
        const allSettled = result.current.items.length > 0 || result.current.error !== null;
        expect(allSettled).toBe(true);
      });

      // Default library items should still load
      expect(result.current.items.length).toBeGreaterThanOrEqual(2);
      expect(result.current.items[0].id).toBe('bins_standard:bin-1x1');
    });
  });

  describe('Helper Methods', () => {
    it('getItemById should find item by prefixed ID', async () => {
      const adapter = createAdapter({ bins_standard: mockDefaultItems });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const item = result.current.getItemById('bins_standard:bin-1x1');
      expect(item).toBeDefined();
      expect(item?.name).toBe('1x1 Bin');
    });

    it('getItemById should return undefined for non-existent item', async () => {
      const adapter = createAdapter({ bins_standard: mockDefaultItems });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const item = result.current.getItemById('non-existent');
      expect(item).toBeUndefined();
    });

    it('getItemsByCategory should filter by category', async () => {
      const adapter = createAdapter({ bins_standard: mockDefaultItems });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const binItems = result.current.getItemsByCategory('bin');
      expect(binItems).toHaveLength(2);
      expect(binItems.every((item) => item.categories.includes('bin'))).toBe(true);
    });

    it('getItemsByLibrary should filter by library ID', async () => {
      const adapter = createAdapter({
        bins_standard: mockDefaultItems,
        community: mockCommunityItems,
      });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(multipleLibraries), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const defaultItems = result.current.getItemsByLibrary('bins_standard');
      expect(defaultItems).toHaveLength(2);
      expect(defaultItems.every((item) => item.id.startsWith('bins_standard:'))).toBe(true);

      const communityItems = result.current.getItemsByLibrary('community');
      expect(communityItems).toHaveLength(1);
      expect(communityItems[0].id).toBe('community:custom-1x1');
    });
  });

  describe('Refresh', () => {
    it('should reload libraries when refreshLibrary is called', async () => {
      let callCount = 0;
      const adapter: DataSourceAdapter = {
        async getLibraries() {
          return [{ id: 'bins_standard', name: 'bins_standard', path: '/libraries/bins_standard/index.json' }];
        },
        async getLibraryItems() {
          callCount++;
          return mockDefaultItems;
        },
        async getLibraryMeta() {
          return { customizableFields: [], customizationDefaults: {} };
        },
        resolveImageUrl(_libraryId: string, imagePath: string) {
          return imagePath;
        },
      };

      const wrapper = createTestWrapperWithAdapter(adapter);

      const { result } = renderHook(() => useLibraryData(singleLibrary), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toHaveLength(2);
      const initialCallCount = callCount;

      // Call refresh
      await result.current.refreshLibrary();

      await waitFor(() => {
        expect(callCount).toBeGreaterThan(initialCallCount);
      });

      // Should still have items after refresh
      expect(result.current.items).toHaveLength(2);
    });
  });

  describe('getLibraryMeta', () => {
    it('getLibraryMeta returns customizableFields for a known library', async () => {
      const adapter = createAdapter({ bins_standard: mockDefaultItems });
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData(['bins_standard']), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const meta = await result.current.getLibraryMeta('bins_standard');
      expect(meta.customizableFields).toBeDefined();
      expect(Array.isArray(meta.customizableFields)).toBe(true);
    });

    it('getLibraryMeta returns empty fields for unknown library', async () => {
      const adapter = createAdapter({});
      const wrapper = createTestWrapper(adapter);

      const { result } = renderHook(() => useLibraryData([]), { wrapper });
      const meta = await result.current.getLibraryMeta('nonexistent');
      expect(meta.customizableFields).toEqual([]);
      expect(meta.customizationDefaults).toEqual({});
    });
  });

  describe('Library Selection Changes', () => {
    it('should reload when selected libraries change', async () => {
      const adapter = createAdapter({
        bins_standard: mockDefaultItems,
        community: mockCommunityItems,
      });
      const wrapper = createTestWrapperWithAdapter(adapter);

      const { result, rerender } = renderHook(
        ({ libs }) => useLibraryData(libs),
        { initialProps: { libs: singleLibrary }, wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toHaveLength(2);

      // Change to community library
      const communityOnly = ['community'];
      rerender({ libs: communityOnly });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      expect(result.current.items[0].id).toBe('community:custom-1x1');
    });
  });
});

