import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useGridItems } from './useGridItems';
import type { LibraryItem } from '../types/gridfinity';

const fixed: LibraryItem = { id: 'bins:tray', libraryId: 'bins', name: 'Tray', widthUnits: 3, heightUnits: 2, color: '#007aff', categories: [] };

describe('exact footprint placement', () => {
  it('places rotated fixed bins and rejects collisions synchronously in the same batch', () => {
    const { result } = renderHook(() => useGridItems(4, 4, () => fixed));
    act(() => {
      expect(result.current.placeLibraryItemAt(fixed, 0, 0, 90)).not.toBeNull();
      expect(result.current.placeLibraryItemAt(fixed, 0, 0, 90)).toBeNull();
    });
    expect(result.current.placedItems).toHaveLength(1);
    expect(result.current.placedItems[0]).toMatchObject({ x: 0, y: 0, width: 4, height: 6, rotation: 90, isValid: true });
    act(() => expect(result.current.placeLibraryItemAt(fixed, 7, 0, 0)).toBeNull());
  });
  it('snapshots custom specs and rejects unsupported half-grid origins', () => {
    const custom: LibraryItem = { ...fixed, id: 'custom:test', customSpec: { width: 3, depth: 2, height: 6, overrides: { sub_pitch: 1 } }, paramHash: 'hash' };
    const { result } = renderHook(() => useGridItems(8, 8, () => undefined));
    act(() => {
      expect(result.current.placeLibraryItemAt(custom, 1, 0, 0)).toBeNull();
      expect(result.current.placeLibraryItemAt(custom, 2, 0, 90)).not.toBeNull();
    });
    expect(result.current.placedItems[0]).toMatchObject({ customSpec: custom.customSpec, paramHash: 'hash', rotation: 90, width: 4, height: 6 });
  });
});
