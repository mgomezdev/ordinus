import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GridPreview } from './GridPreview';
import type { PlacedItemWithValidity, LibraryItem, ComputedSpacer, ReferenceImage } from '../types/gridfinity';
import type React from 'react';

// Mock the PlacedItemOverlay component
vi.mock('./PlacedItemOverlay', () => ({
  PlacedItemOverlay: ({ item, gridX, gridY, isSelected, imageViewMode }: { item: { instanceId: string; itemId: string; x: number; y: number; width: number; height: number }; gridX: number; gridY: number; isSelected: boolean; imageViewMode?: string }) => (
    <div
      data-testid={`placed-item-${item.instanceId}`}
      className="placed-item"
      data-grid-x={gridX}
      data-grid-y={gridY}
      data-selected={isSelected}
      data-x={item.x}
      data-y={item.y}
      data-width={item.width}
      data-height={item.height}
      data-image-view-mode={imageViewMode || 'ortho'}
    >
      {item.itemId}
    </div>
  ),
}));

// Mock the ReferenceImageOverlay component
vi.mock('./ReferenceImageOverlay', () => ({
  ReferenceImageOverlay: ({ image, isSelected }: { image: { id: string; name: string }; isSelected: boolean }) => (
    <div
      data-testid={`ref-image-${image.id}`}
      className="reference-image-overlay"
      data-selected={isSelected}
    >
      {image.name}
    </div>
  ),
}));

// Mock the usePointerDrag hook
const { mockRegisterDropTarget, mockUnregisterDropTarget, mockUsePointerDropTarget } = vi.hoisted(() => {
  const mockRegisterDropTarget = vi.fn();
  const mockUnregisterDropTarget = vi.fn();
  const mockUsePointerDropTarget = vi.fn((options: { gridX: number; gridY: number; onDrop: unknown; onSnapChange?: unknown }) => {
    // Match the real hook's behavior: only register if gridX and gridY are positive
    if (options.gridX > 0 && options.gridY > 0) {
      mockRegisterDropTarget(options);
    }
  });
  return { mockRegisterDropTarget, mockUnregisterDropTarget, mockUsePointerDropTarget };
});
vi.mock('../hooks/usePointerDrag', () => ({
  usePointerDropTarget: mockUsePointerDropTarget,
}));

describe('GridPreview', () => {
  const mockGetItemById = (id: string): LibraryItem | undefined => {
    const items: Record<string, LibraryItem> = {
      'bin-1x1': { id: 'bin-1x1', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#646cff', categories: ['bin'] },
      'bin-2x2': { id: 'bin-2x2', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#646cff', categories: ['bin'] },
    };
    return items[id];
  };

  const mockOnDrop = vi.fn();
  const mockOnSelectItem = vi.fn();
  let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterDropTarget.mockClear();
    mockUnregisterDropTarget.mockClear();
    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  const createMockItem = (overrides?: Partial<PlacedItemWithValidity>): PlacedItemWithValidity => ({
    instanceId: 'test-item-1',
    itemId: 'bin-1x1',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    isValid: true,
    ...overrides,
  });

  const createMockSpacer = (overrides?: Partial<ComputedSpacer>): ComputedSpacer => ({
    id: 'spacer-1',
    position: 'left',
    size: 5,
    renderX: 0,
    renderY: 0,
    renderWidth: 10,
    renderHeight: 100,
    ...overrides,
  });

  describe('Empty State', () => {
    it('should show empty state when gridX is 0', () => {
      render(
        <GridPreview
          gridX={0}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByText('Enter dimensions to see grid preview')).toBeInTheDocument();
    });

    it('should show empty state when gridY is 0', () => {
      render(
        <GridPreview
          gridX={4}
          gridY={0}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByText('Enter dimensions to see grid preview')).toBeInTheDocument();
    });

    it('should show empty state when both dimensions are 0', () => {
      render(
        <GridPreview
          gridX={0}
          gridY={0}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByText('Enter dimensions to see grid preview')).toBeInTheDocument();
    });

    it('should show empty state when gridX is negative', () => {
      render(
        <GridPreview
          gridX={-1}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByText('Enter dimensions to see grid preview')).toBeInTheDocument();
    });
  });

  describe('Grid Cell Generation', () => {
    it('should generate correct number of cells for square grid', () => {
      const { container } = render(
        <GridPreview
          gridX={3}
          gridY={3}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(9); // 3x3 = 9 cells
    });

    it('should generate correct number of cells for rectangular grid', () => {
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={2}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(8); // 4x2 = 8 cells
    });

    it('should generate 1 cell for 1x1 grid', () => {
      const { container } = render(
        <GridPreview
          gridX={1}
          gridY={1}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(1);
    });

    it('should generate cells for large grid', () => {
      const { container } = render(
        <GridPreview
          gridX={10}
          gridY={10}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(100);
    });

    it('should set correct grid template columns', () => {
      const { container } = render(
        <GridPreview
          gridX={5}
          gridY={3}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toHaveStyle({
        gridTemplateColumns: 'repeat(5, 1fr)',
      });
    });

    it('should set correct grid template rows', () => {
      const { container } = render(
        <GridPreview
          gridX={5}
          gridY={3}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toHaveStyle({
        gridTemplateRows: 'repeat(3, 1fr)',
      });
    });
  });

  describe('Placed Items Rendering', () => {
    it('should render placed items', () => {
      const items = [createMockItem({ instanceId: 'item-1' })];
      render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByTestId('placed-item-item-1')).toBeInTheDocument();
    });

    it('should pass gridX and gridY to PlacedItemOverlay', () => {
      const items = [createMockItem({ instanceId: 'item-1' })];
      render(
        <GridPreview
          gridX={5}
          gridY={7}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const placedItem = screen.getByTestId('placed-item-item-1');
      expect(placedItem).toHaveAttribute('data-grid-x', '5');
      expect(placedItem).toHaveAttribute('data-grid-y', '7');
    });

    it('should render multiple placed items', () => {
      const items = [
        createMockItem({ instanceId: 'item-1', x: 0, y: 0 }),
        createMockItem({ instanceId: 'item-2', x: 1, y: 1 }),
        createMockItem({ instanceId: 'item-3', x: 2, y: 2 }),
      ];
      render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByTestId('placed-item-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('placed-item-item-2')).toBeInTheDocument();
      expect(screen.getByTestId('placed-item-item-3')).toBeInTheDocument();
    });

    it('should pass selection state to PlacedItemOverlay', () => {
      const items = [
        createMockItem({ instanceId: 'item-1' }),
        createMockItem({ instanceId: 'item-2' }),
      ];
      render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set(['item-1'])}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const selectedItem = screen.getByTestId('placed-item-item-1');
      const unselectedItem = screen.getByTestId('placed-item-item-2');

      expect(selectedItem).toHaveAttribute('data-selected', 'true');
      expect(unselectedItem).toHaveAttribute('data-selected', 'false');
    });
  });

  describe('Drop Target Registration', () => {
    it('should register as a drop target with correct grid dimensions', () => {
      render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(mockRegisterDropTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          gridX: 4,
          gridY: 4,
          onDrop: mockOnDrop,
        })
      );
    });

    it('should not register drop target when gridX is 0', () => {
      render(
        <GridPreview
          gridX={0}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(mockRegisterDropTarget).not.toHaveBeenCalled();
    });

    it('should not register drop target when gridY is 0', () => {
      render(
        <GridPreview
          gridX={4}
          gridY={0}
          placedItems={[]}
          selectedItemId={null}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(mockRegisterDropTarget).not.toHaveBeenCalled();
    });
  });

  describe('Selection Behavior', () => {
    it('should call onSelectItem with null when grid is clicked', () => {
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set(['some-item'])}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      fireEvent.click(gridContainer!);

      expect(mockOnSelectItem).toHaveBeenCalledWith(null);
    });

    it('should deselect item when clicking empty grid area', () => {
      const items = [createMockItem({ instanceId: 'item-1' })];
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set(['item-1'])}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      fireEvent.click(gridContainer!);

      expect(mockOnSelectItem).toHaveBeenCalledWith(null);
    });
  });

  describe('Edge Cases', () => {
    it('should render with no placed items', () => {
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(16);
      expect(screen.queryByTestId(/placed-item-/)).not.toBeInTheDocument();
    });

    it('should handle grid with single dimension', () => {
      const { container } = render(
        <GridPreview
          gridX={1}
          gridY={5}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(5);
    });

    it('should update when grid dimensions change', () => {
      const { container, rerender } = render(
        <GridPreview
          gridX={3}
          gridY={3}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      let cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(9);

      rerender(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(16);
    });

    it('should update placed items when they change', () => {
      const items1 = [createMockItem({ instanceId: 'item-1' })];
      const { rerender } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items1}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByTestId('placed-item-item-1')).toBeInTheDocument();

      const items2 = [
        createMockItem({ instanceId: 'item-1' }),
        createMockItem({ instanceId: 'item-2' }),
      ];
      rerender(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items2}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByTestId('placed-item-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('placed-item-item-2')).toBeInTheDocument();
    });
  });

  describe('Spacer Offset Calculations', () => {
    it('should calculate grid offset with left spacer', () => {
      const spacers = [
        createMockSpacer({
          id: 'spacer-1',
          position: 'left',
          renderWidth: 10,
          renderHeight: 100,
        }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          spacers={spacers}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toHaveStyle({
        left: '10%',
        top: '0%',
        width: '90%',
        height: '100%',
      });
    });

    it('should calculate grid offset with right spacer (no left)', () => {
      const spacers = [
        createMockSpacer({
          id: 'spacer-1',
          position: 'right',
          renderWidth: 15,
          renderHeight: 100,
        }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          spacers={spacers}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toHaveStyle({
        left: '15%',
        top: '0%',
        width: '85%',
        height: '100%',
      });
    });

    it('should calculate grid offset with top spacer', () => {
      const spacers = [
        createMockSpacer({
          id: 'spacer-1',
          position: 'top',
          renderWidth: 100,
          renderHeight: 12,
        }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          spacers={spacers}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toHaveStyle({
        left: '0%',
        top: '12%',
        width: '100%',
        height: '88%',
      });
    });

    it('should calculate grid offset with bottom spacer (no top)', () => {
      const spacers = [
        createMockSpacer({
          id: 'spacer-1',
          position: 'bottom',
          renderWidth: 100,
          renderHeight: 20,
        }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          spacers={spacers}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toHaveStyle({
        left: '0%',
        top: '20%',
        width: '100%',
        height: '80%',
      });
    });

    it('should calculate grid offset with multiple spacers', () => {
      const spacers = [
        createMockSpacer({
          id: 'spacer-left',
          position: 'left',
          renderWidth: 10,
          renderHeight: 100,
        }),
        createMockSpacer({
          id: 'spacer-top',
          position: 'top',
          renderWidth: 100,
          renderHeight: 12,
        }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          spacers={spacers}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toHaveStyle({
        left: '10%',
        top: '12%',
        width: '90%',
        height: '88%',
      });
    });

    it('should prioritize left spacer over right spacer for offset', () => {
      const spacers = [
        createMockSpacer({
          id: 'spacer-left',
          position: 'left',
          renderWidth: 10,
          renderHeight: 100,
        }),
        createMockSpacer({
          id: 'spacer-right',
          position: 'right',
          renderWidth: 15,
          renderHeight: 100,
        }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          spacers={spacers}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      // Left spacer should be used for offset, but width includes both
      expect(gridContainer).toHaveStyle({
        left: '10%',
        width: '75%', // 100 - 10 (left) - 15 (right)
      });
    });

    it('should prioritize top spacer over bottom spacer for offset', () => {
      const spacers = [
        createMockSpacer({
          id: 'spacer-top',
          position: 'top',
          renderWidth: 100,
          renderHeight: 12,
        }),
        createMockSpacer({
          id: 'spacer-bottom',
          position: 'bottom',
          renderWidth: 100,
          renderHeight: 20,
        }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          spacers={spacers}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      // Top spacer should be used for offset, but height includes both
      expect(gridContainer).toHaveStyle({
        top: '12%',
        height: '68%', // 100 - 12 (top) - 20 (bottom)
      });
    });
  });

  describe('Image View Mode', () => {
    it('should pass imageViewMode to PlacedItemOverlay', () => {
      const items = [createMockItem({ instanceId: 'item-1' })];
      render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
          imageViewMode="perspective"
        />
      );

      const placedItem = screen.getByTestId('placed-item-item-1');
      expect(placedItem).toHaveAttribute('data-image-view-mode', 'perspective');
    });

    it('should default imageViewMode to ortho when not provided', () => {
      const items = [createMockItem({ instanceId: 'item-1' })];
      render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const placedItem = screen.getByTestId('placed-item-item-1');
      expect(placedItem).toHaveAttribute('data-image-view-mode', 'ortho');
    });
  });

  describe('Regression Tests', () => {
    it('should render grid container with correct class for absolute positioned items', () => {
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      // Grid container should have the class that applies position: relative in CSS
      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toBeInTheDocument();
      expect(gridContainer).toHaveClass('grid-container');
    });

    it('should not create extra rows when placing items (regression for CSS Grid bug)', () => {
      const items = [
        createMockItem({ instanceId: 'item-1', x: 0, y: 0 }),
        createMockItem({ instanceId: 'item-2', x: 1, y: 1 }),
        createMockItem({ instanceId: 'item-3', x: 2, y: 2 }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      // Verify exact number of grid cells (no extra rows/columns)
      const cells = container.querySelectorAll('.grid-cell');
      expect(cells).toHaveLength(16); // 4x4 = 16 cells, no extra

      // Verify placed items are rendered
      expect(screen.getByTestId('placed-item-item-1')).toBeInTheDocument();
      expect(screen.getByTestId('placed-item-item-2')).toBeInTheDocument();
      expect(screen.getByTestId('placed-item-item-3')).toBeInTheDocument();
    });

    it('should update item percentages when grid dimensions change dynamically', () => {
      const items = [createMockItem({ instanceId: 'item-1', x: 1, y: 1, width: 1, height: 1 })];

      const { rerender } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      let placedItem = screen.getByTestId('placed-item-item-1');
      // On 4x4 grid: 1/4 = 25%
      expect(placedItem).toHaveAttribute('data-grid-x', '4');
      expect(placedItem).toHaveAttribute('data-grid-y', '4');

      // Change to 5x5 grid
      rerender(
        <GridPreview
          gridX={5}
          gridY={5}
          placedItems={items}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      placedItem = screen.getByTestId('placed-item-item-1');
      // On 5x5 grid: new percentages passed
      expect(placedItem).toHaveAttribute('data-grid-x', '5');
      expect(placedItem).toHaveAttribute('data-grid-y', '5');
    });

    it('should set dynamic aspect ratio for square cells (regression for non-square grid bug)', () => {
      // A 6x3 grid should have aspect-ratio of 6/3 = 2 to ensure square cells
      const { container, rerender } = render(
        <GridPreview
          gridX={6}
          gridY={3}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridPreview = container.querySelector('.grid-preview');
      expect(gridPreview).toHaveStyle({ aspectRatio: '6 / 3' });

      // Verify it updates when dimensions change
      rerender(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(gridPreview).toHaveStyle({ aspectRatio: '4 / 4' });

      // Test a tall grid
      rerender(
        <GridPreview
          gridX={2}
          gridY={5}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(gridPreview).toHaveStyle({ aspectRatio: '2 / 5' });
    });
  });

  describe('Default Prop Referential Stability', () => {
    it('should render correctly when spacers prop is omitted across re-renders', () => {
      const { container, rerender } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toBeInTheDocument();
      expect(gridContainer).toHaveStyle({ left: '0%', top: '0%', width: '100%', height: '100%' });

      rerender(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      expect(gridContainer).toHaveStyle({ left: '0%', top: '0%', width: '100%', height: '100%' });
    });

    it('should render correctly when referenceImages prop is omitted across re-renders', () => {
      const { container, rerender } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container')!;
      const refImages = gridContainer.querySelectorAll('.reference-image-overlay');
      expect(refImages).toHaveLength(0);

      rerender(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const refImagesAfter = gridContainer.querySelectorAll('.reference-image-overlay');
      expect(refImagesAfter).toHaveLength(0);
    });

    it('should not render spacer overlays when spacers prop is omitted', () => {
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const drawerContainer = container.querySelector('.drawer-container')!;
      const spacerOverlays = drawerContainer.querySelectorAll('[class*="spacer"]');
      const gridContainer = container.querySelector('.grid-container');
      expect(gridContainer).toBeInTheDocument();
      expect(spacerOverlays).toHaveLength(0);
    });
  });

  describe('Stacking Order — Reference Images Above Placed Items', () => {
    const createMockRefImage = (overrides?: Partial<ReferenceImage>): ReferenceImage => ({
      id: 'ref-img-1',
      name: 'test-ref.png',
      dataUrl: 'data:image/png;base64,mockBase64',
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      opacity: 0.5,
      scale: 1,
      isLocked: false,
      rotation: 0,
      ...overrides,
    });

    it('should render reference images after placed items in DOM order (above them visually)', () => {
      const items = [createMockItem({ instanceId: 'item-1' })];
      const refImages = [createMockRefImage({ id: 'ref-1' })];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          referenceImages={refImages}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container')!;
      const placedItem = gridContainer.querySelector('[data-testid="placed-item-item-1"]')!;
      const refImage = gridContainer.querySelector('[data-testid="ref-image-ref-1"]')!;

      // Both should exist
      expect(placedItem).toBeInTheDocument();
      expect(refImage).toBeInTheDocument();

      // Reference image should come AFTER placed item in DOM order.
      // In CSS stacking, later DOM siblings render on top of earlier ones
      // (at the same z-index level).
      // compareDocumentPosition returns bitmask; bit 4 (DOCUMENT_POSITION_FOLLOWING)
      // means the other node follows this one.
      const position = placedItem.compareDocumentPosition(refImage);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('should render all reference images after all placed items', () => {
      const items = [
        createMockItem({ instanceId: 'item-1' }),
        createMockItem({ instanceId: 'item-2', x: 1, y: 0 }),
      ];
      const refImages = [
        createMockRefImage({ id: 'ref-1' }),
        createMockRefImage({ id: 'ref-2', name: 'second-ref.png' }),
      ];

      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set()}
          referenceImages={refImages}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container')!;
      const lastPlacedItem = gridContainer.querySelector('[data-testid="placed-item-item-2"]')!;
      const firstRefImage = gridContainer.querySelector('[data-testid="ref-image-ref-1"]')!;

      // The first reference image should come after the last placed item
      const position = lastPlacedItem.compareDocumentPosition(firstRefImage);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('Keyboard Accessibility', () => {
    it('should have an onKeyDown handler on the grid container', () => {
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container')!;
      // Fire a keydown event and verify it doesn't throw
      fireEvent.keyDown(gridContainer, { key: 'Escape' });
      // The handler should deselect on Escape
      expect(mockOnSelectItem).toHaveBeenCalledWith(null);
    });

    it('should deselect all items when Escape is pressed on the grid container', () => {
      const items = [createMockItem({ instanceId: 'item-1' })];
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={items}
          selectedItemIds={new Set(['item-1'])}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container')!;
      fireEvent.keyDown(gridContainer, { key: 'Escape' });

      expect(mockOnSelectItem).toHaveBeenCalledWith(null);
    });

    it('should not call onSelectItem for non-handled keys on the grid container', () => {
      const { container } = render(
        <GridPreview
          gridX={4}
          gridY={4}
          placedItems={[]}
          selectedItemIds={new Set()}
          onDrop={mockOnDrop}
          onSelectItem={mockOnSelectItem}
          getItemById={mockGetItemById}
        />
      );

      const gridContainer = container.querySelector('.grid-container')!;
      fireEvent.keyDown(gridContainer, { key: 'a' });

      expect(mockOnSelectItem).not.toHaveBeenCalled();
    });
  });

  describe('Snap Preview', () => {
    const baseProps = {
      gridX: 4,
      gridY: 4,
      placedItems: [],
      selectedItemIds: new Set<string>(),
      onDrop: vi.fn(),
      onSelectItem: vi.fn(),
      getItemById: vi.fn(),
    };

    it('renders no snap preview when snapPreview is null', () => {
      const { container } = render(<GridPreview {...baseProps} snapPreview={null} />);
      expect(container.querySelector('.snap-preview')).toBeNull();
    });

    it('renders valid snap preview overlay', () => {
      const { container } = render(
        <GridPreview
          {...baseProps}
          snapPreview={{ col: 1, row: 0, w: 2, d: 1, valid: true }}
        />
      );
      expect(container.querySelector('.snap-preview--valid')).toBeInTheDocument();
    });

    it('renders invalid snap preview overlay', () => {
      const { container } = render(
        <GridPreview
          {...baseProps}
          snapPreview={{ col: 0, row: 0, w: 2, d: 1, valid: false }}
        />
      );
      expect(container.querySelector('.snap-preview--invalid')).toBeInTheDocument();
    });

    it('passes onSnapChange to usePointerDropTarget', () => {
      const onSnapChange = vi.fn();
      render(
        <GridPreview
          {...baseProps}
          onSnapChange={onSnapChange}
        />
      );
      expect(mockUsePointerDropTarget).toHaveBeenCalledWith(
        expect.objectContaining({ onSnapChange })
      );
    });
  });
});
