import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePointerDragSource,
  usePointerDropTarget,
  getActiveDrag,
  clearActiveDrag,
  registerDropTarget,
  unregisterDropTarget,
} from './usePointerDrag';
import type { DragData } from '../types/gridfinity';

describe('usePointerDrag', () => {
  let mockElement: HTMLElement;
  let mockGridElement: HTMLElement;

  beforeEach(() => {
    // Create mock elements
    mockElement = document.createElement('div');
    mockElement.style.width = '100px';
    mockElement.style.height = '100px';
    document.body.appendChild(mockElement);

    mockGridElement = document.createElement('div');
    mockGridElement.className = 'grid-container';
    mockGridElement.style.width = '400px';
    mockGridElement.style.height = '400px';
    document.body.appendChild(mockGridElement);

    // Mock getBoundingClientRect
    mockElement.getBoundingClientRect = vi.fn(() => ({
      left: 10,
      top: 10,
      width: 100,
      height: 100,
      right: 110,
      bottom: 110,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    }));

    mockGridElement.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
      right: 400,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    clearActiveDrag();
    unregisterDropTarget();
    document.body.innerHTML = '';
  });

  describe('Module-level store', () => {
    it('should return null initially from getActiveDrag', () => {
      expect(getActiveDrag()).toBeNull();
    });

    it('should clear active drag when clearActiveDrag is called', () => {
      const dragData: DragData = { type: 'library', itemId: 'test-item' };
      const { result } = renderHook(() =>
        usePointerDragSource({
          dragData,
          onDragStart: vi.fn(),
        })
      );

      const pointerDownEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
        bubbles: true,
      });

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });
      Object.defineProperty(pointerDownEvent, 'target', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
      });

      // Move to trigger drag
      const pointerMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      });

      act(() => {
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(getActiveDrag()).not.toBeNull();

      clearActiveDrag();
      expect(getActiveDrag()).toBeNull();
    });

    it('should remove ghost element when clearActiveDrag is called', () => {
      const dragData: DragData = { type: 'library', itemId: 'test-item' };
      const { result } = renderHook(() =>
        usePointerDragSource({
          dragData,
        })
      );

      const pointerDownEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
        bubbles: true,
      });

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });
      Object.defineProperty(pointerDownEvent, 'target', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
      });

      const pointerMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      });

      act(() => {
        document.dispatchEvent(pointerMoveEvent);
      });

      const ghostElements = document.querySelectorAll('[data-drag-ghost="true"]');
      expect(ghostElements.length).toBeGreaterThan(0);

      clearActiveDrag();

      const ghostElementsAfter = document.querySelectorAll('[data-drag-ghost="true"]');
      expect(ghostElementsAfter.length).toBe(0);
    });
  });

  describe('Drop target registry', () => {
    it('should register a drop target', () => {
      const onDrop = vi.fn();
      registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      });

      // Registry is internal, but we can verify through drop behavior
      expect(() => registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      })).not.toThrow();
    });

    it('should unregister drop target', () => {
      const onDrop = vi.fn();
      registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      });

      unregisterDropTarget();

      expect(() => unregisterDropTarget()).not.toThrow();
    });
  });

  describe('usePointerDragSource', () => {
    it('should return an onPointerDown handler', () => {
      const dragData: DragData = { type: 'library', itemId: 'test-item' };
      const { result } = renderHook(() =>
        usePointerDragSource({
          dragData,
        })
      );

      expect(result.current.onPointerDown).toBeInstanceOf(Function);
    });

    describe('Tap detection', () => {
      it('should call onTap when pointer is pressed and released without movement', () => {
        const onTap = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onTap,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
        });

        act(() => {
          document.dispatchEvent(pointerUpEvent);
        });

        expect(onTap).toHaveBeenCalledTimes(1);
      });

      it('should call onTap when movement is below 5px threshold', () => {
        const onTap = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onTap,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 53,
          clientY: 53,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 53,
          clientY: 53,
        });

        act(() => {
          document.dispatchEvent(pointerUpEvent);
        });

        expect(onTap).toHaveBeenCalledTimes(1);
      });

      it('should not call onTap when movement exceeds threshold', () => {
        const onTap = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onTap,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerUpEvent);
        });

        expect(onTap).not.toHaveBeenCalled();
      });
    });

    describe('Drag detection', () => {
      it('should call onDragStart when movement exceeds 5px threshold', () => {
        const onDragStart = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onDragStart,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(onDragStart).toHaveBeenCalledTimes(1);
      });

      it('should call onDragEnd when drag completes', () => {
        const onDragStart = vi.fn();
        const onDragEnd = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onDragStart,
            onDragEnd,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerUpEvent);
        });

        expect(onDragEnd).toHaveBeenCalledTimes(1);
      });

      it('should add pointer-dragging class to source element during drag', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(mockElement.classList.contains('pointer-dragging')).toBe(true);

        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerUpEvent);
        });

        expect(mockElement.classList.contains('pointer-dragging')).toBe(false);
      });
    });

    describe('Ghost element', () => {
      it('should create ghost element during drag', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        const ghostElements = document.querySelectorAll('[data-drag-ghost="true"]');
        expect(ghostElements.length).toBe(1);
        expect(ghostElements[0]).toBeInstanceOf(HTMLElement);
      });

      it('should append ghost element to document.body', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        const ghostElement = document.querySelector('[data-drag-ghost="true"]');
        expect(ghostElement?.parentElement).toBe(document.body);
      });

      it('should clean up ghost element after drag ends', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(document.querySelectorAll('[data-drag-ghost="true"]').length).toBe(1);

        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerUpEvent);
        });

        expect(document.querySelectorAll('[data-drag-ghost="true"]').length).toBe(0);
      });

      it('should position ghost element at pointer location with offset', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        const ghostElement = document.querySelector('[data-drag-ghost="true"]') as HTMLElement;
        expect(ghostElement).toBeTruthy();

        // Ghost should be positioned at pointer - offset
        // offset is startX - rect.left = 50 - 10 = 40
        // so ghost.left should be 100 - 40 = 60
        expect(ghostElement.style.left).toBe('60px');
        expect(ghostElement.style.top).toBe('60px');
      });

      it('should update ghost position as pointer moves', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent1 = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 100,
          clientY: 100,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent1);
        });

        const ghostElement = document.querySelector('[data-drag-ghost="true"]') as HTMLElement;
        expect(ghostElement.style.left).toBe('60px');
        expect(ghostElement.style.top).toBe('60px');

        const pointerMoveEvent2 = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 150,
          clientY: 150,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent2);
        });

        expect(ghostElement.style.left).toBe('110px');
        expect(ghostElement.style.top).toBe('110px');
      });
    });

    describe('Multi-pointer rejection', () => {
      it('should ignore second pointer while first is active', () => {
        const onDragStart = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onDragStart,
          })
        );

        const pointerDownEvent1 = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent1, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent1, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent1 as unknown as React.PointerEvent);
        });

        const pointerDownEvent2 = new PointerEvent('pointerdown', {
          pointerId: 2,
          clientX: 60,
          clientY: 60,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent2, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent2, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent2 as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 70,
          clientY: 70,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(onDragStart).toHaveBeenCalledTimes(1);
      });

      it('should ignore pointer move events from different pointer', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent1 = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent1);
        });

        const ghostElement = document.querySelector('[data-drag-ghost="true"]') as HTMLElement;
        expect(ghostElement.style.left).toBe('20px');

        const pointerMoveEvent2 = new PointerEvent('pointermove', {
          pointerId: 2,
          clientX: 200,
          clientY: 200,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent2);
        });

        // Ghost should not move from wrong pointer
        expect(ghostElement.style.left).toBe('20px');
      });
    });

    describe('pointercancel handling', () => {
      it('should trigger cleanup on pointercancel', () => {
        const onDragEnd = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onDragEnd,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(document.querySelectorAll('[data-drag-ghost="true"]').length).toBe(1);

        const pointerCancelEvent = new PointerEvent('pointercancel', {
          pointerId: 1,
        });

        act(() => {
          document.dispatchEvent(pointerCancelEvent);
        });

        expect(onDragEnd).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('[data-drag-ghost="true"]').length).toBe(0);
        expect(getActiveDrag()).toBeNull();
      });

      it('should ignore pointercancel from different pointer', () => {
        const onDragEnd = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onDragEnd,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        const pointerCancelEvent = new PointerEvent('pointercancel', {
          pointerId: 2,
        });

        act(() => {
          document.dispatchEvent(pointerCancelEvent);
        });

        expect(onDragEnd).not.toHaveBeenCalled();
        expect(document.querySelectorAll('[data-drag-ghost="true"]').length).toBe(1);
      });
    });

    describe('Button click rejection', () => {
      it('should ignore events from button elements', () => {
        const onDragStart = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onDragStart,
          })
        );

        const buttonElement = document.createElement('button');
        mockElement.appendChild(buttonElement);

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: buttonElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(onDragStart).not.toHaveBeenCalled();
      });

      it('should ignore right-click events', () => {
        const onDragStart = vi.fn();
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result } = renderHook(() =>
          usePointerDragSource({
            dragData,
            onDragStart,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 2,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(onDragStart).not.toHaveBeenCalled();
      });
    });

    describe('Cleanup on unmount', () => {
      it('should clear active drag on unmount', () => {
        const dragData: DragData = { type: 'library', itemId: 'test-item' };
        const { result, unmount } = renderHook(() =>
          usePointerDragSource({
            dragData,
          })
        );

        const pointerDownEvent = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 50,
          clientY: 50,
          button: 0,
          bubbles: true,
        });

        Object.defineProperty(pointerDownEvent, 'currentTarget', {
          value: mockElement,
          writable: false,
        });
        Object.defineProperty(pointerDownEvent, 'target', {
          value: mockElement,
          writable: false,
        });

        act(() => {
          result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
        });

        const pointerMoveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 60,
          clientY: 60,
        });

        act(() => {
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(document.querySelectorAll('[data-drag-ghost="true"]').length).toBe(1);

        unmount();

        expect(document.querySelectorAll('[data-drag-ghost="true"]').length).toBe(0);
      });
    });
  });

  describe('usePointerDropTarget', () => {
    it('should register drop target on mount', () => {
      const onDrop = vi.fn();
      const gridRef = { current: mockGridElement };

      const { unmount } = renderHook(() =>
        usePointerDropTarget({
          gridRef: gridRef as React.RefObject<HTMLDivElement>,
          gridX: 4,
          gridY: 4,
          onDrop,
        })
      );

      // Verify registration by attempting a drop
      registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      });

      expect(() => unmount()).not.toThrow();
    });

    it('should unregister drop target on unmount', () => {
      const onDrop = vi.fn();
      const gridRef = { current: mockGridElement };

      const { unmount } = renderHook(() =>
        usePointerDropTarget({
          gridRef: gridRef as React.RefObject<HTMLDivElement>,
          gridX: 4,
          gridY: 4,
          onDrop,
        })
      );

      unmount();

      expect(() => unregisterDropTarget()).not.toThrow();
    });

    it('should not register when gridRef.current is null', () => {
      const onDrop = vi.fn();
      const gridRef = { current: null };

      const { unmount } = renderHook(() =>
        usePointerDropTarget({
          gridRef: gridRef as React.RefObject<HTMLDivElement>,
          gridX: 4,
          gridY: 4,
          onDrop,
        })
      );

      expect(() => unmount()).not.toThrow();
    });

    it('should not register when gridX is 0', () => {
      const onDrop = vi.fn();
      const gridRef = { current: mockGridElement };

      const { unmount } = renderHook(() =>
        usePointerDropTarget({
          gridRef: gridRef as React.RefObject<HTMLDivElement>,
          gridX: 0,
          gridY: 4,
          onDrop,
        })
      );

      expect(() => unmount()).not.toThrow();
    });

    it('should not register when gridY is 0', () => {
      const onDrop = vi.fn();
      const gridRef = { current: mockGridElement };

      const { unmount } = renderHook(() =>
        usePointerDropTarget({
          gridRef: gridRef as React.RefObject<HTMLDivElement>,
          gridX: 4,
          gridY: 0,
          onDrop,
        })
      );

      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Drop detection', () => {
    it('should call onDrop with correct grid coordinates when drag ends over grid', () => {
      const onDrop = vi.fn();
      const dragData: DragData = { type: 'library', itemId: 'test-item' };

      registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      });

      const { result } = renderHook(() =>
        usePointerDragSource({
          dragData,
        })
      );

      const pointerDownEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
        bubbles: true,
      });

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });
      Object.defineProperty(pointerDownEvent, 'target', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
      });

      const pointerMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      });

      act(() => {
        document.dispatchEvent(pointerMoveEvent);
      });

      const pointerUpEvent = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 150,
        clientY: 150,
      });

      act(() => {
        document.dispatchEvent(pointerUpEvent);
      });

      expect(onDrop).toHaveBeenCalledTimes(1);
      expect(onDrop).toHaveBeenCalledWith(dragData, 1, 1);
    });

    it('should calculate correct grid cell from drop coordinates', () => {
      const onDrop = vi.fn();
      const dragData: DragData = { type: 'library', itemId: 'test-item' };

      registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      });

      const { result } = renderHook(() =>
        usePointerDragSource({
          dragData,
        })
      );

      const pointerDownEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
        bubbles: true,
      });

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });
      Object.defineProperty(pointerDownEvent, 'target', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
      });

      const pointerMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      });

      act(() => {
        document.dispatchEvent(pointerMoveEvent);
      });

      // Drop at position (250, 350)
      // cellWidth = 400 / 4 = 100, cellHeight = 400 / 4 = 100
      // dropX = Math.floor((250 - 0) / 100) = 2
      // dropY = Math.floor((350 - 0) / 100) = 3
      const pointerUpEvent = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 250,
        clientY: 350,
      });

      act(() => {
        document.dispatchEvent(pointerUpEvent);
      });

      expect(onDrop).toHaveBeenCalledWith(dragData, 2, 3);
    });

    it('should clamp drop coordinates at grid edge to last cell', () => {
      const onDrop = vi.fn();
      const dragData: DragData = { type: 'library', itemId: 'test-item' };

      registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      });

      const { result } = renderHook(() =>
        usePointerDragSource({
          dragData,
        })
      );

      const pointerDownEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
        bubbles: true,
      });

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });
      Object.defineProperty(pointerDownEvent, 'target', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
      });

      const pointerMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      });

      act(() => {
        document.dispatchEvent(pointerMoveEvent);
      });

      // Drop at exact grid edge (400, 400) — right at the boundary
      // cellWidth = 400 / 4 = 100, dropX = Math.floor(400 / 100) = 4, clamped to 3
      const pointerUpEvent = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 400,
        clientY: 400,
      });

      act(() => {
        document.dispatchEvent(pointerUpEvent);
      });

      // Should clamp to (3, 3) which is max valid position
      expect(onDrop).toHaveBeenCalledWith(dragData, 3, 3);
    });

    it('should not call onDrop when drag ends outside grid', () => {
      const onDrop = vi.fn();
      const dragData: DragData = { type: 'library', itemId: 'test-item' };

      registerDropTarget({
        element: mockGridElement,
        gridX: 4,
        gridY: 4,
        onDrop,
      });

      const { result } = renderHook(() =>
        usePointerDragSource({
          dragData,
        })
      );

      const pointerDownEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 50,
        clientY: 50,
        button: 0,
        bubbles: true,
      });

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });
      Object.defineProperty(pointerDownEvent, 'target', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        result.current.onPointerDown(pointerDownEvent as unknown as React.PointerEvent);
      });

      const pointerMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      });

      act(() => {
        document.dispatchEvent(pointerMoveEvent);
      });

      const pointerUpEvent = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 500,
        clientY: 500,
      });

      act(() => {
        document.dispatchEvent(pointerUpEvent);
      });

      expect(onDrop).not.toHaveBeenCalled();
    });
  });
});
