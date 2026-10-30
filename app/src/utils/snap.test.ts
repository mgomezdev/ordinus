import { describe, it, expect } from 'vitest';
import { snapToHalf, snapPointerToCell, footprintSnapStep, supportsHalfGrid, violatesHalfGrid, WHOLE_CELL_STEP, HALF_CELL_STEP } from './snap';

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
  it('snaps bases with half pitch (the default) to half-cells', () => {
    expect(footprintSnapStep({})).toBe(HALF_CELL_STEP);
    expect(footprintSnapStep({ parameters: { half_pitch: 'true' } })).toBe(HALF_CELL_STEP);
  });

  it('snaps classic bases without half pitch to whole units', () => {
    expect(footprintSnapStep({ parameters: { half_pitch: 'false' } })).toBe(WHOLE_CELL_STEP);
    expect(footprintSnapStep({ customSpec: { width: 3, depth: 2, height: 4, overrides: { half_pitch: false } } })).toBe(WHOLE_CELL_STEP);
  });
});

describe('half pitch gating', () => {
  const noHalf = { width: 3, depth: 2, height: 4, overrides: { half_pitch: false } };
  const withHalf = { width: 3, depth: 2, height: 4, overrides: {} };

  it('lets custom bins with half pitch drag in half-cell steps even at whole-unit sizes', () => {
    expect(footprintSnapStep({ customSpec: withHalf })).toBe(HALF_CELL_STEP);
  });

  it('keeps custom bins without half pitch on whole units', () => {
    expect(footprintSnapStep({ customSpec: noHalf })).toBe(WHOLE_CELL_STEP);
    expect(supportsHalfGrid({ customSpec: noHalf })).toBe(false);
  });

  it('treats a library item as half-capable unless its parameters turn half pitch off', () => {
    expect(supportsHalfGrid({})).toBe(true);
    expect(supportsHalfGrid({ parameters: { half_pitch: 'true' } })).toBe(true);
    expect(supportsHalfGrid({ parameters: { half_pitch: 'false' } })).toBe(false);
  });

  it('flags only items that sit on a half-unit boundary without half pitch', () => {
    expect(violatesHalfGrid({ x: 1, y: 0, width: 6, height: 4, customSpec: noHalf })).toBe(true);
    expect(violatesHalfGrid({ x: 2, y: 0, width: 6, height: 4, customSpec: noHalf })).toBe(false);
    expect(violatesHalfGrid({ x: 1, y: 0, width: 6, height: 4, customSpec: withHalf })).toBe(false);
  });
});
