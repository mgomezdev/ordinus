import { describe, it, expect } from 'vitest';
import { snapToHalf, snapPointerToCell, footprintSnapStep, WHOLE_CELL_STEP, HALF_CELL_STEP } from './snap';

describe('snapToHalf', () => {
  it.each([[1.24, 1], [1.26, 1.5], [1.5, 1.5], [0, 0], [2.74, 2.5], [2.76, 3]])('snaps %s to %s', (v, expected) => {
    expect(snapToHalf(v)).toBe(expected);
  });
});

describe('snapPointerToCell', () => {
  const HALF_CELL_PX = 50;
  const HALF_CELLS = 8;

  it('floors to whole units (2 half-cells) with the whole-cell step', () => {
    expect(snapPointerToCell(160, HALF_CELL_PX, HALF_CELLS, WHOLE_CELL_STEP)).toBe(2);
    expect(snapPointerToCell(99, HALF_CELL_PX, HALF_CELLS, WHOLE_CELL_STEP)).toBe(0);
  });

  it('floors to single half-cells with the half-cell step', () => {
    expect(snapPointerToCell(160, HALF_CELL_PX, HALF_CELLS, HALF_CELL_STEP)).toBe(3);
    expect(snapPointerToCell(140, HALF_CELL_PX, HALF_CELLS, HALF_CELL_STEP)).toBe(2);
    expect(snapPointerToCell(49, HALF_CELL_PX, HALF_CELLS, HALF_CELL_STEP)).toBe(0);
  });

  it('clamps to the last whole or half cell inside the grid', () => {
    expect(snapPointerToCell(9999, HALF_CELL_PX, HALF_CELLS, WHOLE_CELL_STEP)).toBe(6);
    expect(snapPointerToCell(9999, HALF_CELL_PX, HALF_CELLS, HALF_CELL_STEP)).toBe(7);
    expect(snapPointerToCell(-50, HALF_CELL_PX, HALF_CELLS, HALF_CELL_STEP)).toBe(0);
  });
});

describe('footprintSnapStep', () => {
  it('uses half-cell steps when any value is odd', () => {
    expect(footprintSnapStep({ x: 0, y: 0, width: 5, height: 2 })).toBe(HALF_CELL_STEP);
    expect(footprintSnapStep({ x: 1, y: 0, width: 4, height: 2 })).toBe(HALF_CELL_STEP);
    expect(footprintSnapStep({ x: 0, y: 3, width: 4, height: 2 })).toBe(HALF_CELL_STEP);
  });

  it('uses whole-cell steps when everything is even', () => {
    expect(footprintSnapStep({ x: 0, y: 2, width: 4, height: 2 })).toBe(WHOLE_CELL_STEP);
  });
});
