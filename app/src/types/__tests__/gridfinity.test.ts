import { describe, it, expect } from 'vitest';
import { DEFAULT_BIN_CUSTOMIZATION, isDefaultCustomization, serializeCustomization } from '../gridfinity';

describe('WallCutoutConfig', () => {
  it('DEFAULT_BIN_CUSTOMIZATION has all-false wallCutout', () => {
    expect(DEFAULT_BIN_CUSTOMIZATION.wallCutout).toEqual({
      front: false, back: false, left: false, right: false,
    });
  });

  it('serializeCustomization encodes wallCutout as wall letters', () => {
    const result = serializeCustomization({
      ...DEFAULT_BIN_CUSTOMIZATION,
      wallCutout: { front: true, back: false, left: true, right: false },
    });
    // wcKey for front+left = "F-L-", full result: "none|normal|none|F-L-|4"
    expect(result).toBe('none|normal|none|F-L-|4');
  });

  it('serializeCustomization encodes all-false wallCutout as "----"', () => {
    const result = serializeCustomization(DEFAULT_BIN_CUSTOMIZATION);
    // all-false wcKey = "----", full result: "none|normal|none|----|4"
    expect(result).toBe('none|normal|none|----|4');
  });
});

describe('isDefaultCustomization', () => {
  it('returns true for default customization', () => {
    expect(isDefaultCustomization(DEFAULT_BIN_CUSTOMIZATION)).toBe(true);
  });

  it('returns false when any wall is checked', () => {
    expect(isDefaultCustomization({
      ...DEFAULT_BIN_CUSTOMIZATION,
      wallCutout: { front: true, back: false, left: false, right: false },
    })).toBe(false);
  });
});
