import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemPreviewPopover } from './ItemPreviewPopover';
import type { LibraryItem } from '../types/gridfinity';

describe('ItemPreviewPopover', () => {
  const baseItem: LibraryItem = {
    id: 'bin-1x1',
    name: '1x1 Bin',
    widthUnits: 1,
    heightUnits: 1,
    color: '#3B82F6',
    categories: ['bin'],
    imageUrl: '/libraries/bins_standard/bin-1x1.png',
    perspectiveImageUrl: '/libraries/bins_standard/bin-1x1-perspective.png',
  };

  const anchorRect = new DOMRect(100, 200, 80, 60);

  it('should render perspective image when available', () => {
    render(<ItemPreviewPopover item={baseItem} anchorRect={anchorRect} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', baseItem.perspectiveImageUrl);
    expect(img).toHaveAttribute('alt', baseItem.name);
  });

  it('should fall back to top-down image when no perspective image', () => {
    const itemNoPerspective: LibraryItem = {
      ...baseItem,
      perspectiveImageUrl: undefined,
    };

    render(<ItemPreviewPopover item={itemNoPerspective} anchorRect={anchorRect} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', baseItem.imageUrl);
  });

  it('should display item name', () => {
    render(<ItemPreviewPopover item={baseItem} anchorRect={anchorRect} />);

    expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
  });

  it('should display item size', () => {
    render(<ItemPreviewPopover item={baseItem} anchorRect={anchorRect} />);

    expect(screen.getByText('1x1')).toBeInTheDocument();
  });

  it('should have pointer-events: none class', () => {
    render(<ItemPreviewPopover item={baseItem} anchorRect={anchorRect} />);

    const popover = document.body.querySelector('.item-preview-popover');
    expect(popover).toBeInTheDocument();
  });

  it('should render via portal to document.body', () => {
    render(<ItemPreviewPopover item={baseItem} anchorRect={anchorRect} />);

    const popover = document.body.querySelector('.item-preview-popover');
    expect(popover).toBeInTheDocument();
  });

  it('should show larger size text for multi-unit items', () => {
    const largeItem: LibraryItem = {
      ...baseItem,
      id: 'bin-3x2',
      name: '3x2 Bin',
      widthUnits: 3,
      heightUnits: 2,
    };

    render(<ItemPreviewPopover item={largeItem} anchorRect={anchorRect} />);

    expect(screen.getByText('3x2')).toBeInTheDocument();
  });
});
