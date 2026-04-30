import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BinContextMenu } from './BinContextMenu';

describe('BinContextMenu', () => {
  const defaultProps = {
    x: 100,
    y: 200,
    onRotateCw: vi.fn(),
    onRotateCcw: vi.fn(),
    onDuplicate: vi.fn(),
    onCustomize: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all menu items', () => {
    render(<BinContextMenu {...defaultProps} />);
    expect(screen.getByRole('menuitem', { name: /rotate counter-clockwise/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /rotate clockwise/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /duplicate/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /customize/i })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeDefined();
  });

  it('calls onRotateCw and onClose when Rotate CW is clicked', () => {
    render(<BinContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /rotate clockwise/i }));
    expect(defaultProps.onRotateCw).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onRotateCcw and onClose when Rotate CCW is clicked', () => {
    render(<BinContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /rotate counter-clockwise/i }));
    expect(defaultProps.onRotateCcw).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDuplicate and onClose when Duplicate is clicked', () => {
    render(<BinContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /duplicate/i }));
    expect(defaultProps.onDuplicate).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onCustomize and onClose when Customize is clicked', () => {
    render(<BinContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /customize/i }));
    expect(defaultProps.onCustomize).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete and onClose when Delete is clicked', () => {
    render(<BinContextMenu {...defaultProps} />);
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(defaultProps.onDelete).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<BinContextMenu {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when mousedown outside the menu', () => {
    render(<BinContextMenu {...defaultProps} />);
    fireEvent.mouseDown(document.body);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when mousedown inside the menu', () => {
    render(<BinContextMenu {...defaultProps} />);
    const menu = screen.getByRole('menu');
    fireEvent.mouseDown(menu);
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });
});
