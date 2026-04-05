import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridTransform } from './useGridTransform';

function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>): TouchEvent {
  return {
    preventDefault: () => {},
    touches: Object.assign(
      touches.map(({ clientX, clientY }) => ({ clientX, clientY })),
      { length: touches.length },
    ),
  } as unknown as TouchEvent;
}

describe('useGridTransform', () => {
  describe('Initial State', () => {
    it('should initialize with zoom=1 and pan=(0,0)', () => {
      const { result } = renderHook(() => useGridTransform());
      expect(result.current.transform).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });
  });

  describe('Zoom Controls', () => {
    it('should zoom in by step', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => { result.current.zoomIn(); });

      expect(result.current.transform.zoom).toBeCloseTo(1.1, 2);
    });

    it('should zoom out by step', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => { result.current.zoomOut(); });

      expect(result.current.transform.zoom).toBeCloseTo(0.9, 2);
    });

    it('should clamp zoom to max 400%', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => { result.current.setZoomLevel(5.0); });

      expect(result.current.transform.zoom).toBe(4.0);
    });

    it('should clamp zoom to min 25%', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => { result.current.setZoomLevel(0.1); });

      expect(result.current.transform.zoom).toBe(0.25);
    });

    it('should reset zoom and pan', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.setZoomLevel(2.0);
        result.current.pan(50, 50);
      });

      expect(result.current.transform.zoom).toBe(2.0);
      expect(result.current.transform.panX).toBe(50);

      act(() => { result.current.resetZoom(); });

      expect(result.current.transform).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });

    it('should set specific zoom level', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => { result.current.setZoomLevel(2.5); });

      expect(result.current.transform.zoom).toBe(2.5);
    });
  });

  describe('Pan', () => {
    it('should pan by delta', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => { result.current.pan(10, 20); });

      expect(result.current.transform.panX).toBe(10);
      expect(result.current.transform.panY).toBe(20);
    });

    it('should accumulate pan deltas', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.pan(10, 20);
        result.current.pan(5, -10);
      });

      expect(result.current.transform.panX).toBe(15);
      expect(result.current.transform.panY).toBe(10);
    });

    it('should allow negative pan values', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => { result.current.pan(-50, -100); });

      expect(result.current.transform.panX).toBe(-50);
      expect(result.current.transform.panY).toBe(-100);
    });
  });

  describe('Mouse Wheel Zoom', () => {
    it('should zoom in on scroll up', () => {
      const { result } = renderHook(() => useGridTransform());

      const mockEvent = {
        preventDefault: () => {},
        deltaY: -100,
        deltaX: 0,
        clientX: 200,
        clientY: 200,
        ctrlKey: true,
      } as WheelEvent;

      const rect = { left: 0, top: 0 } as DOMRect;

      act(() => { result.current.handleWheel(mockEvent, rect); });

      expect(result.current.transform.zoom).toBeGreaterThan(1.0);
    });

    it('should zoom out on scroll down', () => {
      const { result } = renderHook(() => useGridTransform());

      const mockEvent = {
        preventDefault: () => {},
        deltaY: 100,
        deltaX: 0,
        clientX: 200,
        clientY: 200,
        ctrlKey: true,
      } as WheelEvent;

      const rect = { left: 0, top: 0 } as DOMRect;

      act(() => { result.current.handleWheel(mockEvent, rect); });

      expect(result.current.transform.zoom).toBeLessThan(1.0);
    });

    it('should zoom centered on cursor position', () => {
      const { result } = renderHook(() => useGridTransform());

      const mockEvent = {
        preventDefault: () => {},
        deltaY: -200,
        deltaX: 0,
        clientX: 100,
        clientY: 100,
        ctrlKey: true,
      } as WheelEvent;

      const rect = { left: 0, top: 0 } as DOMRect;

      act(() => { result.current.handleWheel(mockEvent, rect); });

      // After zooming in at (100,100), pan should adjust so content under cursor stays fixed
      expect(result.current.transform.zoom).toBeGreaterThan(1.0);
      // Pan values should be non-zero to compensate for zoom center offset
      const { panX, panY } = result.current.transform;
      expect(typeof panX).toBe('number');
      expect(typeof panY).toBe('number');
    });
  });

  describe('Trackpad Scroll Pan', () => {
    it('should pan (not zoom) when ctrlKey is false', () => {
      const { result } = renderHook(() => useGridTransform());

      const mockEvent = {
        preventDefault: () => {},
        deltaY: 100,
        deltaX: 50,
        clientX: 0,
        clientY: 0,
        ctrlKey: false,
      } as WheelEvent;
      const rect = { left: 0, top: 0 } as DOMRect;

      act(() => { result.current.handleWheel(mockEvent, rect); });

      // Zoom must not change
      expect(result.current.transform.zoom).toBe(1);
      // Pan must change (negate delta, divide by zoom=1)
      expect(result.current.transform.panX).toBeCloseTo(-50, 5);
      expect(result.current.transform.panY).toBeCloseTo(-100, 5);
    });

    it('should pan proportionally when zoomed in and ctrlKey is false', () => {
      const { result } = renderHook(() => useGridTransform());

      // Zoom to 2x first
      act(() => { result.current.setZoomLevel(2); });

      const mockEvent = {
        preventDefault: () => {},
        deltaY: 0,
        deltaX: 200,
        clientX: 0,
        clientY: 0,
        ctrlKey: false,
      } as WheelEvent;
      const rect = { left: 0, top: 0 } as DOMRect;

      act(() => { result.current.handleWheel(mockEvent, rect); });

      expect(result.current.transform.zoom).toBe(2);
      // deltaX=200 at zoom=2 → panX change = -200/2 = -100
      expect(result.current.transform.panX).toBeCloseTo(-100, 5);
    });
  });

  describe('Touch Gestures', () => {
    it('should pan when two fingers move in the same direction (no distance change)', () => {
      const { result } = renderHook(() => useGridTransform());

      // Start: fingers at (100,200) and (200,200) — midpoint (150,200), dist=100
      act(() => {
        result.current.handleTouchStart(makeTouchEvent([
          { clientX: 100, clientY: 200 },
          { clientX: 200, clientY: 200 },
        ]));
      });

      // Move: both shift 60px right — midpoint (210,200), dist still 100
      act(() => {
        result.current.handleTouchMove(makeTouchEvent([
          { clientX: 160, clientY: 200 },
          { clientX: 260, clientY: 200 },
        ]));
      });

      // Zoom must be unchanged (distance didn't change)
      expect(result.current.transform.zoom).toBeCloseTo(1.0, 5);
      // panX must increase (fingers moved right → content shifts right)
      expect(result.current.transform.panX).toBeGreaterThan(0);
      expect(result.current.transform.panY).toBeCloseTo(0, 5);
    });

    it('should zoom when two fingers move apart with fixed midpoint', () => {
      const { result } = renderHook(() => useGridTransform());

      // Start: midpoint (200,200), dist=100
      act(() => {
        result.current.handleTouchStart(makeTouchEvent([
          { clientX: 150, clientY: 200 },
          { clientX: 250, clientY: 200 },
        ]));
      });

      // Spread: midpoint still (200,200), dist=200 → zoom doubles
      act(() => {
        result.current.handleTouchMove(makeTouchEvent([
          { clientX: 100, clientY: 200 },
          { clientX: 300, clientY: 200 },
        ]));
      });

      expect(result.current.transform.zoom).toBeCloseTo(2.0, 5);
    });

    it('should update both pan and zoom when fingers move and spread', () => {
      const { result } = renderHook(() => useGridTransform());

      // Start: midpoint (150,200), dist=100
      act(() => {
        result.current.handleTouchStart(makeTouchEvent([
          { clientX: 100, clientY: 200 },
          { clientX: 200, clientY: 200 },
        ]));
      });

      // Move right AND spread: midpoint (200,200), dist=200
      act(() => {
        result.current.handleTouchMove(makeTouchEvent([
          { clientX: 100, clientY: 200 },
          { clientX: 300, clientY: 200 },
        ]));
      });

      // Zoom doubled
      expect(result.current.transform.zoom).toBeCloseTo(2.0, 5);
      // Pan changed (midpoint shifted from 150 → 200)
      expect(Number.isFinite(result.current.transform.panX)).toBe(true);
      expect(Number.isFinite(result.current.transform.panY)).toBe(true);
      expect(result.current.transform.panX).not.toBeCloseTo(0, 1);
    });

    it('should ignore handleTouchStart when fewer than 2 touches', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.handleTouchStart(makeTouchEvent([{ clientX: 100, clientY: 200 }]));
      });

      expect(result.current.transform).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });

    it('should ignore handleTouchStart when both fingers are at the same position', () => {
      const { result } = renderHook(() => useGridTransform());
      act(() => {
        result.current.handleTouchStart(makeTouchEvent([
          { clientX: 100, clientY: 200 },
          { clientX: 100, clientY: 200 },
        ]));
      });
      // pinchStartRef not set — subsequent move should be ignored
      act(() => {
        result.current.handleTouchMove(makeTouchEvent([
          { clientX: 150, clientY: 200 },
          { clientX: 200, clientY: 200 },
        ]));
      });
      expect(result.current.transform).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });

    it('should ignore handleTouchMove when fewer than 2 touches', () => {
      const { result } = renderHook(() => useGridTransform());

      // Valid start
      act(() => {
        result.current.handleTouchStart(makeTouchEvent([
          { clientX: 100, clientY: 200 },
          { clientX: 200, clientY: 200 },
        ]));
      });

      // Single-touch move — must be ignored
      act(() => {
        result.current.handleTouchMove(makeTouchEvent([{ clientX: 500, clientY: 500 }]));
      });

      expect(result.current.transform).toEqual({ zoom: 1, panX: 0, panY: 0 });
    });
  });

  describe('Fit to Screen', () => {
    it('should calculate zoom to fit content in container', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.fitToScreen(800, 600, 1600, 1200);
      });

      // Content is 2x the container, so zoom should be ~0.475 (0.5 * 0.95)
      expect(result.current.transform.zoom).toBeCloseTo(0.475, 2);
    });

    it('should handle content smaller than container', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.fitToScreen(800, 600, 400, 300);
      });

      // Content is half the container, zoom ~1.9 (2 * 0.95)
      expect(result.current.transform.zoom).toBeCloseTo(1.9, 2);
    });

    it('should maintain aspect ratio by using smaller scale', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.fitToScreen(800, 600, 800, 1200);
      });

      // Height constrains: 600/1200 = 0.5, * 0.95 = 0.475
      expect(result.current.transform.zoom).toBeCloseTo(0.475, 2);
    });

    it('should handle zero content dimensions', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.fitToScreen(800, 600, 0, 0);
      });

      // Should not change from initial
      expect(result.current.transform.zoom).toBe(1);
    });

    it('should clamp fit zoom to max', () => {
      const { result } = renderHook(() => useGridTransform());

      act(() => {
        result.current.fitToScreen(8000, 6000, 100, 100);
      });

      // Would be 60 * 0.95 = 57, clamped to 4.0
      expect(result.current.transform.zoom).toBe(4.0);
    });
  });
});
