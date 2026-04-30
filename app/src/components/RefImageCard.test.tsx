import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RefImageCard } from './RefImageCard';
import type { ApiRefImage } from '@gridfinity/shared';
import { usePointerDragSource } from '../hooks/usePointerDrag';

vi.mock('../hooks/usePointerDrag', () => ({
  usePointerDragSource: vi.fn().mockReturnValue({ onPointerDown: vi.fn() }),
}));

const mockImage: ApiRefImage = {
  id: 42,
  ownerId: 1,
  name: 'test-ref.png',
  isGlobal: false,
  imageUrl: 'ref-lib/abc123.webp',
  fileSize: 2048,
  createdAt: '2024-01-01T00:00:00.000Z',
};

describe('RefImageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders image with correct src URL', () => {
    render(<RefImageCard image={mockImage} />);

    const img = screen.getByRole('img', { name: mockImage.name });
    expect(img).toHaveAttribute('src', 'http://localhost:3001/api/v1/images/ref-lib/abc123.webp');
  });

  it('renders image name', () => {
    render(<RefImageCard image={mockImage} />);

    const nameElement = screen.getByText('test-ref.png');
    expect(nameElement).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    render(<RefImageCard image={mockImage} />);

    const card = screen.getByRole('button', { name: 'test-ref.png. Drag to place on grid.' });
    expect(card).toBeInTheDocument();
  });

  it('shows delete button when onDelete is provided', () => {
    const onDelete = vi.fn();
    render(<RefImageCard image={mockImage} onDelete={onDelete} />);

    const deleteButton = screen.getByRole('button', { name: 'Delete test-ref.png' });
    expect(deleteButton).toBeInTheDocument();
  });

  it('hides delete button when onDelete is undefined', () => {
    render(<RefImageCard image={mockImage} />);

    const deleteButton = screen.queryByRole('button', { name: 'Delete test-ref.png' });
    expect(deleteButton).not.toBeInTheDocument();
  });

  it('calls onDelete with image id after confirming dialog', async () => {
    const onDelete = vi.fn();

    render(<RefImageCard image={mockImage} onDelete={onDelete} />);

    const deleteButton = screen.getByRole('button', { name: 'Delete test-ref.png' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Delete "test-ref.png"?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(42);
    });
  });

  it('does NOT call onDelete when confirm is cancelled', async () => {
    const onDelete = vi.fn();

    render(<RefImageCard image={mockImage} onDelete={onDelete} />);

    const deleteButton = screen.getByRole('button', { name: 'Delete test-ref.png' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onRename with id and trimmed name on double-click', () => {
    const onRename = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  new-name.png  ');

    render(<RefImageCard image={mockImage} onRename={onRename} />);

    const card = screen.getByRole('button', { name: 'test-ref.png. Drag to place on grid.' });
    fireEvent.doubleClick(card);

    expect(promptSpy).toHaveBeenCalledWith('Rename image:', 'test-ref.png');
    expect(onRename).toHaveBeenCalledWith(42, 'new-name.png');

    promptSpy.mockRestore();
  });

  it('does NOT call onRename when prompt returns null', () => {
    const onRename = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);

    render(<RefImageCard image={mockImage} onRename={onRename} />);

    const card = screen.getByRole('button', { name: 'test-ref.png. Drag to place on grid.' });
    fireEvent.doubleClick(card);

    expect(promptSpy).toHaveBeenCalledWith('Rename image:', 'test-ref.png');
    expect(onRename).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('does NOT call onRename when prompt returns same name', () => {
    const onRename = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('test-ref.png');

    render(<RefImageCard image={mockImage} onRename={onRename} />);

    const card = screen.getByRole('button', { name: 'test-ref.png. Drag to place on grid.' });
    fireEvent.doubleClick(card);

    expect(promptSpy).toHaveBeenCalledWith('Rename image:', 'test-ref.png');
    expect(onRename).not.toHaveBeenCalled();

    promptSpy.mockRestore();
  });

  it('does NOT call onRename when onRename is undefined (no error on double-click)', () => {
    render(<RefImageCard image={mockImage} />);

    const card = screen.getByRole('button', { name: 'test-ref.png. Drag to place on grid.' });

    expect(() => {
      fireEvent.doubleClick(card);
    }).not.toThrow();
  });

  it('passes correct drag data to usePointerDragSource', () => {
    render(<RefImageCard image={mockImage} />);

    expect(usePointerDragSource).toHaveBeenCalledWith({
      dragData: {
        type: 'ref-image',
        itemId: 'ref-42',
        refImageId: 42,
        refImageUrl: 'ref-lib/abc123.webp',
        refImageName: 'test-ref.png',
      },
    });
  });
});
