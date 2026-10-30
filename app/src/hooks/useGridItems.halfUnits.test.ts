import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridItems, hasCollision, isOutOfBounds } from './useGridItems';
import type { PlacedItem } from '../types/gridfinity';

// Geometry is in integer half-cells: 1 unit = 2, so 1.5 units = 3.
const item = (over: Partial<PlacedItem> & { instanceId: string }): PlacedItem => ({
  itemId: 'custom:custom-x', x: 0, y: 0, width: 2, height: 2, rotation: 0, ...over,
});

function load(items: PlacedItem[], gridX = 4, gridY = 4) {
  const hook = renderHook(() => useGridItems(gridX, gridY, () => undefined));
  act(() => hook.result.current.loadItems(items));
  return hook;
}

describe('half-cell collision', () => {
  it('treats exactly touching half-unit edges as free', () => {
    const items = [item({ instanceId: 'a', x: 0, width: 3 })];
    expect(hasCollision(items, 3, 0, 2, 2)).toBe(false);
  });

  it('detects overlap of half a cell', () => {
    const items = [item({ instanceId: 'a', x: 0, width: 3 })];
    expect(hasCollision(items, 2, 0, 2, 2)).toBe(true);
  });

  it('checks bounds against a grid measured in half-cells', () => {
    expect(isOutOfBounds(5, 0, 3, 2, 8, 8)).toBe(false);
    expect(isOutOfBounds(6, 0, 3, 2, 8, 8)).toBe(true);
  });
});

describe('useGridItems with half-unit items', () => {
  it('marks touching half-unit items valid', () => {
    const { result } = load([
      item({ instanceId: 'a', x: 0, y: 0, width: 3, height: 3 }),
      item({ instanceId: 'b', x: 3, y: 0, width: 2, height: 3 }),
    ]);
    expect(result.current.placedItems.map(i => i.isValid)).toEqual([true, true]);
  });

  it('marks half-cell overlaps invalid on both items', () => {
    const { result } = load([
      item({ instanceId: 'a', x: 0, y: 0, width: 3, height: 2 }),
      item({ instanceId: 'b', x: 2, y: 0, width: 2, height: 2 }),
    ]);
    expect(result.current.placedItems.map(i => i.isValid)).toEqual([false, false]);
  });

  it('marks a half-unit item that pokes past the grid invalid', () => {
    const { result } = load([item({ instanceId: 'a', x: 6, width: 3 })]);
    expect(result.current.placedItems[0].isValid).toBe(false);
  });

  it('swaps width and height on rotate and keeps the position', () => {
    const { result } = load([item({ instanceId: 'a', x: 1, y: 3, width: 5, height: 3 })]);
    const id = result.current.placedItems[0].instanceId;
    act(() => result.current.rotateItem(id, 'cw'));
    expect(result.current.placedItems[0]).toMatchObject({ x: 1, y: 3, width: 3, height: 5, rotation: 90 });
  });

  it('moves a half-unit item to a half-cell drop position', () => {
    const { result } = load([item({ instanceId: 'a', width: 3, height: 3 })]);
    const id = result.current.placedItems[0].instanceId;
    act(() => result.current.handleDrop({ type: 'placed', itemId: 'custom:custom-x', instanceId: id }, 5, 3));
    expect(result.current.placedItems[0]).toMatchObject({ x: 5, y: 3 });
  });

  it('searches for a duplicate spot in half-cell steps for half-unit items and whole-unit steps otherwise', () => {
    const half = load([item({ instanceId: 'a', x: 0, y: 0, width: 3, height: 3 })], 8, 8);
    act(() => half.result.current.selectAll());
    act(() => half.result.current.duplicateItem());
    expect(half.result.current.placedItems).toHaveLength(2);
    expect(half.result.current.placedItems[1]).toMatchObject({ width: 3, height: 3, isValid: true });

    const whole = load([item({ instanceId: 'a', x: 0, y: 0, width: 4, height: 4 })], 8, 8);
    act(() => whole.result.current.selectAll());
    act(() => whole.result.current.duplicateItem());
    const [, copy] = whole.result.current.placedItems;
    expect(copy.isValid).toBe(true);
    expect([copy.x % 2, copy.y % 2]).toEqual([0, 0]);
  });
});

describe('half pitch gating', () => {
  const noHalf = { width: 3, depth: 2, height: 4, overrides: { sub_pitch: 1 } };

  it('marks a custom bin without half pitch invalid on a half-unit position', () => {
    const { result } = load([item({ instanceId: 'a', x: 1, width: 6, height: 4, customSpec: noHalf })], 8, 8);
    expect(result.current.placedItems[0].isValid).toBe(false);
  });

  it('keeps a custom bin without half pitch valid on whole units', () => {
    const { result } = load([item({ instanceId: 'a', x: 2, width: 6, height: 4, customSpec: noHalf })], 8, 8);
    expect(result.current.placedItems[0].isValid).toBe(true);
  });

  it('auto-places a no-half-pitch custom bin on whole-unit boundaries', () => {
    const { result } = load([item({ instanceId: 'a', x: 0, y: 0, width: 3, height: 8 })], 4, 4);
    let id: string | null = null;
    act(() => {
      id = result.current.addCustomItem({
        id: 'custom:custom-n', libraryId: 'custom', name: 'n', widthUnits: 1, heightUnits: 1, color: '#000', categories: [],
        customSpec: { width: 1, depth: 1, height: 2, overrides: { sub_pitch: 1 } },
      });
    });
    expect(id).not.toBeNull();
    expect(result.current.placedItems[1].x % 2).toBe(0);
    expect(result.current.placedItems[1].isValid).toBe(true);
  });
});

describe('addCustomItem', () => {
  const customItem = {
    id: 'custom:custom-abc', libraryId: 'custom', name: 'Custom 2.5×1.5×3.5', widthUnits: 2.5, heightUnits: 1.5,
    color: '#3B82F6', categories: ['custom'], paramHash: 'h', customSpec: { width: 2.5, depth: 1.5, height: 3.5, overrides: {} },
  };

  it('places the bin at the first free spot in half-cells, selects it and keeps its spec and hash', () => {
    const { result } = renderHook(() => useGridItems(4, 4, () => undefined));
    let instanceId: string | null = null;
    act(() => { instanceId = result.current.addCustomItem(customItem); });
    expect(instanceId).toBe(result.current.placedItems[0].instanceId);
    expect(result.current.placedItems[0]).toMatchObject({
      itemId: 'custom:custom-abc', x: 0, y: 0, width: 5, height: 3, rotation: 0,
      paramHash: 'h', customSpec: customItem.customSpec, isValid: true,
    });
    expect(result.current.selectedItemId).toBe(result.current.placedItems[0].instanceId);
  });

  it('avoids existing items', () => {
    const { result } = load([item({ instanceId: 'a', x: 0, y: 0, width: 8, height: 8 })], 4, 4);
    let instanceId: string | null = 'unset';
    act(() => { instanceId = result.current.addCustomItem(customItem); });
    expect(instanceId).toBeNull();
    expect(result.current.placedItems).toHaveLength(1);
  });

  it('finds a half-cell gap that a whole-unit search would skip', () => {
    const { result } = load([item({ instanceId: 'a', x: 0, y: 0, width: 5, height: 8 })], 4, 4);
    let instanceId: string | null = null;
    act(() => { instanceId = result.current.addCustomItem({ ...customItem, widthUnits: 1.5, heightUnits: 1 }); });
    expect(instanceId).not.toBeNull();
    expect(result.current.placedItems[1]).toMatchObject({ x: 5, width: 3, isValid: true });
  });
});

describe('dropping a favorite custom bin', () => {
  it('places a custom item from the favorite spec at the drop position', () => {
    const { result } = renderHook(() => useGridItems(4, 4, () => undefined));
    const spec = { width: 2.5, depth: 1.5, height: 3.5, overrides: {} };
    act(() => result.current.handleDrop(
      { type: 'favorite', itemId: 'custom:custom-abc', favoriteCustomSpec: spec, favoriteParamHash: 'h' }, 3, 1,
    ));
    expect(result.current.placedItems[0]).toMatchObject({
      itemId: 'custom:custom-abc', x: 3, y: 1, width: 5, height: 3, customSpec: spec, paramHash: 'h',
    });
  });
});
