import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { GridPreview } from './GridPreview';
import { useGridItems } from '../hooks/useGridItems';
import type { LibraryItem } from '../types/gridfinity';

// Mock the PlacedItemOverlay to simplify testing
vi.mock('./PlacedItemOverlay', () => ({
  PlacedItemOverlay: ({ item, gridX, gridY, isSelected, onSelect }: { item: { instanceId: string; itemId: string; x: number; y: number; width: number; height: number; isValid: boolean }; gridX: number; gridY: number; isSelected: boolean; onSelect: (id: string) => void }) => (
    <div
      data-testid={`placed-item-${item.instanceId}`}
      data-item-id={item.itemId}
      data-x={item.x}
      data-y={item.y}
      data-width={item.width}
      data-height={item.height}
      data-valid={item.isValid}
      data-selected={isSelected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.instanceId);
      }}
      style={{
        position: 'absolute',
        left: `${(item.x / gridX) * 100}%`,
        top: `${(item.y / gridY) * 100}%`,
        width: `${(item.width / gridX) * 100}%`,
        height: `${(item.height / gridY) * 100}%`,
      }}
    >
      {item.itemId}
    </div>
  ),
}));

describe('Bin Placement Integration Tests', () => {
  // Mock library items
  const mockLibraryItems: Record<string, LibraryItem> = {
    'bin-1x1': { id: 'bin-1x1', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#646cff', categories: ['bin'] },
    'bin-2x2': { id: 'bin-2x2', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#646cff', categories: ['bin'] },
    'bin-1x2': { id: 'bin-1x2', name: '1x2 Bin', widthUnits: 1, heightUnits: 2, color: '#646cff', categories: ['bin'] },
    'bin-3x2': { id: 'bin-3x2', name: '3x2 Bin', widthUnits: 3, heightUnits: 2, color: '#646cff', categories: ['bin'] },
  };

  const mockGetItemById = (id: string): LibraryItem | undefined => {
    return mockLibraryItems[id];
  };

  describe('Single Bin Placement', () => {
    it('should place a bin at the origin (0, 0)', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 0);
      });

      expect(result.current.placedItems).toHaveLength(1);
      expect(result.current.placedItems[0]).toMatchObject({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        isValid: true,
      });
    });

    it('should place a bin at the maximum valid position', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 3, 3);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        x: 3,
        y: 3,
        isValid: true,
      });
    });

    it('should place a 2x2 bin at the edge correctly', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 2, 2);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        x: 2,
        y: 2,
        width: 2,
        height: 2,
        isValid: true,
      });
    });

    it('should mark bin as invalid when placed out of bounds', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 3, 3);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        x: 3,
        y: 3,
        isValid: false,
      });
    });
  });

  describe('Multiple Bin Placement', () => {
    it('should place multiple non-overlapping bins', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 2, 2);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 3, 3);
      });

      expect(result.current.placedItems).toHaveLength(3);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should detect collision between overlapping bins', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 1, 1);
      });

      const invalidItems = result.current.placedItems.filter(item => !item.isValid);
      expect(invalidItems.length).toBeGreaterThan(0);
    });

    it('should allow adjacent bins without collision', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 2, 0);
      });

      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should fill a 4x4 grid completely with 1x1 bins', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, x, y);
          }
        }
      });

      expect(result.current.placedItems).toHaveLength(16);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should fill a 4x4 grid with four 2x2 bins', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 2, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 2);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 2, 2);
      });

      expect(result.current.placedItems).toHaveLength(4);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });
  });

  describe('Bin Movement', () => {
    it('should move a bin to a valid position', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 0);
      });

      const instanceId = result.current.placedItems[0].instanceId;

      act(() => {
        result.current.handleDrop({ type: 'placed', itemId: 'bin-1x1', instanceId }, 3, 3);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        x: 3,
        y: 3,
        isValid: true,
      });
    });

    it('should detect collision when moving bin into another bin', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
      });

      const movingId = result.current.placedItems[0].instanceId;

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 2, 2);
      });

      act(() => {
        result.current.handleDrop({ type: 'placed', itemId: 'bin-2x2', instanceId: movingId }, 1, 1);
      });

      const invalidItems = result.current.placedItems.filter(item => !item.isValid);
      expect(invalidItems.length).toBeGreaterThan(0);
    });

    it('should move bin out of bounds and mark as invalid', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
      });

      const instanceId = result.current.placedItems[0].instanceId;

      act(() => {
        result.current.handleDrop({ type: 'placed', itemId: 'bin-2x2', instanceId }, 3, 3);
      });

      expect(result.current.placedItems[0].isValid).toBe(false);
    });
  });

  describe('Bin Rotation', () => {
    it('should rotate a bin and maintain valid position', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x2' }, 0, 0);
      });

      const instanceId = result.current.placedItems[0].instanceId;

      expect(result.current.placedItems[0]).toMatchObject({
        width: 1,
        height: 2,
        isValid: true,
      });

      act(() => {
        result.current.rotateItem(instanceId);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        width: 2,
        height: 1,
        isValid: true,
      });
    });

    it('should mark bin as invalid after rotation causes out of bounds', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-3x2' }, 2, 2);
      });

      const instanceId = result.current.placedItems[0].instanceId;

      expect(result.current.placedItems[0]).toMatchObject({
        width: 3,
        height: 2,
        isValid: false, // 3x2 at position (2,2) goes out of bounds on a 4x4 grid
      });

      act(() => {
        result.current.rotateItem(instanceId);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        width: 2,
        height: 3,
        isValid: false,
      });
    });

    it('should detect collision after rotation', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x2' }, 0, 0);
      });

      const rotatingId = result.current.placedItems[0].instanceId;

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 1, 0);
      });

      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);

      act(() => {
        result.current.rotateItem(rotatingId);
      });

      const invalidItems = result.current.placedItems.filter(item => !item.isValid);
      expect(invalidItems.length).toBeGreaterThan(0);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle bins at all four corners of the grid', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 0); // Top-left
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 3, 0); // Top-right
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 3); // Bottom-left
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 3, 3); // Bottom-right
      });

      expect(result.current.placedItems).toHaveLength(4);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should handle large bins at each corner', () => {
      const { result } = renderHook(() => useGridItems(6, 6, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 4, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 4);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 4, 4);
      });

      expect(result.current.placedItems).toHaveLength(4);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should handle a bin exactly spanning the entire grid', () => {
      const { result } = renderHook(() => useGridItems(2, 2, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        isValid: true,
      });
    });
  });

  describe('Grid Dimension Changes', () => {
    it('should invalidate bins when grid shrinks', () => {
      const { result, rerender } = renderHook(
        ({ gridX, gridY }) => useGridItems(gridX, gridY, mockGetItemById),
        { initialProps: { gridX: 5, gridY: 5 } }
      );

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 3, 3);
      });

      expect(result.current.placedItems[0].isValid).toBe(true);

      rerender({ gridX: 4, gridY: 4 });

      expect(result.current.placedItems[0].isValid).toBe(false);
    });

    it('should validate bins when grid expands', () => {
      const { result, rerender } = renderHook(
        ({ gridX, gridY }) => useGridItems(gridX, gridY, mockGetItemById),
        { initialProps: { gridX: 3, gridY: 3 } }
      );

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 2, 2);
      });

      expect(result.current.placedItems[0].isValid).toBe(false);

      rerender({ gridX: 5, gridY: 5 });

      expect(result.current.placedItems[0].isValid).toBe(true);
    });

    it('should handle grid changing from square to rectangular', () => {
      const { result, rerender } = renderHook(
        ({ gridX, gridY }) => useGridItems(gridX, gridY, mockGetItemById),
        { initialProps: { gridX: 4, gridY: 4 } }
      );

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 2, 2);
      });

      expect(result.current.placedItems[0].isValid).toBe(true);

      rerender({ gridX: 3, gridY: 5 });

      expect(result.current.placedItems[0].isValid).toBe(false);
    });
  });

  describe('Complex Layout Scenarios', () => {
    it('should handle a checkerboard pattern', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            if ((x + y) % 2 === 0) {
              result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, x, y);
            }
          }
        }
      });

      expect(result.current.placedItems).toHaveLength(8);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should handle mixed bin sizes in a valid layout', () => {
      const { result } = renderHook(() => useGridItems(6, 6, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-3x2' }, 2, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x2' }, 5, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 2);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 1, 2);
      });

      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should handle mixed bin sizes with collisions', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 1, 1);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 1, 1);
      });

      const validItems = result.current.placedItems.filter(item => item.isValid);
      const invalidItems = result.current.placedItems.filter(item => !item.isValid);

      expect(validItems.length).toBeLessThan(result.current.placedItems.length);
      expect(invalidItems.length).toBeGreaterThan(0);
    });
  });

  describe('UI Integration with GridPreview', () => {
    it('should render bins with correct positioning styles', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 1, 1);
      });

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={result.current.placedItems}
          selectedItemIds={new Set()}
          onDrop={result.current.handleDrop}
          onSelectItem={result.current.selectItem}
          getItemById={mockGetItemById}
        />
      );

      const placedItem = container.querySelector('[data-testid^="placed-item-"]');
      expect(placedItem).toHaveStyle({
        left: '25%',   // 1/4
        top: '25%',    // 1/4
        width: '50%',  // 2/4
        height: '50%', // 2/4
      });
    });

    it('should render multiple bins with correct relative positions', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 3, 3);
      });

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={result.current.placedItems}
          selectedItemIds={new Set()}
          onDrop={result.current.handleDrop}
          onSelectItem={result.current.selectItem}
          getItemById={mockGetItemById}
        />
      );

      const placedItems = container.querySelectorAll('[data-testid^="placed-item-"]');
      expect(placedItems).toHaveLength(2);

      const firstItem = placedItems[0];
      const lastItem = placedItems[1];

      expect(firstItem).toHaveStyle({ left: '0%', top: '0%' });
      expect(lastItem).toHaveStyle({ left: '75%', top: '75%' });
    });

    it('should display validity state correctly in UI', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 1, 1);
      });

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={result.current.placedItems}
          selectedItemIds={new Set()}
          onDrop={result.current.handleDrop}
          onSelectItem={result.current.selectItem}
          getItemById={mockGetItemById}
        />
      );

      const placedItems = container.querySelectorAll('[data-testid^="placed-item-"]');
      const invalidItems = Array.from(placedItems).filter(
        item => item.getAttribute('data-valid') === 'false'
      );

      expect(invalidItems.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle placing many bins efficiently', () => {
      const { result } = renderHook(() => useGridItems(10, 10, mockGetItemById));

      act(() => {
        for (let i = 0; i < 50; i++) {
          const x = Math.floor(Math.random() * 10);
          const y = Math.floor(Math.random() * 10);
          result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, x, y);
        }
      });

      expect(result.current.placedItems).toHaveLength(50);
    });

    it('should validate all items correctly in large grid', () => {
      const { result } = renderHook(() => useGridItems(10, 10, mockGetItemById));

      act(() => {
        for (let y = 0; y < 10; y++) {
          for (let x = 0; x < 10; x++) {
            result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, x, y);
          }
        }
      });

      expect(result.current.placedItems).toHaveLength(100);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should handle very large grid (20x20)', () => {
      const { result } = renderHook(() => useGridItems(20, 20, mockGetItemById));

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, i * 2, i * 2);
        }
      });

      expect(result.current.placedItems).toHaveLength(10);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });
  });

  describe('Additional Edge Cases', () => {
    it('should handle single-row grid (1xN)', () => {
      const { result } = renderHook(() => useGridItems(1, 5, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 4);
      });

      expect(result.current.placedItems).toHaveLength(2);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should handle single-column grid (Nx1)', () => {
      const { result } = renderHook(() => useGridItems(5, 1, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 4, 0);
      });

      expect(result.current.placedItems).toHaveLength(2);
      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);
    });

    it('should invalidate bin when rotated into collision', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x2' }, 0, 0);
        // Place at (1, 0) so rotation will cause collision
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 1, 0);
      });

      const rotatingId = result.current.placedItems[0].instanceId;

      expect(result.current.placedItems.every(item => item.isValid)).toBe(true);

      // Rotating 1x2 at (0,0) to 2x1 will now collide with item at (1,0)
      act(() => {
        result.current.rotateItem(rotatingId);
      });

      const invalidItems = result.current.placedItems.filter(item => !item.isValid);
      expect(invalidItems.length).toBeGreaterThan(0);
    });

    it('should handle moving bin to exact same position', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-1x1' }, 1, 1);
      });

      const instanceId = result.current.placedItems[0].instanceId;

      act(() => {
        result.current.handleDrop({ type: 'placed', itemId: 'bin-1x1', instanceId }, 1, 1);
      });

      expect(result.current.placedItems[0]).toMatchObject({
        x: 1,
        y: 1,
        isValid: true,
      });
    });

    it('should handle dropping library item on occupied space', () => {
      const { result } = renderHook(() => useGridItems(4, 4, mockGetItemById));

      act(() => {
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
        result.current.handleDrop({ type: 'library', itemId: 'bin-2x2' }, 0, 0);
      });

      expect(result.current.placedItems).toHaveLength(2);
      const invalidItems = result.current.placedItems.filter(item => !item.isValid);
      expect(invalidItems.length).toBeGreaterThan(0);
    });
  });
});
