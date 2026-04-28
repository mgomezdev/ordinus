import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SavedConfigCard } from './SavedConfigCard';
import type { ApiLayout } from '@gridfinity/shared';

vi.mock('../../api/apiClient', () => ({
  API_BASE_URL: 'http://localhost:3001/api/v1',
}));

const mockLayout: ApiLayout = {
  id: 1,
  userId: 10,
  name: 'My Layout',
  description: 'A test layout',
  gridX: 4,
  gridY: 4,
  widthMm: 168,
  depthMm: 168,
  spacerHorizontal: 'none',
  spacerVertical: 'none',
  isPublic: false,
  createdAt: '2026-03-01T00:00:00Z',
  updatedAt: '2026-03-01T00:00:00Z',
  thumbnailUrl: null,
};

const defaultProps = {
  layout: mockLayout,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  isDeleting: false,
};

function renderCard(props: Partial<typeof defaultProps> = {}) {
  return render(
    <MemoryRouter>
      <SavedConfigCard {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('SavedConfigCard', () => {
  it('renders layout name', () => {
    renderCard();
    expect(screen.getByText('My Layout')).toBeInTheDocument();
  });

  it('renders SVG fallback when thumbnailUrl is null', () => {
    renderCard();
    const svg = document.querySelector('.saved-config-thumbnail svg');
    expect(svg).toBeInTheDocument();
    const cells = svg!.querySelectorAll('rect.grid-cell');
    expect(cells).toHaveLength(16); // 4*4
  });

  it('renders <img> with correct src when thumbnailUrl is provided', () => {
    renderCard({ layout: { ...mockLayout, thumbnailUrl: '/thumbnails/1' } });
    const img = document.querySelector('.saved-config-thumbnail img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'http://localhost:3001/api/v1/thumbnails/1');
  });

  it('does not render SVG when thumbnailUrl is provided', () => {
    renderCard({ layout: { ...mockLayout, thumbnailUrl: '/thumbnails/1' } });
    const svg = document.querySelector('.saved-config-thumbnail svg');
    expect(svg).not.toBeInTheDocument();
  });

  it('shows Edit and Duplicate buttons', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument();
  });

  it('calls onEdit when Edit is clicked', () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(1);
  });

  it('requires two clicks to delete (confirm flow)', () => {
    const onDelete = vi.fn();
    renderCard({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });
});
