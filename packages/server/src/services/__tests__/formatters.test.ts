import { describe, it, expect } from 'vitest';
import { parseCustomization } from '../formatters';

describe('parseCustomization migration', () => {
  it('migrates old "none" string to WallCutoutConfig', () => {
    const input = JSON.stringify({ wallCutout: 'none', wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', height: 4 });
    const result = parseCustomization(input);
    expect(result?.wallCutout).toEqual({ front: false, back: false, left: false, right: false });
  });

  it('migrates old "vertical" string to front+back', () => {
    const input = JSON.stringify({ wallCutout: 'vertical', wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', height: 4 });
    const result = parseCustomization(input);
    expect(result?.wallCutout).toEqual({ front: true, back: true, left: false, right: false });
  });

  it('migrates old "horizontal" string to left+right', () => {
    const input = JSON.stringify({ wallCutout: 'horizontal', wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', height: 4 });
    const result = parseCustomization(input);
    expect(result?.wallCutout).toEqual({ front: false, back: false, left: true, right: true });
  });

  it('migrates old "both" string to all walls', () => {
    const input = JSON.stringify({ wallCutout: 'both', wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', height: 4 });
    const result = parseCustomization(input);
    expect(result?.wallCutout).toEqual({ front: true, back: true, left: true, right: true });
  });

  it('leaves new object format unchanged', () => {
    const wc = { front: true, back: false, left: false, right: true };
    const input = JSON.stringify({ wallCutout: wc, wallPatternEnabled: false, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', height: 4 });
    const result = parseCustomization(input);
    expect(result?.wallCutout).toEqual(wc);
  });
});
