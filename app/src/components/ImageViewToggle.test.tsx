import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageViewToggle } from './ImageViewToggle';

describe('ImageViewToggle', () => {
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    mockOnToggle.mockClear();
  });

  it('should render a button', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should display "Top" label when mode is ortho', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveTextContent('Top');
  });

  it('should display "3D" label when mode is perspective', () => {
    render(<ImageViewToggle mode="perspective" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveTextContent('3D');
  });

  it('should have tooltip "Switch to 3D view (V)" when mode is ortho', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Switch to 3D view (V)');
  });

  it('should have tooltip "Switch to top view (V)" when mode is perspective', () => {
    render(<ImageViewToggle mode="perspective" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Switch to top view (V)');
  });

  it('should call onToggle when clicked', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    fireEvent.click(screen.getByRole('button'));
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('should have zoom-control-btn class for consistent styling', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveClass('zoom-control-btn');
  });

  it('should have image-view-toggle-btn class', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveClass('image-view-toggle-btn');
  });

  it('should have active class when mode is perspective', () => {
    render(<ImageViewToggle mode="perspective" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveClass('active');
  });

  it('should NOT have active class when mode is ortho', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).not.toHaveClass('active');
  });

  it('should have appropriate aria-label', () => {
    render(<ImageViewToggle mode="ortho" onToggle={mockOnToggle} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Toggle image view mode');
  });
});
