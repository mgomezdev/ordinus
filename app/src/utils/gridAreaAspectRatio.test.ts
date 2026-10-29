import { describe, it, expect } from 'vitest';
import { gridAreaAspectRatio } from './gridAreaAspectRatio';
import type { ComputedSpacer } from '../types/gridfinity';

function spacer(position: ComputedSpacer['position'], renderWidth: number, renderHeight: number): ComputedSpacer {
  return { id: position, position, size: 0, renderX: 0, renderY: 0, renderWidth, renderHeight } as ComputedSpacer;
}

describe('gridAreaAspectRatio', () => {
  it('is gridX / gridY with no spacers', () => {
    expect(gridAreaAspectRatio(6, 4, [])).toBeCloseTo(1.5);
  });

  it('accounts for the area spacers take from the preview', () => {
    const spacers = [spacer('left', 10, 100), spacer('right', 10, 100), spacer('top', 100, 20)];
    // width 80% of 6, height 80% of 4
    expect(gridAreaAspectRatio(6, 4, spacers)).toBeCloseTo((6 * 80) / (4 * 80));
  });
});
