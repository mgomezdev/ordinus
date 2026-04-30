import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCategoryData } from './useCategoryData';
import type { LibraryItem } from '../types/gridfinity';

describe('useCategoryData', () => {
  const mockLibraryItems: LibraryItem[] = [
    {
      id: 'bins_standard:bin-1x1',
      name: '1x1 Bin',
      widthUnits: 1,
      heightUnits: 1,
      color: '#3B82F6',
      categories: ['bin'],
    },
    {
      id: 'bins_standard:bin-2x2',
      name: '2x2 Bin',
      widthUnits: 2,
      heightUnits: 2,
      color: '#3B82F6',
      categories: ['bin'],
    },
    {
      id: 'bins_standard:utensil-1x3',
      name: '1x3 Utensil Tray',
      widthUnits: 1,
      heightUnits: 3,
      color: '#FDFBD4',
      categories: ['utensil'],
    },
    {
      id: 'bins_standard:bin-labeled-1x1',
      name: '1x1 Bin (labeled)',
      widthUnits: 1,
      heightUnits: 1,
      color: '#3B82F6',
      categories: ['bin', 'labeled'],
    },
  ];

  describe('Category Discovery', () => {
    it('should discover categories from library items', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      expect(result.current.categories).toHaveLength(3);
      expect(result.current.categories.map(c => c.id)).toEqual(
        expect.arrayContaining(['bin', 'utensil', 'labeled'])
      );
    });

    it('should auto-generate category names', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      const binCategory = result.current.categories.find(c => c.id === 'bin');
      expect(binCategory?.name).toBe('Bin');

      const utensilCategory = result.current.categories.find(c => c.id === 'utensil');
      expect(utensilCategory?.name).toBe('Utensil');
    });

    it('should auto-generate category colors', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      result.current.categories.forEach(category => {
        expect(category.color).toMatch(/^hsl\(\d+, 70%, 50%\)$/);
      });
    });

    it('should assign order numbers', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      result.current.categories.forEach((category, index) => {
        expect(category.order).toBe(index + 1);
      });
    });

    it('should handle empty library items', () => {
      const { result } = renderHook(() => useCategoryData([]));

      expect(result.current.categories).toHaveLength(0);
      expect(result.current.error).toBeNull();
    });

    it('should handle items with multiple categories', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      // Should discover all unique categories even when items belong to multiple
      expect(result.current.categories).toHaveLength(3);
    });

    it('should deduplicate categories', () => {
      const itemsWithDuplicates: LibraryItem[] = [
        {
          id: 'item1',
          name: 'Item 1',
          widthUnits: 1,
          heightUnits: 1,
          color: '#000',
          categories: ['bin', 'bin'], // Duplicate category
        },
        {
          id: 'item2',
          name: 'Item 2',
          widthUnits: 1,
          heightUnits: 1,
          color: '#000',
          categories: ['bin'],
        },
      ];

      const { result } = renderHook(() => useCategoryData(itemsWithDuplicates));

      expect(result.current.categories).toHaveLength(1);
      expect(result.current.categories[0].id).toBe('bin');
    });
  });

  describe('getCategoryById', () => {
    it('should return category by id', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      const binCategory = result.current.getCategoryById('bin');
      expect(binCategory).toBeDefined();
      expect(binCategory?.id).toBe('bin');
      expect(binCategory?.name).toBe('Bin');
    });

    it('should return undefined for non-existent category', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      const result2 = result.current.getCategoryById('non-existent');
      expect(result2).toBeUndefined();
    });
  });

  describe('State Updates', () => {
    it('should update categories when library items change', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useCategoryData(items),
        { initialProps: { items: mockLibraryItems } }
      );

      expect(result.current.categories).toHaveLength(3);

      // Add new items with new category
      const newItems: LibraryItem[] = [
        ...mockLibraryItems,
        {
          id: 'new-item',
          name: 'New Item',
          widthUnits: 1,
          heightUnits: 1,
          color: '#000',
          categories: ['newcategory'],
        },
      ];

      rerender({ items: newItems });

      expect(result.current.categories).toHaveLength(4);
      expect(result.current.categories.map(c => c.id)).toContain('newcategory');
    });

    it('should handle removing all items', () => {
      const { result, rerender } = renderHook(
        ({ items }) => useCategoryData(items),
        { initialProps: { items: mockLibraryItems } }
      );

      expect(result.current.categories).toHaveLength(3);

      rerender({ items: [] });

      expect(result.current.categories).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should not be in loading state', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      // Category discovery is synchronous, so never in loading state
      expect(result.current.isLoading).toBe(false);
    });

    it('should not have errors with valid data', () => {
      const { result } = renderHook(() => useCategoryData(mockLibraryItems));

      expect(result.current.error).toBeNull();
    });
  });
});
