import { useState, useCallback, useRef } from 'react';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, WHEEL_ZOOM_FACTOR } from '../utils/constants';

export interface GridTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export function useGridTransform() {
  const [transform, setTransform] = useState<GridTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  });

  const transformRef = useRef(transform);

  const updateTransform = useCallback((next: GridTransform) => {
    transformRef.current = next;
    setTransform(next);
  }, []);

  const clampZoom = (zoom: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

  const zoomIn = useCallback(() => {
    const t = transformRef.current;
    updateTransform({ ...t, zoom: clampZoom(t.zoom + ZOOM_STEP) });
  }, [updateTransform]);

  const zoomOut = useCallback(() => {
    const t = transformRef.current;
    updateTransform({ ...t, zoom: clampZoom(t.zoom - ZOOM_STEP) });
  }, [updateTransform]);

  const resetZoom = useCallback(() => {
    updateTransform({ zoom: 1, panX: 0, panY: 0 });
  }, [updateTransform]);

  const fitToScreen = useCallback((containerWidth: number, containerHeight: number, contentWidth: number, contentHeight: number) => {
    if (contentWidth <= 0 || contentHeight <= 0) return;
    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;
    const zoom = clampZoom(Math.min(scaleX, scaleY) * 0.95);
    const panX = (containerWidth - contentWidth * zoom) / (2 * zoom);
    const panY = (containerHeight - contentHeight * zoom) / (2 * zoom);
    updateTransform({ zoom, panX, panY });
  }, [updateTransform]);

  const handleWheel = useCallback((e: WheelEvent, containerRect: DOMRect) => {
    e.preventDefault();
    const t = transformRef.current;

    if (!e.ctrlKey) {
      // Trackpad 2-finger scroll → pan (no zoom change)
      updateTransform({
        ...t,
        panX: t.panX - e.deltaX / t.zoom,
        panY: t.panY - e.deltaY / t.zoom,
      });
      return;
    }

    // Pinch-to-zoom (ctrlKey = true on trackpad pinch, or Ctrl+scroll with mouse wheel)
    const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
    const newZoom = clampZoom(t.zoom * (1 + delta));
    if (newZoom === t.zoom) return;

    // Zoom centered on cursor position
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    const contentX = mouseX / t.zoom - t.panX;
    const contentY = mouseY / t.zoom - t.panY;
    const newPanX = mouseX / newZoom - contentX;
    const newPanY = mouseY / newZoom - contentY;

    updateTransform({ zoom: newZoom, panX: newPanX, panY: newPanY });
  }, [updateTransform]);

  const setZoomLevel = useCallback((zoom: number) => {
    const t = transformRef.current;
    updateTransform({ ...t, zoom: clampZoom(zoom) });
  }, [updateTransform]);

  const pan = useCallback((dx: number, dy: number) => {
    const t = transformRef.current;
    updateTransform({ ...t, panX: t.panX + dx, panY: t.panY + dy });
  }, [updateTransform]);

  return {
    transform,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToScreen,
    handleWheel,
    setZoomLevel,
    pan,
  };
}
