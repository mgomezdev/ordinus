import { useEffect, useRef, type ReactNode, type RefObject, type MutableRefObject } from 'react';
import type { GridTransform } from '../hooks/useGridTransform';
import { ZoomControls } from './ZoomControls';

interface ZoomOverlayProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToScreen: () => void;
  showResetZoom: boolean;
}

interface GridViewportProps {
  children: ReactNode;
  transform: GridTransform;
  handleWheel: (e: WheelEvent, rect: DOMRect) => void;
  pan: (dx: number, dy: number) => void;
  isSpaceHeldRef: MutableRefObject<boolean>;
  viewportRef?: RefObject<HTMLDivElement | null>;
  handleTouchStart: (e: TouchEvent) => void;
  handleTouchMove: (e: TouchEvent) => void;
  handleTouchEnd: () => void;
  zoomOverlayProps?: ZoomOverlayProps;
  drawing?: boolean;
}

export function GridViewport({
  children,
  transform,
  handleWheel,
  pan,
  isSpaceHeldRef,
  viewportRef: externalRef,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  zoomOverlayProps,
  drawing = false,
}: GridViewportProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = externalRef ?? internalRef;
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const isTransformed = transform.zoom !== 1 || transform.panX !== 0 || transform.panY !== 0;

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      const rect = viewport.getBoundingClientRect();
      handleWheel(e, rect);
    };
    // passive: false is required -- handler calls preventDefault() to capture wheel zoom
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [handleWheel, ref]);

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || isSpaceHeldRef.current) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        viewport.style.cursor = 'grabbing';
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = (e.clientX - panStartRef.current.x) / transform.zoom;
      const dy = (e.clientY - panStartRef.current.y) / transform.zoom;
      pan(dx, dy);
      panStartRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        viewport.style.cursor = isSpaceHeldRef.current ? 'grab' : '';
      }
    };
    viewport.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      viewport.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [pan, transform.zoom, isSpaceHeldRef, ref]);

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    // passive: false required — handlers call preventDefault() to suppress browser scroll/zoom
    const touchStart = (e: TouchEvent) => { if (!drawing || e.touches.length > 1) handleTouchStart(e); };
    const touchMove = (e: TouchEvent) => { if (!drawing || e.touches.length > 1) handleTouchMove(e); };
    viewport.addEventListener('touchstart', touchStart, { passive: false });
    viewport.addEventListener('touchmove', touchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd);
    viewport.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      viewport.removeEventListener('touchstart', touchStart);
      viewport.removeEventListener('touchmove', touchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
      viewport.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, ref, drawing]);

  return (
    <div
      ref={ref}
      className={`preview-viewport${isTransformed ? ' zoomed' : ''}`}
      data-testid="preview-viewport"
    >
      <div
        className={`preview-content${isTransformed ? ' transformed' : ''}`}
        style={isTransformed ? {
          transform: `scale(${transform.zoom}) translate(${transform.panX}px, ${transform.panY}px)`,
          transformOrigin: '0 0',
        } : undefined}
      >
        {children}
      </div>
      {zoomOverlayProps && (
        <div className="floating-zoom-overlay">
          <ZoomControls
            zoom={zoomOverlayProps.zoom}
            onZoomIn={zoomOverlayProps.onZoomIn}
            onZoomOut={zoomOverlayProps.onZoomOut}
            onResetZoom={zoomOverlayProps.onResetZoom}
            onFitToScreen={zoomOverlayProps.onFitToScreen}
            showReset={zoomOverlayProps.showResetZoom}
          />
        </div>
      )}
    </div>
  );
}
