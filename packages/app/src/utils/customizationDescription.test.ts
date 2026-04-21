import { describe, it, expect } from 'vitest';
import { formatCustomizationDescription } from './customizationDescription';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';

describe('formatCustomizationDescription', () => {
  it('returns empty string for default customization', () => {
    expect(formatCustomizationDescription(DEFAULT_BIN_CUSTOMIZATION)).toBe('');
  });

  it('returns empty string when all fields are default', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION })).toBe('');
  });

  it('formats non-default wall pattern', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true, wallPattern: 'hexgrid' }))
      .toBe('Hex Wall');
  });

  it('formats non-default lip style', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, lipStyle: 'reduced' }))
      .toBe('Reduced Lip');
  });

  it('formats non-default finger slide', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, fingerSlide: 'chamfered' }))
      .toBe('Chamfered Finger Slide');
  });

  it('formats non-default wall cutout', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: 'both' }))
      .toBe('Full Cutout');
  });

  it('formats non-default height', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, height: 3 }))
      .toBe('3u height');
  });

  it('joins multiple non-default fields with ·', () => {
    expect(formatCustomizationDescription({
      wallPatternEnabled: true,
      wallPattern: 'hexgrid',
      lipStyle: 'reduced',
      fingerSlide: 'rounded',
      wallCutout: 'vertical',
      height: 3,
    })).toBe('Hex Wall · Reduced Lip · Rounded Finger Slide · Vertical Cutout · 3u height');
  });

  it('handles all wall pattern values', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true, wallPattern: 'grid' })).toBe('Grid Wall');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true, wallPattern: 'voronoi' })).toBe('Voronoi Wall');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true, wallPattern: 'voronoigrid' })).toBe('Voronoi Grid Wall');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPatternEnabled: true, wallPattern: 'voronoihexgrid' })).toBe('Voronoi Hex Wall');
  });

  it('handles all lip style values', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, lipStyle: 'minimum' })).toBe('Minimum Lip');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, lipStyle: 'none' })).toBe('No Lip');
  });

  it('handles all wall cutout values', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: 'vertical' })).toBe('Vertical Cutout');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: 'horizontal' })).toBe('Horizontal Cutout');
  });

  it('handles rounded finger slide', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, fingerSlide: 'rounded' })).toBe('Rounded Finger Slide');
  });
});
