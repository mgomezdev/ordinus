import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { LibraryItemCard } from './LibraryItemCard';
import type { LibraryItem } from '../types/gridfinity';

describe('LibraryItemCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const itemWithPerspective: LibraryItem = {
    id: 'bin-1x1',
    name: '1x1 Bin',
    widthUnits: 1,
    heightUnits: 1,
    color: '#3B82F6',
    categories: ['bin'],
    imageUrl: '/libraries/bins_standard/bin-1x1.png',
    perspectiveImageUrl: '/libraries/bins_standard/bin-1x1-perspective.png',
  };

  const itemWithoutPerspective: LibraryItem = {
    id: 'utensil-1x1',
    name: '1x1 Utensil',
    widthUnits: 1,
    heightUnits: 1,
    color: '#10B981',
    categories: ['utensil'],
    imageUrl: '/libraries/utensils/utensil-1x1.png',
  };

  const itemNoImages: LibraryItem = {
    id: 'custom-1x1',
    name: '1x1 Custom',
    widthUnits: 1,
    heightUnits: 1,
    color: '#EF4444',
    categories: ['custom'],
  };

  it('should render the card with item name and size', () => {
    render(<LibraryItemCard item={itemWithPerspective} />);

    expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
    expect(screen.getByText('1x1')).toBeInTheDocument();
  });

  it('should not show popover initially', () => {
    render(<LibraryItemCard item={itemWithPerspective} />);

    expect(document.querySelector('.item-preview-popover')).not.toBeInTheDocument();
  });

  it('should show popover after mouse hover delay', () => {
    render(<LibraryItemCard item={itemWithPerspective} />);

    const card = screen.getByRole('button');

    // Simulate mouse enter with React-compatible fireEvent
    fireEvent.pointerEnter(card, { pointerType: 'mouse' });

    // Popover should not appear immediately
    expect(document.querySelector('.item-preview-popover')).not.toBeInTheDocument();

    // Advance past the 200ms delay
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Popover should now be visible
    expect(document.querySelector('.item-preview-popover')).toBeInTheDocument();
  });

  it('should hide popover on mouse leave', () => {
    render(<LibraryItemCard item={itemWithPerspective} />);

    const card = screen.getByRole('button');

    // Show popover
    fireEvent.pointerEnter(card, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector('.item-preview-popover')).toBeInTheDocument();

    // Leave
    fireEvent.pointerLeave(card, { pointerType: 'mouse' });

    expect(document.querySelector('.item-preview-popover')).not.toBeInTheDocument();
  });

  it('should cancel popover timer if mouse leaves before delay', () => {
    render(<LibraryItemCard item={itemWithPerspective} />);

    const card = screen.getByRole('button');

    fireEvent.pointerEnter(card, { pointerType: 'mouse' });

    // Leave before timer fires
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.pointerLeave(card, { pointerType: 'mouse' });

    // Advance past original timer
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(document.querySelector('.item-preview-popover')).not.toBeInTheDocument();
  });

  it('should hide popover on pointer down (drag start)', () => {
    render(<LibraryItemCard item={itemWithPerspective} />);

    const card = screen.getByRole('button');

    // Show popover
    fireEvent.pointerEnter(card, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(document.querySelector('.item-preview-popover')).toBeInTheDocument();

    // Pointer down (start of drag)
    fireEvent.pointerDown(card, { button: 0, pointerType: 'mouse' });

    expect(document.querySelector('.item-preview-popover')).not.toBeInTheDocument();
  });

  it('should not show popover for touch pointerenter', () => {
    render(<LibraryItemCard item={itemWithPerspective} />);

    const card = screen.getByRole('button');

    fireEvent.pointerEnter(card, { pointerType: 'touch' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(document.querySelector('.item-preview-popover')).not.toBeInTheDocument();
  });

  it('should not show popover for item with no images', () => {
    render(<LibraryItemCard item={itemNoImages} />);

    const card = screen.getByRole('button');

    fireEvent.pointerEnter(card, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(document.querySelector('.item-preview-popover')).not.toBeInTheDocument();
  });

  it('should show popover with top-down image for item without perspective', () => {
    render(<LibraryItemCard item={itemWithoutPerspective} />);

    const card = screen.getByRole('button');

    fireEvent.pointerEnter(card, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const popover = document.querySelector('.item-preview-popover');
    expect(popover).toBeInTheDocument();

    const img = popover?.querySelector('img');
    expect(img).toHaveAttribute('src', itemWithoutPerspective.imageUrl);
  });
});
