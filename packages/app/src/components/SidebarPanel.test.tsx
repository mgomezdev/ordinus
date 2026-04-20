import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarPanel } from './SidebarPanel';

describe('SidebarPanel', () => {
  const defaultProps = {
    dimensionsContent: <div data-testid="dimensions-content">Dimensions</div>,
    spacerContent: <div data-testid="spacer-content">Grid Settings</div>,
    onClearCanvas: vi.fn(),
    onReset: vi.fn(),
    isReadOnly: false,
  };

  describe('Nav rendering', () => {
    it('should render GRID SETTINGS heading', () => {
      render(<SidebarPanel {...defaultProps} />);
      expect(screen.getByText('GRID SETTINGS')).toBeInTheDocument();
    });

    it('should render CLEAR CANVAS and RESET action buttons when not read-only', () => {
      render(<SidebarPanel {...defaultProps} />);
      expect(screen.getByText('CLEAR CANVAS')).toBeInTheDocument();
      expect(screen.getByText('RESET')).toBeInTheDocument();
    });

    it('should not render CLEAR CANVAS when isReadOnly is true', () => {
      render(<SidebarPanel {...defaultProps} isReadOnly={true} />);
      expect(screen.queryByText('CLEAR CANVAS')).not.toBeInTheDocument();
      expect(screen.getByText('RESET')).toBeInTheDocument();
    });
  });

  describe('Content rendering', () => {
    it('should show both dimensionsContent and spacerContent simultaneously', () => {
      render(<SidebarPanel {...defaultProps} />);
      expect(screen.getByTestId('dimensions-content')).toBeInTheDocument();
      expect(screen.getByTestId('spacer-content')).toBeInTheDocument();
    });

    it('should show Dimensions group label', () => {
      render(<SidebarPanel {...defaultProps} />);
      const label = document.querySelector('.sidebar-settings-group-label');
      expect(label?.textContent).toBe('Dimensions');
    });
  });

  describe('Action callbacks', () => {
    it('should call onClearCanvas when CLEAR CANVAS is clicked', () => {
      const onClearCanvas = vi.fn();
      render(<SidebarPanel {...defaultProps} onClearCanvas={onClearCanvas} />);
      fireEvent.click(screen.getByText('CLEAR CANVAS'));
      expect(onClearCanvas).toHaveBeenCalledTimes(1);
    });

    it('should call onReset when RESET is clicked', () => {
      const onReset = vi.fn();
      render(<SidebarPanel {...defaultProps} onReset={onReset} />);
      fireEvent.click(screen.getByText('RESET'));
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });
});
