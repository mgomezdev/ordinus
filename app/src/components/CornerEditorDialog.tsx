import { useMemo, useRef, useState } from 'react';
import {
  CORNER_LABELS,
  MAX_CORNER_ANGLE_DEG,
  MIN_CORNER_ANGLE_DEG,
  defaultQuad,
  validateQuad,
} from '@gridfinity/shared';
import type { Point, Quad } from '@gridfinity/shared';

const DEFAULT_INSET = 0.1;
const NUDGE_STEP = 0.002;
const NUDGE_STEP_LARGE = 0.02;
const LOUPE_ZOOM = 3;
const LOUPE_RADIUS_PX = 60;
const CORNER_SHORT_LABELS = ['TL', 'TR', 'BR', 'BL'] as const;

const ARROW_DELTAS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

interface CornerEditorDialogProps {
  isOpen: boolean;
  /** Absolute URL of the original (unwarped) photo. */
  imageSrc: string;
  imageName: string;
  /** Previously saved corners (normalised 0–1), or null for a fresh alignment. */
  initialCorners: Quad | null;
  onApply: (corners: Quad) => void;
  onCancel: () => void;
  isApplying?: boolean;
  error?: string | null;
}

interface DragState {
  index: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCorner: Point;
  rect: DOMRect;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function withCorner(corners: Quad, index: number, p: Point): Quad {
  const next = [...corners] as Quad;
  next[index] = { x: clamp01(p.x), y: clamp01(p.y) };
  return next;
}

export function CornerEditorDialog(props: CornerEditorDialogProps) {
  if (!props.isOpen) return null;
  return <CornerEditorDialogContent {...props} />;
}

function CornerEditorDialogContent({
  imageSrc,
  imageName,
  initialCorners,
  onApply,
  onCancel,
  isApplying = false,
  error,
}: CornerEditorDialogProps) {
  const [corners, setCorners] = useState<Quad>(() => initialCorners ?? defaultQuad(DEFAULT_INSET));
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Angles only mean something in pixel space: normalised coords stretch them
  const validation = useMemo(() => {
    const w = imageSize?.width ?? 1;
    const h = imageSize?.height ?? 1;
    return validateQuad(corners.map(p => ({ x: p.x * w, y: p.y * h })) as Quad);
  }, [corners, imageSize]);

  const canApply = imageSize !== null && validation.valid && !isApplying;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const handlePointerDown = (index: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    dragRef.current = {
      index,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCorner: corners[index],
      rect: stage.getBoundingClientRect(),
    };
    setStageSize({ width: dragRef.current.rect.width, height: dragRef.current.rect.height });
    setActiveIndex(index);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || drag.rect.width === 0 || drag.rect.height === 0) return;
    // Move relative to where the drag started so the finger never has to cover the exact point
    const x = drag.startCorner.x + (e.clientX - drag.startClientX) / drag.rect.width;
    const y = drag.startCorner.y + (e.clientY - drag.startClientY) / drag.rect.height;
    setCorners(prev => withCorner(prev, drag.index, { x, y }));
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setActiveIndex(null);
  };

  const handleHandleKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const delta = ARROW_DELTAS[e.key];
    if (!delta) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    setCorners(prev => withCorner(prev, index, {
      x: prev[index].x + delta.x * step,
      y: prev[index].y + delta.y * step,
    }));
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  const handleApply = () => {
    if (canApply) onApply(corners);
  };

  const polygonPoints = corners.map(p => `${p.x * 100},${p.y * 100}`).join(' ');
  const activeCorner = activeIndex !== null ? corners[activeIndex] : null;

  return (
    <div className="layout-dialog-overlay corner-editor-overlay" onClick={onCancel}>
      <div
        className="layout-dialog corner-editor"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Align photo to grid"
      >
        <div className="layout-dialog-header">
          <h2>Align photo to grid</h2>
          <button className="layout-dialog-close" onClick={onCancel} type="button" aria-label="Close">
            x
          </button>
        </div>

        <div className="layout-dialog-body corner-editor__body">
          <p className="corner-editor__hint">
            Drag each handle onto the matching corner of your grid in the photo. The photo is straightened so
            those points land on the grid corners; anything outside them still shows around the grid.
          </p>
          <p className="corner-editor__limits">
            The shape must be convex, with every corner angle between {MIN_CORNER_ANGLE_DEG}° and {MAX_CORNER_ANGLE_DEG}°.
          </p>

          <div className="corner-editor__viewport">
            <div className="corner-editor__stage" ref={stageRef} data-testid="corner-editor-stage">
              <img
                src={imageSrc}
                alt={imageName}
                className="corner-editor__image"
                draggable={false}
                onLoad={handleImageLoad}
              />
              <svg
                className="corner-editor__outline"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polygon
                  points={polygonPoints}
                  className={validation.valid ? '' : 'corner-editor__outline--invalid'}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {corners.map((p, i) => (
                <button
                  key={CORNER_LABELS[i]}
                  type="button"
                  className={`corner-editor__handle${activeIndex === i ? ' corner-editor__handle--active' : ''}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  aria-label={`${CORNER_LABELS[i]} corner`}
                  title={`${CORNER_LABELS[i]} corner — drag, or use arrow keys (Shift for bigger steps)`}
                  onPointerDown={handlePointerDown(i)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={handleHandleKeyDown(i)}
                >
                  <span className="corner-editor__handle-label" aria-hidden="true">{CORNER_SHORT_LABELS[i]}</span>
                </button>
              ))}
              {activeCorner && stageSize && (
                <div
                  className={`corner-editor__loupe corner-editor__loupe--${activeCorner.x < 0.5 ? 'right' : 'left'}`}
                  aria-hidden="true"
                  style={{
                    backgroundImage: `url("${imageSrc}")`,
                    width: LOUPE_RADIUS_PX * 2,
                    height: LOUPE_RADIUS_PX * 2,
                    backgroundSize: `${stageSize.width * LOUPE_ZOOM}px ${stageSize.height * LOUPE_ZOOM}px`,
                    // Centre the loupe on the corner point
                    backgroundPosition: `${LOUPE_RADIUS_PX - activeCorner.x * stageSize.width * LOUPE_ZOOM}px ${LOUPE_RADIUS_PX - activeCorner.y * stageSize.height * LOUPE_ZOOM}px`,
                  }}
                />
              )}
            </div>
          </div>

          <ul className="corner-editor__angles" aria-label="Corner angles">
            {validation.angles.map((angle, i) => {
              const inRange = angle >= MIN_CORNER_ANGLE_DEG && angle <= MAX_CORNER_ANGLE_DEG;
              return (
                <li key={CORNER_LABELS[i]} className={inRange ? '' : 'corner-editor__angle--bad'}>
                  {CORNER_LABELS[i]} <span>{Math.round(angle)}°</span>
                </li>
              );
            })}
          </ul>

          {!validation.valid && (
            <div className="corner-editor__warning" role="alert">
              {validation.issues.map(issue => <p key={issue}>{issue}</p>)}
            </div>
          )}
          {error && <p className="layout-error-message">{error}</p>}

          <div className="layout-dialog-actions corner-editor__actions">
            <button
              type="button"
              className="cancel-button corner-editor__reset"
              onClick={() => setCorners(defaultQuad(DEFAULT_INSET))}
            >
              Reset handles
            </button>
            <button type="button" className="cancel-button" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="submit-button" onClick={handleApply} disabled={!canApply}>
              {isApplying ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
