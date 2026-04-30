/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RebindImageDialog } from './RebindImageDialog';
import type { ApiRefImage } from '@gridfinity/shared';
import { useRefImagesQuery } from '../hooks/useRefImages';

vi.mock('../hooks/useRefImages', () => ({
  useRefImagesQuery: vi.fn(),
}));

const mockImage1: ApiRefImage = {
  id: 1,
  ownerId: 1,
  name: 'image-1.png',
  isGlobal: false,
  imageUrl: 'ref-lib/img1.webp',
  fileSize: 1024,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockImage2: ApiRefImage = {
  id: 2,
  ownerId: 1,
  name: 'image-2.png',
  isGlobal: false,
  imageUrl: 'ref-lib/img2.webp',
  fileSize: 2048,
  createdAt: '2024-01-02T00:00:00.000Z',
};

describe('RebindImageDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when isOpen=false', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const { container } = render(
      <RebindImageDialog
        isOpen={false}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when isOpen=true', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Rebind Image' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Select Replacement Image')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as any);

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('Loading images...')).toBeInTheDocument();
  });

  it('shows error state with message', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: 'Network error' },
    } as any);

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    const errorMessage = screen.getByRole('alert');
    expect(errorMessage).toHaveTextContent('Network error');
  });

  it('shows empty state when no images', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText('No images available. Upload images in the Images tab first.')).toBeInTheDocument();
  });

  it('renders image options when images are available', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [mockImage1, mockImage2],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    const img1 = screen.getByRole('img', { name: 'image-1.png' });
    const img2 = screen.getByRole('img', { name: 'image-2.png' });

    expect(img1).toHaveAttribute('src', 'http://localhost:3001/api/v1/images/ref-lib/img1.webp');
    expect(img2).toHaveAttribute('src', 'http://localhost:3001/api/v1/images/ref-lib/img2.webp');
    expect(screen.getByText('image-1.png')).toBeInTheDocument();
    expect(screen.getByText('image-2.png')).toBeInTheDocument();
  });

  it('calls onSelect with correct args and onClose when an image is clicked', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [mockImage1, mockImage2],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={onClose}
        onSelect={onSelect}
      />
    );

    const imageButton = screen.getByRole('img', { name: 'image-1.png' }).closest('button')!;
    fireEvent.click(imageButton);

    expect(onSelect).toHaveBeenCalledWith(1, 'ref-lib/img1.webp', 'image-1.png');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay is clicked', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const onClose = vi.fn();

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={onClose}
        onSelect={vi.fn()}
      />
    );

    const overlay = document.querySelector('.layout-dialog-overlay')!;
    fireEvent.click(overlay);

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Close button is clicked', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const onClose = vi.fn();

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={onClose}
        onSelect={vi.fn()}
      />
    );

    const closeButton = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const onClose = vi.fn();

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={onClose}
        onSelect={vi.fn()}
      />
    );

    const overlay = document.querySelector('.layout-dialog-overlay')!;
    fireEvent.keyDown(overlay, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('does not propagate click from dialog body to overlay', () => {
    vi.mocked(useRefImagesQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    } as any);

    const onClose = vi.fn();

    render(
      <RebindImageDialog
        isOpen={true}
        onClose={onClose}
        onSelect={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);

    expect(onClose).not.toHaveBeenCalled();
  });
});
