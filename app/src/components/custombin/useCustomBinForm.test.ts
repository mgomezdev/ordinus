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

  it('reports an error for a half-unit footprint once half pitch is turned off, and clears it when restored', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => result.current.setSize('width', 2.5));
    expect(result.current.errors).toEqual([]);

    act(() => result.current.setOverride('sub_pitch', 1));
    expect(result.current.errors.some(e => e.includes('sub_pitch'))).toBe(true);

    act(() => result.current.resetOverride('sub_pitch'));
    expect(result.current.errors).toEqual([]);
  });

  it('allows a whole-unit footprint with half pitch off', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => result.current.setOverride('sub_pitch', 1));
    expect(result.current.errors).toEqual([]);
  });

  it('stores an override only while it differs from the default', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => result.current.setOverride('floor_thickness', 1.2));
    expect(result.current.isOverridden('floor_thickness')).toBe(true);
    expect(result.current.spec.overrides).toEqual({ floor_thickness: 1.2 });
    act(() => result.current.setOverride('floor_thickness', 0.7));
    expect(result.current.isOverridden('floor_thickness')).toBe(false);
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
      result.current.setOverride('floor_thickness', 1.2);
      result.current.setOverride('cavity_floor_radius', 2);
    });
    act(() => result.current.resetOverride('floor_thickness'));
    expect(Object.keys(result.current.spec.overrides)).toEqual(['cavity_floor_radius']);
    act(() => result.current.resetAll());
    expect(result.current.spec.overrides).toEqual({});
  });

  it('gates dependent parameters and drops them when the enabler is turned off', () => {
    const { result } = renderHook(() => useCustomBinForm());
    expect(result.current.isEnabled('wallpattern_strength')).toBe(false);
    act(() => result.current.setOverride('wallpattern_enabled', true));
    expect(result.current.isEnabled('wallpattern_strength')).toBe(true);
    act(() => result.current.setOverride('wallpattern_strength', 3));
    expect(result.current.spec.overrides).toMatchObject({ wallpattern_strength: 3 });
    act(() => result.current.setOverride('wallpattern_enabled', false));
    expect(result.current.spec.overrides).toEqual({});
  });

  it('counts overrides per group', () => {
    const { result } = renderHook(() => useCustomBinForm());
    act(() => {
      result.current.setOverride('floor_thickness', 1.2);
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
    const initial = { width: 3, depth: 2, height: 4, overrides: { floor_thickness: 1.2 } };
    const { result } = renderHook(() => useCustomBinForm(initial));
    expect(result.current.spec).toEqual(initial);
  });
});
