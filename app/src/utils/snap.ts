import { GRID_RESOLUTION } from '@gridfinity/shared';
import { HALF_UNIT } from './constants';

/** Drop-position step, in half-cells: whole-unit items land on unit boundaries. */
export const WHOLE_CELL_STEP = GRID_RESOLUTION;
export const HALF_CELL_STEP = 1;

export function snapToHalf(value: number): number {
  return Math.round(value / HALF_UNIT) * HALF_UNIT;
}

/** Half-cell coordinate of a pointer offset, floored to `step` half-cells and kept inside a grid of `halfCells`. */
export function snapPointerToCell(offsetPx: number, halfCellPx: number, halfCells: number, step: number): number {
  const snapped = Math.floor(offsetPx / halfCellPx / step) * step;
  return Math.max(0, Math.min(snapped, halfCells - step));
}

interface Footprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Items with an odd half-cell position or size sit on half-unit boundaries and drag in half-cell steps. */
export function footprintSnapStep(item: Footprint): number {
  const onHalfUnit = [item.x, item.y, item.width, item.height].some(v => v % GRID_RESOLUTION !== 0);
  return onHalfUnit ? HALF_CELL_STEP : WHOLE_CELL_STEP;
}
