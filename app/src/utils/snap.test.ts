import { describe, it, expect } from 'vitest';
import { snapToHalf, snapPointerToCell, isHalfUnitStep } from './snap';

describe('snapToHalf', () => {
  it.each([[1.24, 1], [1.26, 1.5], [1.5, 1.5], [0, 0], [2.74, 2.5], [2.76, 3]])('snaps %s to %s', (v, expected) => {
    expect(snapToHalf(v)).toBe(expected);
  });
});

describe('snapPointerToCell', () => {
  const CELL = 100;
  const CELLS = 4;

  it('floors to whole cells when step is 1', () => {
    expect(snapPointerToCell(160, CELL, CELLS, 1)).toBe(1);
    expect(snapPointerToCell(99, CELL, CELLS, 1)).toBe(0);
  });

  it('floors to half cells when step is 0.5', () => {
    expect(snapPointerToCell(160, CELL, CELLS, 0.5)).toBe(1.5);
    expect(snapPointerToCell(140, CELL, CELLS, 0.5)).toBe(1);
    expect(snapPointerToCell(49, CELL, CELLS, 0.5)).toBe(0);
  });

  it('clamps to the last whole or half cell inside the grid', () => {
    expect(snapPointerToCell(9999, CELL, CELLS, 1)).toBe(3);
    expect(snapPointerToCell(9999, CELL, CELLS, 0.5)).toBe(3.5);
    expect(snapPointerToCell(-50, CELL, CELLS, 0.5)).toBe(0);
  });
});

describe('isHalfUnitStep', () => {
  it('is true when any dimension is a half unit', () => {
    expect(isHalfUnitStep({ x: 0, y: 0, width: 2.5, height: 1 })).toBe(true);
    expect(isHalfUnitStep({ x: 0.5, y: 0, width: 2, height: 1 })).toBe(true);
    expect(isHalfUnitStep({ x: 0, y: 0, width: 2, height: 1 })).toBe(false);
  });
});
