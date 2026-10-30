import { describe, it, expect } from 'vitest';
import { wallCutoutToParams, wallCutoutFromParams } from '@gridfinity/shared';
import type { WallCutoutConfig } from '@gridfinity/shared';

const none: WallCutoutConfig = { front: false, back: false, left: false, right: false };

describe('wallCutoutToParams', () => {
  it('disables both axes when no wall is cut', () => {
    expect(wallCutoutToParams(none)).toEqual({ wallcutout_vertical: 'disabled', wallcutout_horizontal: 'disabled' });
  });

  it('maps front and back onto the vertical cutout', () => {
    expect(wallCutoutToParams({ ...none, front: true }).wallcutout_vertical).toBe('frontonly');
    expect(wallCutoutToParams({ ...none, back: true }).wallcutout_vertical).toBe('backonly');
    expect(wallCutoutToParams({ ...none, front: true, back: true }).wallcutout_vertical).toBe('enabled');
  });

  it('maps left and right onto the horizontal cutout, mirrored', () => {
    expect(wallCutoutToParams({ ...none, left: true }).wallcutout_horizontal).toBe('rightonly');
    expect(wallCutoutToParams({ ...none, right: true }).wallcutout_horizontal).toBe('leftonly');
    expect(wallCutoutToParams({ ...none, left: true, right: true }).wallcutout_horizontal).toBe('enabled');
  });

  it('round-trips every combination', () => {
    for (let bits = 0; bits < 16; bits++) {
      const wc = { front: !!(bits & 1), back: !!(bits & 2), left: !!(bits & 4), right: !!(bits & 8) };
      expect(wallCutoutFromParams(wallCutoutToParams(wc))).toEqual(wc);
    }
  });
});

describe('wallCutoutFromParams', () => {
  it('returns undefined when the params have no cutout settings', () => {
    expect(wallCutoutFromParams({ width: [1, 0] })).toBeUndefined();
  });

  it('treats a missing axis as disabled', () => {
    expect(wallCutoutFromParams({ wallcutout_vertical: 'frontonly' })).toEqual({ ...none, front: true });
  });
});
