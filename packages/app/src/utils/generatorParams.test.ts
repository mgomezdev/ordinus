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

  it('maps wallcutout_vertical: disabled + wallcutout_horizontal: disabled → all false', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'disabled', wallcutout_horizontal: 'disabled' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: false, back: false, left: false, right: false });
  });

  it('maps wallcutout_vertical: frontonly → front true only', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'frontonly', wallcutout_horizontal: 'disabled' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: true, back: false, left: false, right: false });
  });

  it('maps wallcutout_vertical: backonly → back true only', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'backonly', wallcutout_horizontal: 'disabled' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: false, back: true, left: false, right: false });
  });

  it('maps wallcutout_vertical: enabled → front + back true', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'enabled', wallcutout_horizontal: 'disabled' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: true, back: true, left: false, right: false });
  });

  it('maps wallcutout_horizontal: leftonly → left true only', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'disabled', wallcutout_horizontal: 'leftonly' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: false, back: false, left: true, right: false });
  });

  it('maps wallcutout_horizontal: rightonly → right true only', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'disabled', wallcutout_horizontal: 'rightonly' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: false, back: false, left: false, right: true });
  });

  it('maps wallcutout_horizontal: enabled → left + right true', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'disabled', wallcutout_horizontal: 'enabled' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: false, back: false, left: true, right: true });
  });

  it('maps both enabled → all true', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'enabled', wallcutout_horizontal: 'enabled' },
      defs('wallCutout')
    );
    expect(result.wallCutout).toEqual({ front: true, back: true, left: true, right: true });
  });

  it('ignores wallCutout params when wallCutout not in customizableFields', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_vertical: 'enabled', wallcutout_horizontal: 'enabled' },
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
