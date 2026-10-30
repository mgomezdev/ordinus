import { GRID_RESOLUTION, halfPitchEnabled, specUsesHalfPitch } from '@gridfinity/shared';
import type { CustomBinSpec } from '@gridfinity/shared';
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
  customSpec?: CustomBinSpec;
  parameters?: Record<string, unknown>;
}

function isOnHalfUnit(item: Footprint): boolean {
  return [item.x, item.y, item.width, item.height].some(v => v % GRID_RESOLUTION !== 0);
}

/** Half-unit placement needs a base with subdivided pads, i.e. the generator's `half_pitch` on (the default). */
export function supportsHalfGrid(item: Pick<Footprint, 'customSpec' | 'parameters'>): boolean {
  if (item.customSpec) return specUsesHalfPitch(item.customSpec);
  const halfPitch = item.parameters?.['half_pitch'];
  return halfPitch === undefined || halfPitchEnabled(halfPitch);
}

/** True when the item sits on a half-unit boundary its base cannot support. */
export function violatesHalfGrid(item: Footprint): boolean {
  return isOnHalfUnit(item) && !supportsHalfGrid(item);
}

/**
 * Drag step in half-cells. A base with half pitch matches the half-length grid, so it snaps to half-cells;
 * a classic base only fits the full grid, so it snaps to whole units.
 */
export function footprintSnapStep(item: Pick<Footprint, 'customSpec' | 'parameters'>): number {
  return supportsHalfGrid(item) ? HALF_CELL_STEP : WHOLE_CELL_STEP;
}
