import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ItemLibrary } from './ItemLibrary';
import type { LibraryItem } from '../types/gridfinity';

const mockLibraryItems: LibraryItem[] = [
  { id: 'bin-1x1', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#646cff', categories: ['bin'] },
  { id: 'bin-2x2', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#646cff', categories: ['bin'] },
  { id: 'divider-1x1', name: '1x1 Divider', widthUnits: 1, heightUnits: 1, color: '#22c55e', categories: ['divider'] },
  { id: 'organizer-1x3', name: '1x3 Organizer', widthUnits: 1, heightUnits: 3, color: '#f59e0b', categories: ['organizer'] },
];

describe('ItemLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should render all items flat', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

    expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
    expect(screen.getByText('2x2 Bin')).toBeInTheDocument();
    expect(screen.getByText('1x1 Divider')).toBeInTheDocument();
    expect(screen.getByText('1x3 Organizer')).toBeInTheDocument();
  });

  it('should filter items by activeCategory', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} activeCategory="bin" />);

    expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
    expect(screen.getByText('2x2 Bin')).toBeInTheDocument();
    expect(screen.queryByText('1x1 Divider')).not.toBeInTheDocument();
    expect(screen.queryByText('1x3 Organizer')).not.toBeInTheDocument();
  });

  it('should render search input', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);
    expect(screen.getByPlaceholderText('Search items...')).toBeInTheDocument();
  });

  it('should filter items by search query', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);
    const searchInput = screen.getByPlaceholderText('Search items...');

    fireEvent.change(searchInput, { target: { value: '2x2' } });

    expect(screen.getByText('2x2 Bin')).toBeInTheDocument();
    expect(screen.queryByText('1x1 Bin')).not.toBeInTheDocument();
  });

  it('should show clear button when search has text', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);
    const searchInput = screen.getByPlaceholderText('Search items...');

    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'bin' } });

    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('should clear search when clear button clicked', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);
    const searchInput = screen.getByPlaceholderText('Search items...') as HTMLInputElement;

    fireEvent.change(searchInput, { target: { value: 'test' } });
    expect(searchInput.value).toBe('test');

    fireEvent.click(screen.getByLabelText('Clear search'));

    expect(searchInput.value).toBe('');
  });

  it('should show no results message when search has no matches', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);
    const searchInput = screen.getByPlaceholderText('Search items...');

    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText(/No items found matching "nonexistent"/)).toBeInTheDocument();
  });

  it('should show all items when no filters are selected', () => {
    render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

    expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
    expect(screen.getByText('2x2 Bin')).toBeInTheDocument();
    expect(screen.getByText('1x3 Organizer')).toBeInTheDocument();
  });

  describe('Dimension Filtering', () => {
    it('should hide filters by default', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      expect(screen.getByText(/Filter by Size/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '1x' })).not.toBeInTheDocument();
    });

    it('should show filters when toggle button is clicked', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));

      expect(screen.getAllByRole('button', { name: '1x' })).toHaveLength(2); // width and height
    });

    it('should hide filters when toggle button is clicked again', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      const toggleButton = screen.getByText(/Filter by Size/);
      fireEvent.click(toggleButton);
      expect(screen.getAllByRole('button', { name: '1x' })).toHaveLength(2);

      fireEvent.click(toggleButton);
      expect(screen.queryByRole('button', { name: '1x' })).not.toBeInTheDocument();
    });

    it('should show active indicator when filters are applied', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      const toggleButton = screen.getByText(/Filter by Size/);
      expect(toggleButton.textContent).not.toContain('●');

      fireEvent.click(toggleButton);
      fireEvent.click(screen.getAllByRole('button', { name: '1x' })[0]);

      expect(toggleButton.textContent).toContain('●');
    });

    it('should filter items by width when width filter is selected', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));
      fireEvent.click(screen.getAllByRole('button', { name: '1x' })[0]);

      expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
      expect(screen.getByText('1x3 Organizer')).toBeInTheDocument();
      expect(screen.queryByText('2x2 Bin')).not.toBeInTheDocument();
    });

    it('should filter items by height when height filter is selected', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));
      fireEvent.click(screen.getAllByRole('button', { name: '3x' })[1]); // second = height

      expect(screen.getByText('1x3 Organizer')).toBeInTheDocument();
      expect(screen.queryByText('1x1 Bin')).not.toBeInTheDocument();
      expect(screen.queryByText('2x2 Bin')).not.toBeInTheDocument();
    });

    it('should combine width and height filters (AND logic)', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));
      const width1Buttons = screen.getAllByRole('button', { name: '1x' });
      fireEvent.click(width1Buttons[0]); // width 1x
      fireEvent.click(width1Buttons[1]); // height 1x

      expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
      expect(screen.queryByText('1x3 Organizer')).not.toBeInTheDocument();
      expect(screen.queryByText('2x2 Bin')).not.toBeInTheDocument();
    });

    it('should allow multiple width selections (OR logic within dimension)', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));
      fireEvent.click(screen.getAllByRole('button', { name: '1x' })[0]);
      fireEvent.click(screen.getAllByRole('button', { name: '2x' })[0]);

      expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
      expect(screen.getByText('2x2 Bin')).toBeInTheDocument();
      expect(screen.getByText('1x3 Organizer')).toBeInTheDocument();
    });

    it('should show "Clear Filters" button when filters are active', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));
      expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument();

      fireEvent.click(screen.getAllByRole('button', { name: '1x' })[0]);
      expect(screen.getByText('Clear Filters')).toBeInTheDocument();
    });

    it('should clear all filters when "Clear Filters" is clicked', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));
      fireEvent.click(screen.getAllByRole('button', { name: '1x' })[0]);
      fireEvent.click(screen.getAllByRole('button', { name: '3x' })[1]);

      fireEvent.click(screen.getByText('Clear Filters'));

      expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
      expect(screen.getByText('2x2 Bin')).toBeInTheDocument();
      expect(screen.getByText('1x3 Organizer')).toBeInTheDocument();
      expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument();
    });

    it('should combine text search with dimension filters', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.change(screen.getByPlaceholderText('Search items...'), { target: { value: 'Bin' } });
      fireEvent.click(screen.getByText(/Filter by Size/));
      fireEvent.click(screen.getAllByRole('button', { name: '1x' })[0]);

      expect(screen.getByText('1x1 Bin')).toBeInTheDocument();
      expect(screen.queryByText('2x2 Bin')).not.toBeInTheDocument();
      expect(screen.queryByText('1x3 Organizer')).not.toBeInTheDocument();
    });

    it('should show no results message when filters have no matches', () => {
      render(<ItemLibrary items={mockLibraryItems} isLoading={false} error={null} />);

      fireEvent.click(screen.getByText(/Filter by Size/));
      fireEvent.click(screen.getAllByRole('button', { name: '5x' })[0]);

      expect(screen.getByText(/No items found/)).toBeInTheDocument();
    });
  });
});
