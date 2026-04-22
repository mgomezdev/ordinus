import { describe, it, expect } from 'vitest';
import { DEFAULT_BIN_CUSTOMIZATION, serializeCustomization } from '../gridfinity';

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
    expect(result).toContain('FL');
  });

  it('serializeCustomization encodes all-false wallCutout as "none"', () => {
    const result = serializeCustomization(DEFAULT_BIN_CUSTOMIZATION);
    expect(result).toContain('none');
  });
});
