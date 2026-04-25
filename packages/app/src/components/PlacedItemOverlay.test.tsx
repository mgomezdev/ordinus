import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { PlacedItemOverlay } from './PlacedItemOverlay';
import type { PlacedItemWithValidity, LibraryItem } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';

// Wrap all renders with MemoryRouter so useSearchParams works
function render(ui: React.ReactElement, options?: RenderOptions): RenderResult {
  return rtlRender(ui, {
    ...options,
    wrapper: ({ children }) => React.createElement(MemoryRouter, {}, children),
  });
}

// Mock AuthContext — use vi.hoisted so mockUseAuth is available when the factory runs
const { mockUseAuth } = vi.hoisted(() => {
  const mockUseAuth = vi.fn(() => ({
    isAuthenticated: true,
    user: null as null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getAccessToken: () => null as string | null,
  }));
  return { mockUseAuth };
});
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../hooks/useFavorites', () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
    favorites: [],
    isLoading: false,
    removeFavorite: vi.fn(),
    renameFavorite: vi.fn(),
  }),
}));

// Mock generation.api
vi.mock('../api/generation.api', () => ({
  generatedImageUrl: (hash: string, filename: string) => `/generated/${hash}/${filename}`,
}));

// Mock getRotatedPerspectiveUrl so we can control rotation URL generation in tests
vi.mock('../utils/imageHelpers', () => ({
  getRotatedPerspectiveUrl: (url: string, rotation: number) => {
    if (!url) return url;
    if (rotation === 0) return url;
    if (!url.includes('-perspective.png')) return url;
    return url.replace('-perspective.png', `-perspective-${rotation}.png`);
  },
}));

// Mock usePointerDragSource to capture onTap callback
let capturedOnTap: ((e: PointerEvent) => void) | undefined;
vi.mock('../hooks/usePointerDrag', () => ({
  usePointerDragSource: (options: { onTap?: (e: PointerEvent) => void }) => {
    capturedOnTap = options.onTap;
    return {
      onPointerDown: vi.fn((e: React.PointerEvent) => {
        e.stopPropagation();
      }),
    };
  },
}));

describe('PlacedItemOverlay', () => {
  const mockGetItemById = (id: string): LibraryItem | undefined => {
    const items: Record<string, LibraryItem> = {
      'bin-1x1': { id: 'bin-1x1', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#3B82F6', categories: ['bin'] },
      'bin-2x2': { id: 'bin-2x2', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#3B82F6', categories: ['bin'] },
      'testlib:bin-1x1': { id: 'testlib:bin-1x1', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#3B82F6', categories: ['bin'] },
      'testlib:bin-2x2': { id: 'testlib:bin-2x2', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#3B82F6', categories: ['bin'] },
      'utensil-1x3': { id: 'utensil-1x3', libraryId: 'simple-utensils', name: '1x3 Utensils', widthUnits: 1, heightUnits: 3, color: '#10B981', categories: ['utensil'], stlFile: 'Utensils 1x3.stl' },
    };
    return items[id];
  };

  const mockGetLibraryMeta = vi.fn().mockResolvedValue({
    customizableFields: [
      { field: 'wallPatternEnabled', label: 'Wall Pattern' },
      { field: 'wallPattern', label: 'Wall Pattern', options: ['grid', 'hexgrid', 'brick'] },
      { field: 'lipStyle',    label: 'Lip Style',    options: ['normal', 'reduced', 'minimum', 'none'] },
      { field: 'fingerSlide', label: 'Finger Slide', options: ['none', 'rounded', 'chamfered'] },
      { field: 'wallCutout',  label: 'Wall Cutout' },
      { field: 'height',      label: 'Height',       min: 1, max: 20 },
    ],
    parameters: {},
  });

  const mockOnSelect = vi.fn();

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

  // Helper for tests that require the Customize button (needs a colon in itemId to trigger getLibraryMeta)
  const createMockItemWithLibrary = (overrides?: Partial<PlacedItemWithValidity>): PlacedItemWithValidity => ({
    instanceId: 'test-item-1',
    itemId: 'testlib:bin-1x1',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    rotation: 0,
    isValid: true,
    ...overrides,
  });

  beforeEach(() => {
    capturedOnTap = undefined;
    mockUseAuth.mockReset();
    mockUseAuth.mockImplementation(() => ({
      isAuthenticated: true,
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getAccessToken: () => null as string | null,
    }));
  });

  describe('Percentage-based Positioning', () => {
    it('should calculate left position as percentage of gridX', () => {
      const item = createMockItem({ x: 1, width: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({ left: '25%' }); // 1/4 = 25%
    });

    it('should calculate top position as percentage of gridY', () => {
      const item = createMockItem({ y: 2, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({ top: '50%' }); // 2/4 = 50%
    });

    it('should calculate width as percentage of gridX', () => {
      const item = createMockItem({ width: 2 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({ width: '50%' }); // 2/4 = 50%
    });

    it('should calculate height as percentage of gridY', () => {
      const item = createMockItem({ height: 3 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({ height: '75%' }); // 3/4 = 75%
    });

    it('should position item at (0, 0) as 0%', () => {
      const item = createMockItem({ x: 0, y: 0 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({ left: '0%', top: '0%' });
    });

    it('should handle non-square grids correctly', () => {
      const item = createMockItem({ x: 2, y: 1, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={5}
          gridY={3}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        left: '40%',    // 2/5 = 40%
        top: '33.33333333333333%',     // 1/3 = 33.33%
        width: '20%',   // 1/5 = 20%
        height: '33.33333333333333%',  // 1/3 = 33.33%
      });
    });

    it('should handle large bins spanning multiple units', () => {
      const item = createMockItem({ x: 1, y: 1, width: 3, height: 2 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={5}
          gridY={5}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        left: '20%',   // 1/5 = 20%
        top: '20%',    // 1/5 = 20%
        width: '60%',  // 3/5 = 60%
        height: '40%', // 2/5 = 40%
      });
    });

    it('should position at maximum valid position correctly', () => {
      const item = createMockItem({ x: 3, y: 3, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        left: '75%',
        top: '75%',
        width: '25%',
        height: '25%',
      });
    });
  });

  describe('Valid/Invalid Styling', () => {
    it('should apply valid item color when isValid is true', () => {
      const item = createMockItem({ isValid: true });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        backgroundColor: '#3B82F666',
        borderColor: '#3B82F6',
      });
      expect(element).not.toHaveClass('invalid');
    });

    it('should apply invalid styling when isValid is false', () => {
      const item = createMockItem({ isValid: false });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        backgroundColor: '#EF444466',
        borderColor: '#EF4444',
      });
      expect(element).toHaveClass('invalid');
    });

    it('should use library item color for valid items', () => {
      const customGetItemById = () => ({
        id: 'custom-item',
        name: 'Custom',
        widthUnits: 1,
        heightUnits: 1,
        color: '#22c55e',
        categories: ['divider'],
      });

      const item = createMockItem({ isValid: true });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={customGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        backgroundColor: '#22c55e66',
        borderColor: '#22c55e',
      });
    });

    it('should use default color if library item not found', () => {
      const emptyGetItemById = () => undefined;

      const item = createMockItem({ isValid: true });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={emptyGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        backgroundColor: '#3B82F666',
        borderColor: '#3B82F6',
      });
    });
  });

  describe('Selection State', () => {
    it('should apply selected class when isSelected is true', () => {
      const item = createMockItem();
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveClass('selected');
    });

    it('should not apply selected class when isSelected is false', () => {
      const item = createMockItem();
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).not.toHaveClass('selected');
    });
  });

  describe('Click Handling', () => {
    it('should call onSelect with instanceId on tap', () => {
      const item = createMockItem({ instanceId: 'test-item-123' });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      // Simulate tap via the captured onTap callback from usePointerDragSource
      const fakeEvent = new PointerEvent('pointerup', { bubbles: true });
      capturedOnTap?.(fakeEvent);

      expect(mockOnSelect).toHaveBeenCalledWith('test-item-123', expect.objectContaining({ shift: false, ctrl: false }));
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
    });

    it('should stop event propagation on pointer events', () => {
      const item = createMockItem();
      const parentClickHandler = vi.fn();
      const { container } = render(
        <div onClick={parentClickHandler}>
          <PlacedItemOverlay
            item={item}
            gridX={4}
            gridY={4}
            isSelected={false}
            onSelect={mockOnSelect}
            getItemById={mockGetItemById}
          />
        </div>
      );

      const element = container.querySelector('.placed-item');
      fireEvent.pointerDown(element!);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Drag and Drop', () => {
    it('should not have draggable attribute (uses pointer events instead)', () => {
      const item = createMockItem();
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).not.toHaveAttribute('draggable');
    });

    it('should have onPointerDown handler for drag', () => {
      const item = createMockItem();
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toBeInTheDocument();
    });
  });

  describe('Label Display', () => {
    it('should display item name from library', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
    });

    it('should handle missing library item gracefully', () => {
      const emptyGetItemById = () => undefined;
      const item = createMockItem();
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={emptyGetItemById}
        />
      );

      const label = container.querySelector('.placed-item-label');
      expect(label).toBeInTheDocument();
      expect(label?.textContent).toBe('');
    });

    it('should display custom item name', () => {
      const customGetItemById = () => ({
        id: 'organizer-2x3',
        name: '2x3 Organizer',
        widthUnits: 2,
        heightUnits: 3,
        color: '#f59e0b',
        categories: ['organizer'],
      });

      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={customGetItemById}
        />
      );

      expect(screen.getByText('2x3 Organizer')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero grid dimensions', () => {
      const item = createMockItem({ x: 0, y: 0, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={0}
          gridY={0}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      // Division by zero results in Infinity
      expect(element).toBeInTheDocument();
    });

    it('should handle very small items', () => {
      const item = createMockItem({ x: 0, y: 0, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={10}
          gridY={10}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        width: '10%',
        height: '10%',
      });
    });

    it('should handle both selected and invalid states', () => {
      const item = createMockItem({ isValid: false });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveClass('selected');
      expect(element).toHaveClass('invalid');
    });

    it('should render with rotated item dimensions', () => {
      const item = createMockItem({
        x: 1,
        y: 1,
        width: 2,
        height: 1,
        rotation: 90,
      });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        width: '50%',  // 2/4
        height: '25%', // 1/4
      });
    });
  });

  describe('Regression Tests', () => {
    it('should have placed-item class for CSS absolute positioning', () => {
      const item = createMockItem({ x: 0, y: 0, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      // The .placed-item class applies position: absolute in CSS
      const element = container.querySelector('.placed-item');
      expect(element).toBeInTheDocument();
      expect(element).toHaveClass('placed-item');
    });

    it('should handle percentage precision with repeating decimals (1/3 grid)', () => {
      const item = createMockItem({ x: 1, y: 1, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={3}
          gridY={3}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      // 1/3 = 33.33333...%
      expect(element).toHaveStyle({
        left: '33.33333333333333%',
        top: '33.33333333333333%',
        width: '33.33333333333333%',
        height: '33.33333333333333%',
      });
    });

    it('should handle large grid (100x100) calculations correctly', () => {
      const item = createMockItem({ x: 50, y: 75, width: 2, height: 3 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={100}
          gridY={100}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        left: '50%',
        top: '75%',
        width: '2%',
        height: '3%',
      });
    });
  });

  describe('Inline Delete Button', () => {
    const mockOnDelete = vi.fn();

    beforeEach(() => {
      mockOnDelete.mockClear();
    });

    it('should render delete button when selected and onDelete provided', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={mockOnDelete}
        />
      );

      const deleteBtn = screen.getByRole('button', { name: 'Remove item' });
      expect(deleteBtn).toBeInTheDocument();
    });

    it('should NOT render delete button when not selected', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByRole('button', { name: 'Remove item' })).not.toBeInTheDocument();
    });

    it('should NOT render delete button when onDelete not provided', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.queryByRole('button', { name: 'Remove item' })).not.toBeInTheDocument();
    });

    it('should call onDelete with correct instanceId on click', () => {
      const item = createMockItem({ instanceId: 'delete-me-123' });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={mockOnDelete}
        />
      );

      const deleteBtn = screen.getByRole('button', { name: 'Remove item' });
      fireEvent.click(deleteBtn);

      expect(mockOnDelete).toHaveBeenCalledWith('delete-me-123');
      expect(mockOnDelete).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger onSelect when delete button is clicked', () => {
      const item = createMockItem();
      mockOnSelect.mockClear();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={mockOnDelete}
        />
      );

      const deleteBtn = screen.getByRole('button', { name: 'Remove item' });
      fireEvent.click(deleteBtn);

      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('should NOT propagate click to parent', () => {
      const item = createMockItem();
      const parentClickHandler = vi.fn();
      render(
        <div onClick={parentClickHandler}>
          <PlacedItemOverlay
            item={item}
            gridX={4}
            gridY={4}
            isSelected={true}
            onSelect={mockOnSelect}
            getItemById={mockGetItemById}
            onDelete={mockOnDelete}
          />
        </div>
      );

      const deleteBtn = screen.getByRole('button', { name: 'Remove item' });
      fireEvent.click(deleteBtn);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it('should have draggable="false" attribute', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={mockOnDelete}
        />
      );

      const deleteBtn = screen.getByRole('button', { name: 'Remove item' });
      expect(deleteBtn).toHaveAttribute('draggable', 'false');
    });

    it('should have aria-label="Remove item"', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={mockOnDelete}
        />
      );

      const deleteBtn = screen.getByRole('button', { name: 'Remove item' });
      expect(deleteBtn).toHaveAttribute('aria-label', 'Remove item');
    });
  });

  describe('Inline Rotate Buttons', () => {
    const mockOnRotateCw = vi.fn();
    const mockOnRotateCcw = vi.fn();

    beforeEach(() => {
      mockOnRotateCw.mockClear();
      mockOnRotateCcw.mockClear();
    });

    it('should render CW and CCW rotate buttons when selected and handlers provided', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onRotateCw={mockOnRotateCw}
          onRotateCcw={mockOnRotateCcw}
        />
      );

      expect(screen.getByRole('button', { name: 'Rotate counter-clockwise' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rotate clockwise' })).toBeInTheDocument();
    });

    it('should NOT render rotate buttons when not selected', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onRotateCw={mockOnRotateCw}
          onRotateCcw={mockOnRotateCcw}
        />
      );

      expect(screen.queryByRole('button', { name: 'Rotate counter-clockwise' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Rotate clockwise' })).not.toBeInTheDocument();
    });

    it('should call onRotateCw with instanceId on CW button click', () => {
      const item = createMockItem({ instanceId: 'rotate-me-123' });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onRotateCw={mockOnRotateCw}
          onRotateCcw={mockOnRotateCcw}
        />
      );

      const cwBtn = screen.getByRole('button', { name: 'Rotate clockwise' });
      fireEvent.click(cwBtn);

      expect(mockOnRotateCw).toHaveBeenCalledWith('rotate-me-123');
    });

    it('should call onRotateCcw with instanceId on CCW button click', () => {
      const item = createMockItem({ instanceId: 'rotate-me-456' });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onRotateCw={mockOnRotateCw}
          onRotateCcw={mockOnRotateCcw}
        />
      );

      const ccwBtn = screen.getByRole('button', { name: 'Rotate counter-clockwise' });
      fireEvent.click(ccwBtn);

      expect(mockOnRotateCcw).toHaveBeenCalledWith('rotate-me-456');
    });

    it('should NOT propagate click to parent', () => {
      const item = createMockItem();
      const parentClickHandler = vi.fn();
      render(
        <div onClick={parentClickHandler}>
          <PlacedItemOverlay
            item={item}
            gridX={4}
            gridY={4}
            isSelected={true}
            onSelect={mockOnSelect}
            getItemById={mockGetItemById}
            onRotateCw={mockOnRotateCw}
            onRotateCcw={mockOnRotateCcw}
          />
        </div>
      );

      const cwBtn = screen.getByRole('button', { name: 'Rotate clockwise' });
      fireEvent.click(cwBtn);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Image Rendering', () => {
    const mockGetItemByIdWithImage = (id: string): LibraryItem | undefined => {
      const items: Record<string, LibraryItem> = {
        'bin-with-image': {
          id: 'bin-with-image',
          name: 'Bin with Image',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'https://example.com/image.png',
        },
        'bin-no-image': {
          id: 'bin-no-image',
          name: 'Bin without Image',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
        },
      };
      return items[id];
    };

    it('should render image when imageUrl is provided', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/image.png');
    });

    it('should have loading="lazy" attribute on image', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('loading', 'lazy');
    });

    it('should use item name as alt text', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('alt', 'Bin with Image');
    });

    it('should have hidden class before image loads', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toHaveClass('hidden');
      expect(image).not.toHaveClass('visible');
    });

    it('should toggle to visible class when image loads', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toHaveClass('hidden');

      fireEvent.load(image);

      expect(image).toHaveClass('visible');
      expect(image).not.toHaveClass('hidden');
    });

    it('should not render image when no imageUrl is provided', () => {
      const item = createMockItem({ itemId: 'bin-no-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).not.toBeInTheDocument();
    });

    it('should show colored background when no imageUrl is provided', () => {
      const item = createMockItem({ itemId: 'bin-no-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        backgroundColor: '#3B82F666',
        borderColor: '#3B82F6',
      });
    });

    it('should hide image and show colored background when image fails to load', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toBeInTheDocument();

      fireEvent.error(image);

      // Image element should be removed from DOM after error
      const imageAfterError = container.querySelector('.placed-item-image');
      expect(imageAfterError).not.toBeInTheDocument();

      // Background color should still be visible
      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        backgroundColor: '#3B82F666',
        borderColor: '#3B82F6',
      });
    });

    it('should show colored background while image is loading', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      // Before image loads, background should be visible
      const element = container.querySelector('.placed-item');
      expect(element).toHaveStyle({
        backgroundColor: '#3B82F666',
        borderColor: '#3B82F6',
      });
    });

    it('should handle imageUrl changing during load', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container, rerender } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toHaveAttribute('src', 'https://example.com/image.png');

      // Change the imageUrl
      const updatedGetItemById = (id: string): LibraryItem | undefined => {
        if (id === 'bin-with-image') {
          return {
            id: 'bin-with-image',
            name: 'Bin with Image',
            widthUnits: 1,
            heightUnits: 1,
            color: '#646cff',
            categories: ['bin'],
            imageUrl: 'https://example.com/new-image.png',
          };
        }
        return undefined;
      };

      rerender(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={updatedGetItemById}
        />
      );

      const newImage = container.querySelector('.placed-item-image');
      expect(newImage).toHaveAttribute('src', 'https://example.com/new-image.png');
      // Should be hidden again since it's a new URL
      expect(newImage).toHaveClass('hidden');
    });

    it('should render multiple placed items with images independently', () => {
      const item1 = createMockItem({ instanceId: 'item-1', itemId: 'bin-with-image', x: 0, y: 0 });
      const item2 = createMockItem({ instanceId: 'item-2', itemId: 'bin-with-image', x: 1, y: 0 });

      const { container } = render(
        <>
          <PlacedItemOverlay
            item={item1}
            gridX={4}
            gridY={4}
            isSelected={false}
            onSelect={mockOnSelect}
            getItemById={mockGetItemByIdWithImage}
          />
          <PlacedItemOverlay
            item={item2}
            gridX={4}
            gridY={4}
            isSelected={false}
            onSelect={mockOnSelect}
            getItemById={mockGetItemByIdWithImage}
          />
        </>
      );

      const images = container.querySelectorAll('.placed-item-image');
      expect(images).toHaveLength(2);
      expect(images[0]).toHaveClass('hidden');
      expect(images[1]).toHaveClass('hidden');

      // Load first image
      fireEvent.load(images[0]);
      expect(images[0]).toHaveClass('visible');
      expect(images[1]).toHaveClass('hidden');

      // Load second image
      fireEvent.load(images[1]);
      expect(images[0]).toHaveClass('visible');
      expect(images[1]).toHaveClass('visible');
    });

    it('should keep label visible on top of image', () => {
      const item = createMockItem({ itemId: 'bin-with-image' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithImage}
        />
      );

      const label = container.querySelector('.placed-item-label');
      expect(label).toBeInTheDocument();
      expect(label?.textContent).toBe('Bin with Image');
    });
  });

  describe('Image View Mode (ortho/perspective)', () => {
    const mockGetItemByIdWithBothImages = (id: string): LibraryItem | undefined => {
      const items: Record<string, LibraryItem> = {
        'bin-both-images': {
          id: 'bin-both-images',
          name: 'Bin Both',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'https://example.com/ortho.png',
          perspectiveImageUrl: 'https://example.com/perspective.png',
        },
        'bin-ortho-only': {
          id: 'bin-ortho-only',
          name: 'Bin Ortho Only',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'https://example.com/ortho.png',
        },
        'bin-no-images': {
          id: 'bin-no-images',
          name: 'Bin No Images',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
        },
      };
      return items[id];
    };

    it('should use ortho imageUrl when imageViewMode is ortho', () => {
      const item = createMockItem({ itemId: 'bin-both-images' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithBothImages}
          imageViewMode="ortho"
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('src', 'https://example.com/ortho.png');
    });

    it('should use perspectiveImageUrl when imageViewMode is perspective', () => {
      const item = createMockItem({ itemId: 'bin-both-images' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithBothImages}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('src', 'https://example.com/perspective.png');
    });

    it('should fall back to ortho imageUrl when perspective mode but no perspectiveImageUrl', () => {
      const item = createMockItem({ itemId: 'bin-ortho-only' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithBothImages}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('src', 'https://example.com/ortho.png');
    });

    it('should render no image when item has no imageUrl regardless of mode', () => {
      const item = createMockItem({ itemId: 'bin-no-images' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithBothImages}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).not.toBeInTheDocument();
    });

    it('should default to ortho when imageViewMode is not provided', () => {
      const item = createMockItem({ itemId: 'bin-both-images' });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithBothImages}
        />
      );

      const image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('src', 'https://example.com/ortho.png');
    });

    it('should switch images when imageViewMode changes', () => {
      const item = createMockItem({ itemId: 'bin-both-images' });
      const { container, rerender } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithBothImages}
          imageViewMode="ortho"
        />
      );

      let image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('src', 'https://example.com/ortho.png');

      rerender(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithBothImages}
          imageViewMode="perspective"
        />
      );

      image = container.querySelector('.placed-item-image');
      expect(image).toHaveAttribute('src', 'https://example.com/perspective.png');
    });
  });

  describe('rotation-specific perspective images', () => {
    // Item has both ortho and perspective image URLs using the -perspective.png convention
    const mockGetItemByIdWithPerspective = (id: string): LibraryItem | undefined => {
      const items: Record<string, LibraryItem> = {
        'bin-perspective': {
          id: 'bin-perspective',
          name: 'Bin Perspective',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'https://example.com/bin-ortho.png',
          perspectiveImageUrl: 'https://example.com/bin-perspective.png',
        },
        'bin-ortho-only': {
          id: 'bin-ortho-only',
          name: 'Bin Ortho Only',
          widthUnits: 1,
          heightUnits: 1,
          color: '#3B82F6',
          categories: ['bin'],
          imageUrl: 'https://example.com/bin-ortho.png',
        },
      };
      return items[id];
    };

    it('should use base perspectiveImageUrl and apply no CSS rotation for 0° in perspective mode', () => {
      const item = createMockItem({ itemId: 'bin-perspective', rotation: 0 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithPerspective}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/bin-perspective.png');
      // No rotation at 0° — style should not contain a rotate transform
      const styleTransform = image.style.transform;
      expect(styleTransform).not.toMatch(/rotate/);
    });

    it('should use -perspective-90.png URL and apply no CSS rotation for 90° in perspective mode', () => {
      const item = createMockItem({ itemId: 'bin-perspective', rotation: 90, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithPerspective}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/bin-perspective-90.png');
      // Pre-rendered rotated image — no CSS rotation needed
      const styleTransform = image.style.transform;
      expect(styleTransform).not.toMatch(/rotate/);
    });

    it('should use -perspective-180.png URL and apply no CSS rotation for 180° in perspective mode', () => {
      const item = createMockItem({ itemId: 'bin-perspective', rotation: 180, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithPerspective}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/bin-perspective-180.png');
      const styleTransform = image.style.transform;
      expect(styleTransform).not.toMatch(/rotate/);
    });

    it('should use -perspective-270.png URL and apply no CSS rotation for 270° in perspective mode', () => {
      const item = createMockItem({ itemId: 'bin-perspective', rotation: 270, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithPerspective}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/bin-perspective-270.png');
      const styleTransform = image.style.transform;
      expect(styleTransform).not.toMatch(/rotate/);
    });

    it('should use imageUrl with CSS rotation for 90° in ortho mode (existing behavior unchanged)', () => {
      const item = createMockItem({ itemId: 'bin-perspective', rotation: 90, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithPerspective}
          imageViewMode="ortho"
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toBeInTheDocument();
      // In ortho mode the base imageUrl is used (not perspective)
      expect(image).toHaveAttribute('src', 'https://example.com/bin-ortho.png');
      // Ortho mode still applies CSS rotation
      const styleTransform = image.style.transform;
      expect(styleTransform).toMatch(/rotate\(90deg\)/);
    });

    it('should fall back to imageUrl with CSS rotation when perspectiveImageUrl is absent and rotation is 90°', () => {
      const item = createMockItem({ itemId: 'bin-ortho-only', rotation: 90, width: 1, height: 1 });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemByIdWithPerspective}
          imageViewMode="perspective"
        />
      );

      const image = container.querySelector('.placed-item-image') as HTMLImageElement;
      expect(image).toBeInTheDocument();
      // No perspectiveImageUrl — falls back to ortho imageUrl
      expect(image).toHaveAttribute('src', 'https://example.com/bin-ortho.png');
      // Because there is no pre-rendered rotated perspective image, CSS rotation is applied as fallback
      const styleTransform = image.style.transform;
      expect(styleTransform).toMatch(/rotate\(90deg\)/);
    });
  });

  describe('Customization Badges', () => {
    it('should NOT render customization badges when customization is undefined', () => {
      const item = createMockItem({ customization: undefined });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badges = container.querySelector('.placed-item-badges');
      expect(badges).not.toBeInTheDocument();
    });

    it('should NOT render customization badges when customization is default', () => {
      const item = createMockItem({ customization: DEFAULT_BIN_CUSTOMIZATION });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badges = container.querySelector('.placed-item-badges');
      expect(badges).not.toBeInTheDocument();
    });

    it('should render wall pattern badge when wall pattern is enabled', () => {
      const item = createMockItem({
        customization: {
          ...DEFAULT_BIN_CUSTOMIZATION,
          wallPatternEnabled: true,
          wallPattern: 'grid',
        },
      });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badge = container.querySelector('.placed-item-badge');
      expect(badge).toBeInTheDocument();
      expect(badge?.textContent).toMatch(/grid/i);
    });

    it('should render lip style badge when lip style is non-default', () => {
      const item = createMockItem({
        customization: {
          ...DEFAULT_BIN_CUSTOMIZATION,
          lipStyle: 'reduced',
        },
      });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badge = container.querySelector('.placed-item-badge');
      expect(badge).toBeInTheDocument();
      expect(badge?.textContent).toMatch(/lip/i);
    });

    it('should render finger slide badge when finger slide is non-default', () => {
      const item = createMockItem({
        customization: {
          ...DEFAULT_BIN_CUSTOMIZATION,
          fingerSlide: 'rounded',
        },
      });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badge = container.querySelector('.placed-item-badge');
      expect(badge).toBeInTheDocument();
      expect(badge?.textContent).toMatch(/slide/i);
    });

    it('should render wall cutout badge when wall cutout is non-default', () => {
      const item = createMockItem({
        customization: {
          ...DEFAULT_BIN_CUSTOMIZATION,
          wallCutout: { front: true, back: true, left: false, right: false },
        },
      });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badge = container.querySelector('.placed-item-badge');
      expect(badge).toBeInTheDocument();
      expect(badge?.textContent).toMatch(/cutout/i);
    });

    it('should render multiple badges when multiple customizations are non-default', () => {
      const item = createMockItem({
        customization: {
          wallPatternEnabled: true,
          wallPattern: 'grid',
          lipStyle: 'reduced',
          fingerSlide: 'rounded',
          wallCutout: { front: false, back: false, left: false, right: false },
          height: 4,
        },
      });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badges = container.querySelectorAll('.placed-item-badge');
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });

    it('should render badges even when item is not selected', () => {
      const item = createMockItem({
        customization: {
          ...DEFAULT_BIN_CUSTOMIZATION,
          wallPatternEnabled: true,
          wallPattern: 'grid',
        },
      });
      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      const badge = container.querySelector('.placed-item-badge');
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Right-click Context Menu', () => {
    it('opens context menu on right-click', () => {
      render(
        <PlacedItemOverlay
          item={createMockItem()}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={vi.fn()}
          onRotateCw={vi.fn()}
          onRotateCcw={vi.fn()}
          onDuplicate={vi.fn()}
          onCustomizationChange={vi.fn()}
          onCustomizationReset={vi.fn()}
        />
      );
      const root = document.querySelector('.placed-item') as HTMLElement;
      fireEvent.contextMenu(root);
      expect(screen.getByRole('menu')).toBeDefined();
    });

    it('selects the bin on right-click if not selected', () => {
      const onSelect = vi.fn();
      render(
        <PlacedItemOverlay
          item={createMockItem()}
          gridX={4} gridY={4}
          isSelected={false}
          onSelect={onSelect}
          getItemById={mockGetItemById}
          onDelete={vi.fn()}
          onRotateCw={vi.fn()}
          onRotateCcw={vi.fn()}
          onDuplicate={vi.fn()}
        />
      );
      const root = document.querySelector('.placed-item') as HTMLElement;
      fireEvent.contextMenu(root);
      expect(onSelect).toHaveBeenCalledWith('test-item-1', { shift: false, ctrl: false });
    });

    it('closes context menu when a menu action is taken', () => {
      const onDelete = vi.fn();
      render(
        <PlacedItemOverlay
          item={createMockItem()}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDelete={onDelete}
          onRotateCw={vi.fn()}
          onRotateCcw={vi.fn()}
          onDuplicate={vi.fn()}
          onCustomizationChange={vi.fn()}
          onCustomizationReset={vi.fn()}
        />
      );
      const root = document.querySelector('.placed-item') as HTMLElement;
      fireEvent.contextMenu(root);
      expect(screen.getByRole('menu')).toBeDefined();
      fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('should open customization popover when Customize is chosen from context menu', async () => {
      const { container } = render(
        <PlacedItemOverlay
          item={createMockItemWithLibrary()}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          onCustomizationReset={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );
      // Wait for libraryMeta to load so the gear button is rendered and ref is attached
      await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      const root = container.querySelector('.placed-item') as HTMLElement;
      fireEvent.contextMenu(root);
      fireEvent.click(screen.getByRole('menuitem', { name: /customize/i }));
      const popover = document.body.querySelector('.placed-item-customize-popover');
      expect(popover).toBeInTheDocument();
    });
  });

  describe('Duplicate Button', () => {
    it('does not render duplicate button when not selected', () => {
      const onDuplicate = vi.fn();
      render(
        <PlacedItemOverlay
          item={createMockItem()}
          gridX={4} gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDuplicate={onDuplicate}
        />
      );
      expect(screen.queryByRole('button', { name: /duplicate/i })).toBeNull();
    });

    it('renders duplicate button when selected', () => {
      const onDuplicate = vi.fn();
      render(
        <PlacedItemOverlay
          item={createMockItem()}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDuplicate={onDuplicate}
        />
      );
      expect(screen.getByRole('button', { name: /duplicate/i })).toBeDefined();
    });

    it('calls onDuplicate when duplicate button is clicked', () => {
      const onDuplicate = vi.fn();
      render(
        <PlacedItemOverlay
          item={createMockItem()}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onDuplicate={onDuplicate}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));
      expect(onDuplicate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Inline Customize Button', () => {
    const mockOnCustomizationChange = vi.fn();

    beforeEach(() => {
      mockOnCustomizationChange.mockClear();
    });

    it('should render customize button when selected and handlers provided', async () => {
      const item = createMockItemWithLibrary();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      expect(customizeBtn).toBeInTheDocument();
    });

    it('should NOT render customize button when not selected', () => {
      const item = createMockItemWithLibrary();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    });

    it('should NOT render customize button when no handler provided', () => {
      const item = createMockItem();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );

      expect(screen.queryByRole('button', { name: 'Customize' })).not.toBeInTheDocument();
    });

    it('should NOT propagate click to parent', async () => {
      const item = createMockItemWithLibrary();
      const parentClickHandler = vi.fn();
      render(
        <div onClick={parentClickHandler}>
          <PlacedItemOverlay
            item={item}
            gridX={4}
            gridY={4}
            isSelected={true}
            onSelect={mockOnSelect}
            getItemById={mockGetItemById}
            onCustomizationChange={mockOnCustomizationChange}
            getLibraryMeta={mockGetLibraryMeta}
          />
        </div>
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it('should toggle customization popover when clicked', async () => {
      const item = createMockItemWithLibrary();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover');
      expect(popover).toBeInTheDocument();
    });

    it('should render popover with position fixed style', async () => {
      const item = createMockItemWithLibrary({ instanceId: 'i1' });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover') as HTMLElement;
      expect(popover).toBeInTheDocument();
      expect(popover.style.position).toBe('fixed');
    });

    it('should render popover in document.body (portal) to escape CSS transforms', async () => {
      const { container } = render(
        <PlacedItemOverlay
          item={createMockItemWithLibrary({ instanceId: 'i-portal' })}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      // Popover must NOT be inside the component container (would be affected by ancestor transforms)
      const popoverInContainer = container.querySelector('.placed-item-customize-popover');
      expect(popoverInContainer).not.toBeInTheDocument();

      // Popover MUST be in document.body (portaled out of transform context)
      const popoverInBody = document.body.querySelector('.placed-item-customize-popover');
      expect(popoverInBody).toBeInTheDocument();
    });

    it('should add direction class to popover', async () => {
      const item = createMockItemWithLibrary({ instanceId: 'i1' });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover') as HTMLElement;
      expect(popover).toBeInTheDocument();
      // jsdom has no real layout so top=0, space above=0, direction will be 'below'
      expect(
        popover.classList.contains('placed-item-customize-popover--above') ||
        popover.classList.contains('placed-item-customize-popover--below')
      ).toBe(true);
    });
  });

  describe('Customization Popover', () => {
    const mockOnCustomizationChange = vi.fn();
    const mockOnCustomizationReset = vi.fn();

    beforeEach(() => {
      mockOnCustomizationChange.mockClear();
      mockOnCustomizationReset.mockClear();
    });

    it('should render customization fields when popover is open', async () => {
      const item = createMockItemWithLibrary();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      expect(screen.getByLabelText('Wall Pattern')).toBeInTheDocument();
      expect(screen.getByLabelText('Lip Style')).toBeInTheDocument();
      expect(screen.getByLabelText('Finger Slide')).toBeInTheDocument();
      // Wall Cutout is now a fieldset with checkboxes
      expect(screen.getByRole('group', { name: 'Wall Cutout' })).toBeInTheDocument();
    });

    it('should call onCustomizationChange when popover is closed after a select value changes', async () => {
      const item = createMockItemWithLibrary({
        instanceId: 'custom-item-123',
        customization: { ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true, wallPattern: 'grid' },
      });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const wallPatternStyleSelect = screen.getByLabelText('Style') as HTMLSelectElement;
      fireEvent.change(wallPatternStyleSelect, { target: { value: 'hexgrid' } });

      // Change is buffered in draft — onCustomizationChange not called yet
      expect(mockOnCustomizationChange).not.toHaveBeenCalled();

      // Dismiss the popover
      const closeBtn = screen.getByRole('button', { name: 'Close customization' });
      fireEvent.click(closeBtn);

      expect(mockOnCustomizationChange).toHaveBeenCalledWith(
        'custom-item-123',
        expect.objectContaining({ wallPattern: 'hexgrid' })
      );
    });

    it('should apply draft and trigger generation when item is deselected while popover is open', async () => {
      const mockOnCustomizationChangeWithGeneration = vi.fn();
      const item = createMockItemWithLibrary({
        instanceId: 'custom-item-deselect',
        customization: { ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true, wallPattern: 'grid' },
      });
      const { rerender } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          onCustomizationChangeWithGeneration={mockOnCustomizationChangeWithGeneration}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const wallPatternStyleSelect = screen.getByLabelText('Style') as HTMLSelectElement;
      fireEvent.change(wallPatternStyleSelect, { target: { value: 'hexgrid' } });

      expect(mockOnCustomizationChange).not.toHaveBeenCalled();

      // Simulate click-outside by deselecting the item
      rerender(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          onCustomizationChangeWithGeneration={mockOnCustomizationChangeWithGeneration}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      expect(mockOnCustomizationChange).toHaveBeenCalledWith(
        'custom-item-deselect',
        expect.objectContaining({ wallPattern: 'hexgrid' })
      );
      expect(mockOnCustomizationChangeWithGeneration).toHaveBeenCalledWith(
        'custom-item-deselect',
        expect.objectContaining({ wallPattern: 'hexgrid' })
      );
    });

    it('should render reset button in popover', async () => {
      const item = createMockItemWithLibrary();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          onCustomizationReset={mockOnCustomizationReset}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const resetBtn = screen.getByRole('button', { name: /reset to defaults/i });
      expect(resetBtn).toBeInTheDocument();
    });

    it('should call onCustomizationReset when reset is clicked', async () => {
      const item = createMockItemWithLibrary({
        instanceId: 'custom-item-456',
        customization: {
          wallPatternEnabled: true,
          wallPattern: 'grid',
          lipStyle: 'normal',
          fingerSlide: 'none',
          wallCutout: { front: false, back: false, left: false, right: false },
          height: 4,
        },
      });
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          onCustomizationReset={mockOnCustomizationReset}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const resetBtn = screen.getByRole('button', { name: /reset to defaults/i });
      fireEvent.click(resetBtn);

      expect(mockOnCustomizationReset).toHaveBeenCalledWith('custom-item-456');
    });

    it('should close popover when close button is clicked', async () => {
      const item = createMockItemWithLibrary();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover');
      expect(popover).toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: 'Close customization' });
      fireEvent.click(closeBtn);

      const popoverAfterClose = document.body.querySelector('.placed-item-customize-popover');
      expect(popoverAfterClose).not.toBeInTheDocument();
    });

    it('should have role="dialog" on the popover', async () => {
      const item = createMockItemWithLibrary();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = screen.getByRole('dialog');
      expect(popover).toBeInTheDocument();
      expect(popover).toHaveClass('placed-item-customize-popover');
    });

    it('should stop keyboard event propagation from the popover', async () => {
      const item = createMockItemWithLibrary();
      const mockOnDelete = vi.fn();
      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={mockOnCustomizationChange}
          onDelete={mockOnDelete}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover')!;
      // Fire a Delete keydown inside the popover — it should NOT propagate
      // to the parent .placed-item div which would trigger onDelete
      fireEvent.keyDown(popover, { key: 'Delete' });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('should use --above direction when button has enough space above viewport', async () => {
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 400, bottom: 428, left: 200, right: 228, width: 28, height: 28,
        x: 200, y: 400, toJSON: () => {},
      } as DOMRect);

      render(
        <PlacedItemOverlay
          item={{ ...createMockItemWithLibrary(), instanceId: 'i-above' }}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover') as HTMLElement;
      expect(popover).toBeInTheDocument();
      expect(popover).toHaveClass('placed-item-customize-popover--above');

      spy.mockRestore();
    });

    it('should use --below direction when button is near top of viewport', async () => {
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 50, bottom: 78, left: 200, right: 228, width: 28, height: 28,
        x: 200, y: 50, toJSON: () => {},
      } as DOMRect);

      render(
        <PlacedItemOverlay
          item={{ ...createMockItemWithLibrary(), instanceId: 'i-below' }}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover') as HTMLElement;
      expect(popover).toBeInTheDocument();
      expect(popover).toHaveClass('placed-item-customize-popover--below');

      spy.mockRestore();
    });

    it('should clamp popover left position when button is near left viewport edge', async () => {
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 50, bottom: 78, left: 10, right: 38, width: 28, height: 28,
        x: 10, y: 50, toJSON: () => {},
      } as DOMRect);

      render(
        <PlacedItemOverlay
          item={{ ...createMockItemWithLibrary(), instanceId: 'i-left' }}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover') as HTMLElement;
      expect(popover).toBeInTheDocument();
      // left should be clamped to at least MARGIN (8px)
      const left = parseFloat(popover.style.left);
      expect(left).toBeGreaterThanOrEqual(8);

      spy.mockRestore();
    });

    it('should clamp popover left position when button is near right viewport edge', async () => {
      // jsdom default innerWidth is 1024; place button near right edge
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 50, bottom: 78, left: 990, right: 1018, width: 28, height: 28,
        x: 990, y: 50, toJSON: () => {},
      } as DOMRect);

      render(
        <PlacedItemOverlay
          item={{ ...createMockItemWithLibrary(), instanceId: 'i-right' }}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover') as HTMLElement;
      expect(popover).toBeInTheDocument();
      // left should be clamped: max is innerWidth(1024) - popoverWidth(260) - margin(8) = 756
      const left = parseFloat(popover.style.left);
      expect(left).toBeLessThanOrEqual(756);

      spy.mockRestore();
    });

    it('should recompute popover position on window resize', async () => {
      let mockTop = 400;
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
        top: mockTop, bottom: mockTop + 28, left: 200, right: 228, width: 28, height: 28,
        x: 200, y: mockTop, toJSON: () => {},
      } as DOMRect));

      render(
        <PlacedItemOverlay
          item={{ ...createMockItemWithLibrary(), instanceId: 'i-resize' }}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      const popover = document.body.querySelector('.placed-item-customize-popover') as HTMLElement;
      const topBefore = parseFloat(popover.style.top);

      // Simulate button moving lower during resize
      mockTop = 600;
      window.dispatchEvent(new Event('resize'));

      await waitFor(() => {
        const topAfter = parseFloat(popover.style.top);
        expect(topAfter).not.toBe(topBefore);
      });

      spy.mockRestore();
    });

    it('should compute a fresh position when popover is re-opened after close', async () => {
      let mockTop = 400;
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
        top: mockTop, bottom: mockTop + 28, left: 200, right: 228, width: 28, height: 28,
        x: 200, y: mockTop, toJSON: () => {},
      } as DOMRect));

      render(
        <PlacedItemOverlay
          item={{ ...createMockItemWithLibrary(), instanceId: 'i-reopen' }}
          gridX={4} gridY={4}
          isSelected={true}
          onSelect={vi.fn()}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));

      // Open
      fireEvent.click(customizeBtn);
      const topFirst = parseFloat(
        (document.body.querySelector('.placed-item-customize-popover') as HTMLElement).style.top
      );

      // Close via close button
      const closeBtn = document.body.querySelector('.placed-item-customize-popover-close') as HTMLElement;
      fireEvent.click(closeBtn);
      expect(document.body.querySelector('.placed-item-customize-popover')).not.toBeInTheDocument();

      // Move button before re-open
      mockTop = 600;

      // Re-open
      fireEvent.click(customizeBtn);
      const topSecond = parseFloat(
        (document.body.querySelector('.placed-item-customize-popover') as HTMLElement).style.top
      );

      expect(topSecond).not.toBe(topFirst);

      spy.mockRestore();
    });
  });

  describe('Static STL Items', () => {
    it('does not show customize gear button when item has stlFile', async () => {
      const item: PlacedItemWithValidity = {
        instanceId: 'test-utensil',
        itemId: 'utensil-1x3',
        x: 0, y: 0, width: 1, height: 3, rotation: 0, isValid: true,
      };

      render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      expect(screen.queryByTitle('Customize bin options')).not.toBeInTheDocument();
    });

    it('does not show Customize option in context menu when item has stlFile', async () => {
      const item: PlacedItemWithValidity = {
        instanceId: 'test-utensil',
        itemId: 'utensil-1x3',
        x: 0, y: 0, width: 1, height: 3, rotation: 0, isValid: true,
      };

      const { container } = render(
        <PlacedItemOverlay
          item={item}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={mockGetLibraryMeta}
        />
      );

      const root = container.querySelector('.placed-item') as HTMLElement;
      fireEvent.contextMenu(root);

      expect(screen.queryByRole('menuitem', { name: /customize/i })).not.toBeInTheDocument();
    });
  });

  describe('Generation State', () => {
    it('shows spinner when generationEntry is pending', () => {
      render(
        <PlacedItemOverlay
          item={{ instanceId: 'test-item-1', itemId: 'bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 as const, isValid: true }}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          generationEntry={{ hash: 'abc', status: 'pending' }}
        />
      );
      expect(screen.getByRole('status', { name: /generating/i })).toBeInTheDocument();
    });

    it('shows error icon when generationEntry is failed', () => {
      render(
        <PlacedItemOverlay
          item={{ instanceId: 'test-item-1', itemId: 'bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 as const, isValid: true }}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          generationEntry={{ hash: 'abc', status: 'failed' }}
        />
      );
      expect(screen.getByRole('status', { name: /generation failed/i })).toBeInTheDocument();
    });

    it('shows generated image src when generationEntry is complete', () => {
      render(
        <PlacedItemOverlay
          item={{ instanceId: 'test-item-1', itemId: 'bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 as const, isValid: true }}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          generationEntry={{ hash: 'abc123', status: 'complete' }}
        />
      );
      const img = screen.queryByRole('img');
      // Image should be using the generated URL, which comes from the mocked generatedImageUrl
      if (img) {
        expect(img.getAttribute('src')).toBeTruthy();
      }
      // Spinner should not be visible
      expect(screen.queryByRole('status', { name: /generating/i })).not.toBeInTheDocument();
      // Error icon should not be visible
      expect(screen.queryByRole('status', { name: /generation failed/i })).not.toBeInTheDocument();
    });

    it('shows normal image when no generationEntry provided', () => {
      render(
        <PlacedItemOverlay
          item={{ instanceId: 'test-item-1', itemId: 'bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 as const, isValid: true }}
          gridX={4}
          gridY={4}
          isSelected={false}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
        />
      );
      expect(screen.queryByRole('status', { name: /generating/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('status', { name: /generation failed/i })).not.toBeInTheDocument();
    });

    it('does not open customization popover when unauthenticated user clicks gear', async () => {
      // Override useAuth for this test to return isAuthenticated: false
      mockUseAuth.mockImplementation(() => ({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        getAccessToken: () => null,
      }));

      render(
        <PlacedItemOverlay
          item={{ instanceId: 'test-item-1', itemId: 'testlib:bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 as const, isValid: true }}
          gridX={4}
          gridY={4}
          isSelected={true}
          onSelect={mockOnSelect}
          getItemById={mockGetItemById}
          onCustomizationChange={vi.fn()}
          getLibraryMeta={async () => ({ customizableFields: [{ field: 'lipStyle', label: 'Lip Style', options: ['normal', 'reduced', 'minimum', 'none'] }], parameters: {} })}
        />
      );

      const customizeBtn = await waitFor(() => screen.getByRole('button', { name: 'Customize' }));
      fireEvent.click(customizeBtn);

      // The popover should NOT open when unauthenticated — auth gate redirects instead
      const popover = document.body.querySelector('.placed-item-customize-popover');
      expect(popover).not.toBeInTheDocument();
    });
  });

});
