import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZoomControls } from './ZoomControls';

describe('ZoomControls', () => {
  const defaultProps = {
    zoom: 1,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    onFitToScreen: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render zoom controls', () => {
      render(<ZoomControls {...defaultProps} />);
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('should display current zoom level as percentage', () => {
      render(<ZoomControls {...defaultProps} zoom={1.5} />);
      expect(screen.getByText('150%')).toBeInTheDocument();
    });

    it('should round zoom percentage to whole number', () => {
      render(<ZoomControls {...defaultProps} zoom={0.333} />);
      expect(screen.getByText('33%')).toBeInTheDocument();
    });

    it('should render zoom in button', () => {
      render(<ZoomControls {...defaultProps} />);
      expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
    });

    it('should render zoom out button', () => {
      render(<ZoomControls {...defaultProps} />);
      expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
    });

    it('should render reset zoom button', () => {
      render(<ZoomControls {...defaultProps} />);
      expect(screen.getByLabelText('Reset zoom')).toBeInTheDocument();
    });

    it('should render fit to screen button', () => {
      render(<ZoomControls {...defaultProps} />);
      expect(screen.getByLabelText('Fit to screen')).toBeInTheDocument();
    });
  });

  describe('Button Actions', () => {
    it('should call onZoomIn when zoom in clicked', () => {
      render(<ZoomControls {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Zoom in'));
      expect(defaultProps.onZoomIn).toHaveBeenCalledTimes(1);
    });

    it('should call onZoomOut when zoom out clicked', () => {
      render(<ZoomControls {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Zoom out'));
      expect(defaultProps.onZoomOut).toHaveBeenCalledTimes(1);
    });

    it('should call onResetZoom when reset clicked', () => {
      render(<ZoomControls {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Reset zoom'));
      expect(defaultProps.onResetZoom).toHaveBeenCalledTimes(1);
    });

    it('should call onFitToScreen when fit clicked', () => {
      render(<ZoomControls {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Fit to screen'));
      expect(defaultProps.onFitToScreen).toHaveBeenCalledTimes(1);
    });
  });

  describe('Disabled States', () => {
    it('should disable zoom in at max zoom (400%)', () => {
      render(<ZoomControls {...defaultProps} zoom={4.0} />);
      expect(screen.getByLabelText('Zoom in')).toBeDisabled();
    });

    it('should disable zoom out at min zoom (25%)', () => {
      render(<ZoomControls {...defaultProps} zoom={0.25} />);
      expect(screen.getByLabelText('Zoom out')).toBeDisabled();
    });

    it('should not disable zoom in at less than max', () => {
      render(<ZoomControls {...defaultProps} zoom={3.9} />);
      expect(screen.getByLabelText('Zoom in')).not.toBeDisabled();
    });

    it('should not disable zoom out at more than min', () => {
      render(<ZoomControls {...defaultProps} zoom={0.3} />);
      expect(screen.getByLabelText('Zoom out')).not.toBeDisabled();
    });
  });

  describe('Zoom Level Display', () => {
    it('should show 100% at default zoom', () => {
      render(<ZoomControls {...defaultProps} zoom={1} />);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('should show 25% at min zoom', () => {
      render(<ZoomControls {...defaultProps} zoom={0.25} />);
      expect(screen.getByText('25%')).toBeInTheDocument();
    });

    it('should show 400% at max zoom', () => {
      render(<ZoomControls {...defaultProps} zoom={4.0} />);
      expect(screen.getByText('400%')).toBeInTheDocument();
    });

    it('should show 200% at 2x zoom', () => {
      render(<ZoomControls {...defaultProps} zoom={2} />);
      expect(screen.getByText('200%')).toBeInTheDocument();
    });
  });
});
