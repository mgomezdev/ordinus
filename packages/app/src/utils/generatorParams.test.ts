import { describe, it, expect } from 'vitest';
import { mergeGeneratorParams, generatorParamsToBinCustomization } from './generatorParams';
import type { CustomizableFieldDef } from '../types/gridfinity';

// Build minimal field defs for test assertions — only `field` matters for inclusion checks
function defs(...fields: Array<'wallPatternEnabled' | 'wallPattern' | 'lipStyle' | 'fingerSlide' | 'wallCutout' | 'height'>): CustomizableFieldDef[] {
  return fields.map(f => {
    if (f === 'height') return { field: f, label: 'Height', min: 1, max: 20 };
    if (f === 'wallPatternEnabled') return { field: f, label: 'Wall Pattern' };
    return { field: f, label: f, options: [] };
  });
}

describe('mergeGeneratorParams', () => {
  it('returns empty object with no args', () => {
    expect(mergeGeneratorParams()).toEqual({});
  });

  it('returns copy of single layer', () => {
    expect(mergeGeneratorParams({ lip_style: 'none' })).toEqual({ lip_style: 'none' });
  });

  it('later layers override earlier layers', () => {
    expect(mergeGeneratorParams(
      { lip_style: 'none', label_style: 'normal' },
      { lip_style: 'reduced' }
    )).toEqual({ lip_style: 'reduced', label_style: 'normal' });
  });

  it('skips undefined layers', () => {
    expect(mergeGeneratorParams(undefined, { lip_style: 'none' }, undefined)).toEqual({ lip_style: 'none' });
  });

  it('later undefined does not clear earlier values', () => {
    expect(mergeGeneratorParams({ lip_style: 'none' }, undefined)).toEqual({ lip_style: 'none' });
  });
});

describe('generatorParamsToBinCustomization', () => {
  it('maps lip_style to lipStyle when in customizableFields', () => {
    const result = generatorParamsToBinCustomization({ lip_style: 'reduced' }, defs('lipStyle'));
    expect(result.lipStyle).toBe('reduced');
  });

  it('ignores lip_style when lipStyle not in customizableFields', () => {
    const result = generatorParamsToBinCustomization({ lip_style: 'reduced' }, defs('wallPattern'));
    expect(result.lipStyle).toBeUndefined();
  });

  it('maps fingerslide to fingerSlide', () => {
    const result = generatorParamsToBinCustomization({ fingerslide: 'rounded' }, defs('fingerSlide'));
    expect(result.fingerSlide).toBe('rounded');
  });

  it('maps wallpattern_enabled: true + style to wallPattern', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: true, wallpattern_style: 'hexgrid' },
      defs('wallPattern')
    );
    expect(result.wallPattern).toBe('hexgrid');
  });

  it('maps wallpattern_enabled: true with no style to grid (default)', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: true },
      defs('wallPattern')
    );
    expect(result.wallPattern).toBe('grid');
  });

  it('maps wallpattern_enabled: false to wallPatternEnabled: false', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: false },
      defs('wallPattern')
    );
    expect(result.wallPatternEnabled).toBe(false);
    expect(result.wallPattern).toBe('grid');
  });

  it('ignores wallPattern params when wallPattern not in customizableFields', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: true, wallpattern_style: 'grid' },
      defs('lipStyle')
    );
    expect(result.wallPattern).toBeUndefined();
  });

  it('maps height array [n, offset] to height n', () => {
    const result = generatorParamsToBinCustomization({ height: [4, 0] }, defs('height'));
    expect(result.height).toBe(4);
  });

  it('maps height as plain number', () => {
    const result = generatorParamsToBinCustomization({ height: 6 }, defs('height'));
    expect(result.height).toBe(6);
  });

  it('maps wallcutout_enabled: true + [1,0,1,0] to vertical', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [1, 0, 1, 0] },
      defs('wallCutout')
    );
    expect(result.wallCutout).toBe('vertical');
  });

  it('maps wallcutout_enabled: true + [0,1,0,1] to horizontal', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [0, 1, 0, 1] },
      defs('wallCutout')
    );
    expect(result.wallCutout).toBe('horizontal');
  });

  it('maps wallcutout_enabled: true + [1,1,1,1] to both', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [1, 1, 1, 1] },
      defs('wallCutout')
    );
    expect(result.wallCutout).toBe('both');
  });

  it('maps wallcutout_enabled: false to none', () => {
    const result = generatorParamsToBinCustomization({ wallcutout_enabled: false }, defs('wallCutout'));
    expect(result.wallCutout).toBe('none');
  });

  it('ignores wallCutout params when wallCutout not in customizableFields', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [1, 1, 1, 1] },
      defs('lipStyle')
    );
    expect(result.wallCutout).toBeUndefined();
  });

  it('returns empty object for empty params', () => {
    const result = generatorParamsToBinCustomization({}, defs('lipStyle', 'wallPattern', 'fingerSlide', 'wallCutout', 'height'));
    expect(result).toEqual({});
  });

  it('maps multiple fields at once', () => {
    const result = generatorParamsToBinCustomization(
      { lip_style: 'none', fingerslide: 'chamfered', height: [4, 0] },
      defs('lipStyle', 'fingerSlide', 'height')
    );
    expect(result).toEqual({ lipStyle: 'none', fingerSlide: 'chamfered', height: 4 });
  });
});
