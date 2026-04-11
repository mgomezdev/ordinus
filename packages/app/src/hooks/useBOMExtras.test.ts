import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBOMExtras } from './useBOMExtras';
import { STORAGE_KEYS } from '../utils/storageKeys';

beforeEach(() => {
  localStorage.clear();
});

describe('useBOMExtras', () => {
  it('initializes with empty extras when localStorage is empty', () => {
    const { result } = renderHook(() => useBOMExtras());
    expect(result.current.extras).toEqual({});
  });

  it('loads persisted extras from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEYS.BOM_EXTRAS, JSON.stringify({ 'bin-1x1::': 2 }));
    const { result } = renderHook(() => useBOMExtras());
    expect(result.current.extras).toEqual({ 'bin-1x1::': 2 });
  });

  it('addExtra adds key with qty 1', () => {
    const { result } = renderHook(() => useBOMExtras());
    act(() => { result.current.addExtra('bin-1x1::'); });
    expect(result.current.extras['bin-1x1::']).toBe(1);
  });

  it('addExtra is a no-op if key already exists', () => {
    const { result } = renderHook(() => useBOMExtras());
    act(() => { result.current.addExtra('bin-1x1::'); });
    act(() => { result.current.addExtra('bin-1x1::'); });
    expect(result.current.extras['bin-1x1::']).toBe(1);
  });

  it('setExtraQty updates the quantity for an existing key', () => {
    const { result } = renderHook(() => useBOMExtras());
    act(() => { result.current.addExtra('bin-1x1::'); });
    act(() => { result.current.setExtraQty('bin-1x1::', 5); });
    expect(result.current.extras['bin-1x1::']).toBe(5);
  });

  it('removeExtra deletes the key', () => {
    const { result } = renderHook(() => useBOMExtras());
    act(() => { result.current.addExtra('bin-1x1::'); });
    act(() => { result.current.removeExtra('bin-1x1::'); });
    expect('bin-1x1::' in result.current.extras).toBe(false);
  });

  it('clearExtras resets to empty and removes from localStorage', () => {
    const { result } = renderHook(() => useBOMExtras());
    act(() => { result.current.addExtra('bin-1x1::'); });
    act(() => { result.current.clearExtras(); });
    expect(result.current.extras).toEqual({});
    expect(localStorage.getItem(STORAGE_KEYS.BOM_EXTRAS)).toBeNull();
  });

  it('persists extras to localStorage on each change', () => {
    const { result } = renderHook(() => useBOMExtras());
    act(() => { result.current.addExtra('bin-2x2::'); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.BOM_EXTRAS) ?? '{}');
    expect(stored['bin-2x2::']).toBe(1);
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEYS.BOM_EXTRAS, 'not-json');
    const { result } = renderHook(() => useBOMExtras());
    expect(result.current.extras).toEqual({});
  });
});
