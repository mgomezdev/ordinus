import { HALF_UNIT } from './constants';

export function snapToHalf(value: number): number {
  return Math.round(value / HALF_UNIT) * HALF_UNIT;
}

/** Grid coordinate of a pointer offset, floored to `step` and kept inside a grid of `cells` cells. */
export function snapPointerToCell(offsetPx: number, cellPx: number, cells: number, step: number): number {
  const snapped = Math.floor(offsetPx / cellPx / step) * step;
  return Math.max(0, Math.min(snapped, cells - step));
}

interface Footprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Items with a fractional position or size must be dragged in half-unit steps. */
export function isHalfUnitStep(item: Footprint): boolean {
  return [item.x, item.y, item.width, item.height].some(v => !Number.isInteger(v));
}
