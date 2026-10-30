import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { buildCustomBinParams } from '@gridfinity/shared';
import { useCustomBinForm } from './useCustomBinForm';

describe('useCustomBinForm', () => {
  it('starts with a valid default spec and no overrides', () => {
    const { result } = renderHook(() => useCustomBinForm());
    expect(result.current.spec).toEqual({ width: 2, depth: 1, height: 4, overrides: {} });
    expect(result.current.errors).toEqual([]);
  });

  it('snaps sizes to half units and clamps to 0.5-20', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => result.current.setSize('width', 2.3));
    expect(result.current.spec.width).toBe(2.5);
    act(() => result.current.setSize('depth', 0));
    expect(result.current.spec.depth).toBe(0.5);
    act(() => result.current.setSize('height', 99));
    expect(result.current.spec.height).toBe(20);
    act(() => result.current.setSize('height', Number.NaN));
    expect(result.current.spec.height).toBe(20);
  });

  it('stores an override only while it differs from the default', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => result.current.setOverride('magnet_diameter', 6.5));
    expect(result.current.isOverridden('magnet_diameter')).toBe(true);
    expect(result.current.spec.overrides).toEqual({ magnet_diameter: 6.5 });
    act(() => result.current.setOverride('magnet_diameter', 0));
    expect(result.current.isOverridden('magnet_diameter')).toBe(false);
    expect(result.current.spec.overrides).toEqual({});
  });

  it('reports the effective value: override first, then the default', () => {
    const { result } = renderHook(() => useCustomBinForm());
    expect(result.current.valueOf('label_style')).toBe('disabled');
    act(() => result.current.setOverride('label_style', 'normal'));
    expect(result.current.valueOf('label_style')).toBe('normal');
  });

  it('resets one override and all overrides', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => {
      result.current.setOverride('magnet_diameter', 6.5);
      result.current.setOverride('screw_depth', 6);
    });
    act(() => result.current.resetOverride('magnet_diameter'));
    expect(Object.keys(result.current.spec.overrides)).toEqual(['screw_depth']);
    act(() => result.current.resetAll());
    expect(result.current.spec.overrides).toEqual({});
  });

  it('gates dependent parameters and drops them when the enabler is turned off', () => {
    const { result } = renderHook(() => useCustomBinForm());
    expect(result.current.isEnabled('wallpattern_hole_size')).toBe(false);
    act(() => result.current.setOverride('wallpattern_enabled', true));
    expect(result.current.isEnabled('wallpattern_hole_size')).toBe(true);
    act(() => result.current.setOverride('wallpattern_hole_size', 3));
    expect(result.current.spec.overrides).toMatchObject({ wallpattern_hole_size: 3 });
    act(() => result.current.setOverride('wallpattern_enabled', false));
    expect(result.current.spec.overrides).toEqual({});
  });

  it('counts overrides per group', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => {
      result.current.setOverride('magnet_diameter', 6.5);
      result.current.setOverride('lip_style', 'none');
    });
    expect(result.current.overrideCount()).toBe(2);
    expect(result.current.overrideCount('Base')).toBe(1);
    expect(result.current.overrideCount('General')).toBe(1);
    expect(result.current.overrideCount('Label')).toBe(0);
  });

  it('produces the same params for an explicit default as for an untouched one', () => {
    const { result } = renderHook(() => useCustomBinForm());
    const untouched = buildCustomBinParams(result.current.spec);
    act(() => result.current.setOverride('floor_thickness', 0.7));
    expect(buildCustomBinParams(result.current.spec)).toEqual(untouched);
  });

  it('starts from an initial spec', () => {
    const initial = { width: 3, depth: 2, height: 4, overrides: { magnet_diameter: 6.5 } };
    const { result } = renderHook(() => useCustomBinForm(initial));
    expect(result.current.spec).toEqual(initial);
  });
});
