import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FavoriteCard } from './FavoriteCard';
import type { FavoriteItem } from '../types/gridfinity';

vi.mock('../api/generation.api', () => ({
  generatedImageUrl: (hash: string, file: string) => `/generated/${hash}/${file}`,
}));

vi.mock('../hooks/usePointerDrag', () => ({
  usePointerDragSource: () => ({ onPointerDown: vi.fn() }),
}));

vi.mock('../hooks/useImageLoadState', () => ({
  useImageLoadState: () => ({
    shouldShowImage: false,
    imageError: false,
    handleImageLoad: vi.fn(),
    handleImageError: vi.fn(),
  }),
}));

const mockFavorite: FavoriteItem = {
  id: 'fav1',
  name: 'Bin 2×3×7 (voronoi)',
  createdAt: 1000,
  libraryId: 'bins_standard',
  libraryItemId: 'bin_2x3x7',
  libraryItemName: 'Bin 2×3×7',
  widthUnits: 2,
  heightUnits: 3,
  color: '#3B82F6',
  paramHash: 'abc123',
  imageUrl: '/img.png',
  perspectiveImageUrl: null,
  perspectiveImageUrl90: null,
  perspectiveImageUrl180: null,
  perspectiveImageUrl270: null,
  customization: {
    wallPatternEnabled: true,
    wallPattern: 'voronoi',
    lipStyle: 'normal',
    fingerSlide: 'none',
    wallCutout: 'none',
    height: 4,
  },
};

describe('FavoriteCard', () => {
  const onRemove = vi.fn();
  const onRename = vi.fn();

  beforeEach(() => {
    onRemove.mockClear();
    onRename.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the favorite name', () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    expect(screen.getByText('Bin 2×3×7 (voronoi)')).toBeDefined();
  });

  it('calls onRemove when trash icon is clicked', () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    fireEvent.click(screen.getByLabelText('Remove favorite'));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('activates inline edit on double-click and saves on Enter', () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    const nameEl = screen.getByText('Bin 2×3×7 (voronoi)');
    fireEvent.dblClick(nameEl);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input).toBeDefined();
    fireEvent.change(input, { target: { value: 'My custom bin' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('My custom bin');
  });

  it('cancels inline edit on Escape without calling onRename', () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    const nameEl = screen.getByText('Bin 2×3×7 (voronoi)');
    fireEvent.dblClick(nameEl);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('activates inline edit on 500ms long-press', async () => {
    vi.useFakeTimers();
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    const nameEl = screen.getByText('Bin 2×3×7 (voronoi)');
    act(() => {
      fireEvent.touchStart(nameEl);
    });
    await act(async () => {
      vi.advanceTimersByTime(510);
    });
    expect(screen.getByRole('textbox')).toBeDefined();
  });
});
