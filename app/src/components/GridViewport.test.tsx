import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GridViewport } from './GridViewport';
import type { GridTransform } from '../hooks/useGridTransform';

vi.mock('./ZoomControls', () => ({
  ZoomControls: (props: Record<string, unknown>) => (
    <div data-testid="floating-zoom" data-show-reset={String(props.showReset)} />
  ),
}));

describe('GridViewport', () => {
  const defaultTransform: GridTransform = { zoom: 1, panX: 0, panY: 0 };
  const defaultProps = {
    transform: defaultTransform,
    handleWheel: vi.fn(),
    pan: vi.fn(),
    isSpaceHeldRef: { current: false },
    handleTouchStart: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchEnd: vi.fn(),
  };

  describe('Rendering', () => {
    it('should render children inside the viewport', () => {
      render(
        <GridViewport {...defaultProps}>
          <div data-testid="child-content">Hello</div>
        </GridViewport>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });

    it('should render viewport with data-testid', () => {
      render(
        <GridViewport {...defaultProps}>
          <div>content</div>
        </GridViewport>
      );

      expect(screen.getByTestId('preview-viewport')).toBeInTheDocument();
    });

    it('should not have zoomed class when transform is default', () => {
      render(
        <GridViewport {...defaultProps}>
          <div>content</div>
        </GridViewport>
      );

      const viewport = screen.getByTestId('preview-viewport');
      expect(viewport.className).not.toContain('zoomed');
    });

    it('should have zoomed class when zoom is not 1', () => {
      render(
        <GridViewport {...defaultProps} transform={{ zoom: 2, panX: 0, panY: 0 }}>
          <div>content</div>
        </GridViewport>
      );

      const viewport = screen.getByTestId('preview-viewport');
      expect(viewport.className).toContain('zoomed');
    });

    it('should have zoomed class when panX is not 0', () => {
      render(
        <GridViewport {...defaultProps} transform={{ zoom: 1, panX: 10, panY: 0 }}>
          <div>content</div>
        </GridViewport>
      );

      const viewport = screen.getByTestId('preview-viewport');
      expect(viewport.className).toContain('zoomed');
    });

    it('should have zoomed class when panY is not 0', () => {
      render(
        <GridViewport {...defaultProps} transform={{ zoom: 1, panX: 0, panY: 5 }}>
          <div>content</div>
        </GridViewport>
      );

      const viewport = screen.getByTestId('preview-viewport');
      expect(viewport.className).toContain('zoomed');
    });
  });

  describe('Transform styles', () => {
    it('should not apply transform styles when zoom=1 and pan=(0,0)', () => {
      render(
        <GridViewport {...defaultProps}>
          <div>content</div>
        </GridViewport>
      );

      const content = screen.getByTestId('preview-viewport').querySelector('.preview-content');
      expect(content).toBeInTheDocument();
      expect(content!.getAttribute('style')).toBeNull();
    });

    it('should apply transform styles when zoomed', () => {
      const zoomed: GridTransform = { zoom: 2, panX: 10, panY: 20 };
      render(
        <GridViewport {...defaultProps} transform={zoomed}>
          <div>content</div>
        </GridViewport>
      );

      const content = screen.getByTestId('preview-viewport').querySelector('.preview-content');
      expect(content).toBeInTheDocument();
      expect(content!.style.transform).toContain('scale(2)');
      expect(content!.style.transform).toContain('translate(10px, 20px)');
    });

    it('should add transformed class when transform is non-default', () => {
      const zoomed: GridTransform = { zoom: 1.5, panX: 0, panY: 0 };
      render(
        <GridViewport {...defaultProps} transform={zoomed}>
          <div>content</div>
        </GridViewport>
      );

      const content = screen.getByTestId('preview-viewport').querySelector('.preview-content');
      expect(content!.className).toContain('transformed');
    });
  });

  describe('Ref forwarding', () => {
    it('should forward ref to the viewport div', () => {
      const ref = { current: null as HTMLDivElement | null };
      render(
        <GridViewport {...defaultProps} viewportRef={ref}>
          <div>content</div>
        </GridViewport>
      );

      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current!.getAttribute('data-testid')).toBe('preview-viewport');
    });
  });
});

describe('Floating zoom overlay', () => {
  const defaultProps = {
    transform: { zoom: 1, panX: 0, panY: 0 },
    handleWheel: vi.fn(),
    pan: vi.fn(),
    isSpaceHeldRef: { current: false },
    handleTouchStart: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchEnd: vi.fn(),
  };

  const zoomProps = {
    zoom: 1,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    onFitToScreen: vi.fn(),
    showResetZoom: true,
  };

  it('does not render zoom overlay when zoom props are not provided', () => {
    render(<GridViewport {...defaultProps}><div>content</div></GridViewport>);
    expect(screen.queryByTestId('floating-zoom')).not.toBeInTheDocument();
  });

  it('renders zoom overlay when zoom props are provided', () => {
    render(
      <GridViewport {...defaultProps} zoomOverlayProps={zoomProps}>
        <div>content</div>
      </GridViewport>
    );
    expect(screen.getByTestId('floating-zoom')).toBeInTheDocument();
  });

  it('passes showReset false to ZoomControls when showResetZoom is false', () => {
    render(
      <GridViewport {...defaultProps} zoomOverlayProps={{ ...zoomProps, showResetZoom: false }}>
        <div>content</div>
      </GridViewport>
    );
    expect(screen.getByTestId('floating-zoom')).toHaveAttribute('data-show-reset', 'false');
  });
});
