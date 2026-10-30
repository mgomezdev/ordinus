import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { FavoriteCard } from './FavoriteCard';
import type { FavoriteItem, DragData } from '../types/gridfinity';

const dragSource = vi.fn<(options: { dragData: DragData }) => { onPointerDown: () => void }>(() => ({ onPointerDown: vi.fn() }));

vi.mock('../api/generation.api', () => ({
  generatedImageUrl: (hash: string, file: string) => `/generated/${hash}/${file}`,
}));

vi.mock('../hooks/usePointerDrag', () => ({
  usePointerDragSource: (options: { dragData: DragData }) => dragSource(options),
}));

vi.mock('../hooks/useImageLoadState', () => ({
  useImageLoadState: () => ({
    shouldShowImage: false,
    imageError: false,
    handleImageLoad: vi.fn(),
    handleImageError: vi.fn(),
  }),
}));

const makeFavorite = (spec: { width: number; depth: number; height: number }, overrides: Record<string, unknown> = {}): FavoriteItem => ({
  id: 'fav-custom',
  name: 'Custom bin',
  createdAt: 1000,
  libraryId: 'custom',
  libraryItemId: 'custom-abc123',
  libraryItemName: 'Custom bin',
  widthUnits: spec.width,
  heightUnits: spec.depth,
  color: '#3B82F6',
  paramHash: 'a'.repeat(64),
  imageUrl: '',
  perspectiveImageUrl: null,
  perspectiveImageUrl90: null,
  perspectiveImageUrl180: null,
  perspectiveImageUrl270: null,
  customization: { wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4 } as never,
  customSpec: { ...spec, overrides },
});

function renderedDragData(favorite: FavoriteItem): DragData {
  render(<FavoriteCard favorite={favorite} onRemove={vi.fn()} onRename={vi.fn()} />);
  return dragSource.mock.calls[0][0].dragData;
}

describe('FavoriteCard — custom bins', () => {
  beforeEach(() => dragSource.mockClear());

  it('drags with the custom spec and hash so the grid can place it', () => {
    const favorite = makeFavorite({ width: 3, depth: 2, height: 4 });
    expect(renderedDragData(favorite)).toMatchObject({
      type: 'favorite',
      itemId: 'custom:custom-abc123',
      favoriteCustomSpec: favorite.customSpec,
      favoriteParamHash: favorite.paramHash,
    });
  });

  it('snaps custom bins without half pitch to whole units', () => {
    expect(renderedDragData(makeFavorite({ width: 3, depth: 2, height: 4 }, { half_pitch: false })).snapStep).toBe(2);
  });

  it('lets whole-size custom bins with half pitch drop on half-cells', () => {
    expect(renderedDragData(makeFavorite({ width: 3, depth: 2, height: 4 })).snapStep).toBe(1);
  });

  it('snaps half-unit custom bins to half-cells', () => {
    expect(renderedDragData(makeFavorite({ width: 2.5, depth: 1.5, height: 3.5 })).snapStep).toBe(1);
  });
});
