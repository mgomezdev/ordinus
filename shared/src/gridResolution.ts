/**
 * Placed-item geometry (x, y, width, height) is stored in integer half-cells:
 * `halfCells = GRID_RESOLUTION * units`. Layouts saved before half-unit bins existed
 * were stored in whole units (resolution 1) and are scaled on read.
 */
export const GRID_RESOLUTION = 2;
export const LEGACY_GRID_RESOLUTION = 1;

export interface PlacedGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function unitsToHalfCells(units: number): number {
  return Math.round(units * GRID_RESOLUTION);
}

export function halfCellsToUnits(halfCells: number): number {
  return halfCells / GRID_RESOLUTION;
}

/** Rescales placed-item geometry from `fromResolution` to the current GRID_RESOLUTION. */
export function rescalePlacedGeometry<T extends PlacedGeometry>(item: T, fromResolution: number): T {
  if (fromResolution === GRID_RESOLUTION) return item;
  const factor = GRID_RESOLUTION / fromResolution;
  return {
    ...item,
    x: item.x * factor,
    y: item.y * factor,
    width: item.width * factor,
    height: item.height * factor,
  };
}
