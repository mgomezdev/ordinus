import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { GRID_RESOLUTION } from '@gridfinity/shared';

export interface DrawnFootprint { x: number; y: number; width: number; depth: number }
interface Point { x: number; y: number }

// eslint-disable-next-line react-refresh/only-export-components
export function rectangleFromPoints(start: Point, end: Point): DrawnFootprint | null {
  const width = Math.abs(end.x - start.x), depth = Math.abs(end.y - start.y);
  return width && depth ? { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, depth } : null;
}

interface Props {
  gridX: number; gridY: number; drawing: boolean; selection: DrawnFootprint | null; valid: boolean;
  onChange: (value: DrawnFootprint | null) => void; onFinish: () => void; onCancel: () => void;
  isPanning?: () => boolean;
}

export function DrawFootprint({ gridX, gridY, drawing, selection, valid, onChange, onFinish, onCancel, isPanning }: Props) {
  const start = useRef<Point | null>(null);
  const pointer = useRef<number | null>(null);
  const point = (e: PointerEvent<HTMLDivElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - rect.left) / rect.width * gridX * GRID_RESOLUTION),
      y: Math.round((e.clientY - rect.top) / rect.height * gridY * GRID_RESOLUTION),
    };
  };
  const cancel = () => { start.current = null; pointer.current = null; onCancel(); };
  return <>
    {selection && <div className={`drawn-footprint${valid ? '' : ' drawn-footprint--invalid'}`} style={{
      left: `${selection.x / (gridX * GRID_RESOLUTION) * 100}%`, top: `${selection.y / (gridY * GRID_RESOLUTION) * 100}%`,
      width: `${selection.width / (gridX * GRID_RESOLUTION) * 100}%`, height: `${selection.depth / (gridY * GRID_RESOLUTION) * 100}%`,
    }}><span>{selection.width / GRID_RESOLUTION} × {selection.depth / GRID_RESOLUTION}{!valid && ' · Cannot place here'}</span></div>}
    {drawing && <div className="draw-footprint-surface" role="button" tabIndex={0} aria-label="Draw bin footprint. Drag a rectangle or use the footprint fields in the library panel. Escape cancels."
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }}
      onPointerDown={e => {
        if (!e.isPrimary) { cancel(); return; }
        if (e.button !== 0 || isPanning?.()) return;
        e.preventDefault(); e.stopPropagation();
        start.current = point(e); pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId); onChange(null);
      }}
      onPointerMove={e => {
        if (start.current && pointer.current === e.pointerId) { e.stopPropagation(); onChange(rectangleFromPoints(start.current, point(e))); }
      }}
      onPointerUp={e => {
        if (!start.current || pointer.current !== e.pointerId) return;
        e.stopPropagation(); onChange(rectangleFromPoints(start.current, point(e)));
        start.current = null; pointer.current = null; onFinish();
      }}
      onPointerCancel={cancel}
      onClick={e => e.stopPropagation()}
    />}
  </>;
}
