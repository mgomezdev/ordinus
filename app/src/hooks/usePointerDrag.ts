import { useCallback, useRef, useEffect } from 'react';
import type { DragData } from '../types/gridfinity';
import { snapPointerToCell } from '../utils/snap';

const WHOLE_CELL_STEP = 1;

// --- Drag store — encapsulated singleton replacing loose module-level vars ---

export interface SnapPreviewData {
  dragData: DragData;
  col: number;
  row: number;
}

interface ActiveDrag {
  data: DragData;
  ghostElement: HTMLElement | null;
  sourceElement: HTMLElement;
  offsetX: number;
  offsetY: number;
  pointerId: number;
}

interface DropTargetConfig {
  element: HTMLElement;
  gridX: number;
  gridY: number;
  onDrop: (dragData: DragData, x: number, y: number) => void;
  onSnapChange?: (preview: SnapPreviewData | null) => void;
}

const dragStore = {
  activeDrag: null as ActiveDrag | null,
  dropTarget: null as DropTargetConfig | null,

  /** Reset all state — useful for tests */
  reset(): void {
    if (this.activeDrag?.ghostElement) {
      this.activeDrag.ghostElement.remove();
    }
    this.activeDrag = null;
    this.dropTarget = null;
  },
};

const DRAG_THRESHOLD = 5; // pixels — below this, treat as tap

export function getActiveDrag(): ActiveDrag | null {
  return dragStore.activeDrag;
}

export function clearActiveDrag(): void {
  if (dragStore.activeDrag?.ghostElement) {
    dragStore.activeDrag.ghostElement.remove();
  }
  dragStore.activeDrag = null;
}

export function registerDropTarget(config: DropTargetConfig): void {
  dragStore.dropTarget = config;
}

export function unregisterDropTarget(): void {
  dragStore.dropTarget = null;
}

/** Reset entire drag store (for testing) */
export function resetDragStore(): void {
  dragStore.reset();
}

// --- Ghost element ---

function createGhostElement(sourceElement: HTMLElement): HTMLElement {
  const ghost = sourceElement.cloneNode(true) as HTMLElement;
  const rect = sourceElement.getBoundingClientRect();

  ghost.style.position = 'fixed';
  ghost.style.zIndex = '10000';
  ghost.style.pointerEvents = 'none';
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.opacity = '0.7';
  ghost.style.transition = 'none';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.margin = '0';
  ghost.setAttribute('data-drag-ghost', 'true');

  document.body.appendChild(ghost);
  return ghost;
}

// --- Drop detection ---

function attemptDrop(clientX: number, clientY: number, pointerId: number): void {
  const { activeDrag, dropTarget } = dragStore;
  if (!activeDrag || !dropTarget) return;
  // Guard against a stale/foreign drag: activeDrag is a single shared slot,
  // so only the pointer that owns it may complete it.
  if (activeDrag.pointerId !== pointerId) return;

  const rect = dropTarget.element.getBoundingClientRect();

  // Check if drop coordinates fall within the grid container bounds
  if (clientX < rect.left || clientX > rect.right ||
      clientY < rect.top || clientY > rect.bottom) return;

  const step = activeDrag.data.snapStep ?? WHOLE_CELL_STEP;
  const dropX = snapPointerToCell(clientX - rect.left, rect.width / dropTarget.gridX, dropTarget.gridX, step);
  const dropY = snapPointerToCell(clientY - rect.top, rect.height / dropTarget.gridY, dropTarget.gridY, step);

  dropTarget.onDrop(activeDrag.data, dropX, dropY);
}

// --- usePointerDragSource hook ---

interface PointerDragSourceOptions {
  dragData: DragData;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onTap?: (e: PointerEvent) => void;
}

interface PointerDragSourceResult {
  onPointerDown: (e: React.PointerEvent) => void;
}

export function usePointerDragSource(
  options: PointerDragSourceOptions
): PointerDragSourceResult {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const activePointerIdRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activePointerIdRef.current !== null) {
        clearActiveDrag();
        activePointerIdRef.current = null;
      }
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle primary button (left click / single touch)
    if (e.button !== 0) return;

    // Don't interfere with buttons (delete, rotate, etc.)
    if ((e.target as HTMLElement).closest('button')) return;

    // Ignore if already tracking a pointer
    if (activePointerIdRef.current !== null) return;

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const sourceElement = e.currentTarget as HTMLElement;
    let isDragging = false;
    // Set when a second pointer crosses the drag threshold while dragStore's
    // single activeDrag slot is already owned by another pointer/instance —
    // its pointerup must not be treated as a tap or corrupt the other drag.
    let blockedByOtherDrag = false;
    activePointerIdRef.current = e.pointerId;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      // Only track the pointer we started with
      if (moveEvent.pointerId !== activePointerIdRef.current) return;
      if (blockedByOtherDrag) return;

      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!isDragging && distance >= DRAG_THRESHOLD) {
        if (dragStore.activeDrag) {
          // Another pointer already owns the (single) active drag slot.
          blockedByOtherDrag = true;
          return;
        }
        isDragging = true;

        const rect = sourceElement.getBoundingClientRect();
        dragStore.activeDrag = {
          data: optionsRef.current.dragData,
          ghostElement: createGhostElement(sourceElement),
          sourceElement,
          offsetX: startX - rect.left,
          offsetY: startY - rect.top,
          pointerId: moveEvent.pointerId,
        };

        sourceElement.classList.add('pointer-dragging');
        optionsRef.current.onDragStart?.();
      }

      if (isDragging && dragStore.activeDrag?.ghostElement) {
        dragStore.activeDrag.ghostElement.style.left = `${moveEvent.clientX - dragStore.activeDrag.offsetX}px`;
        dragStore.activeDrag.ghostElement.style.top = `${moveEvent.clientY - dragStore.activeDrag.offsetY}px`;
      }

      if (isDragging && dragStore.dropTarget) {
        const { element, gridX: tgX, gridY: tgY, onSnapChange } = dragStore.dropTarget;
        const rect = element.getBoundingClientRect();
        if (
          moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right &&
          moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom
        ) {
          const step = dragStore.activeDrag!.data.snapStep ?? WHOLE_CELL_STEP;
          const col = snapPointerToCell(moveEvent.clientX - rect.left, rect.width / tgX, tgX, step);
          const row = snapPointerToCell(moveEvent.clientY - rect.top, rect.height / tgY, tgY, step);
          onSnapChange?.({ dragData: dragStore.activeDrag!.data, col, row });
        } else {
          onSnapChange?.(null);
        }
      }
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
      sourceElement.classList.remove('pointer-dragging');
      activePointerIdRef.current = null;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== activePointerIdRef.current) return;

      if (blockedByOtherDrag) {
        // This pointer never got to drag or tap — another drag owned the slot.
        cleanup();
        return;
      }

      if (!isDragging) {
        // Below threshold — this was a tap
        cleanup();
        optionsRef.current.onTap?.(upEvent);
      } else {
        // End of drag — attempt drop
        dragStore.dropTarget?.onSnapChange?.(null);
        attemptDrop(upEvent.clientX, upEvent.clientY, upEvent.pointerId);
        clearActiveDrag();
        cleanup();
        optionsRef.current.onDragEnd?.();
      }
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== activePointerIdRef.current) return;
      // Only tear down the shared drag slot if this pointer actually owns
      // it — a blocked second pointer (or one cancelled pre-threshold) must
      // not clear or end a drag that belongs to someone else.
      if (isDragging) {
        dragStore.dropTarget?.onSnapChange?.(null);
        clearActiveDrag();
        optionsRef.current.onDragEnd?.();
      }
      cleanup();
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerCancel);
  }, []);

  return { onPointerDown };
}

// --- usePointerDropTarget hook ---

interface PointerDropTargetOptions {
  gridRef: React.RefObject<HTMLDivElement | null>;
  gridX: number;
  gridY: number;
  onDrop: (dragData: DragData, x: number, y: number) => void;
  onSnapChange?: (preview: SnapPreviewData | null) => void;
}

export function usePointerDropTarget(options: PointerDropTargetOptions): void {
  const { gridRef, gridX, gridY, onDrop, onSnapChange } = options;

  useEffect(() => {
    const el = gridRef.current;
    if (!el || gridX <= 0 || gridY <= 0) return;
    registerDropTarget({ element: el, gridX, gridY, onDrop, onSnapChange });
    return () => unregisterDropTarget();
  }, [gridRef, gridX, gridY, onDrop, onSnapChange]);
}
