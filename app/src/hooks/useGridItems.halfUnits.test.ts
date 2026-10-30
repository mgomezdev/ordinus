import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGridItems, hasCollision, isOutOfBounds } from './useGridItems';
import type { PlacedItem } from '../types/gridfinity';

const item = (over: Partial<PlacedItem> & { instanceId: string }): PlacedItem => ({
  itemId: 'custom:custom-x', x: 0, y: 0, width: 1, height: 1, rotation: 0, ...over,
});

function load(items: PlacedItem[], gridX = 4, gridY = 4) {
  const hook = renderHook(() => useGridItems(gridX, gridY, () => undefined));
  act(() => hook.result.current.loadItems(items));
  return hook;
}

describe('half-unit collision', () => {
  it('treats exactly touching half-unit edges as free', () => {
    const items = [item({ instanceId: 'a', x: 0, width: 1.5 })];
    expect(hasCollision(items, 1.5, 0, 1, 1)).toBe(false);
  });

  it('detects overlap of half a cell', () => {
    const items = [item({ instanceId: 'a', x: 0, width: 1.5 })];
    expect(hasCollision(items, 1, 0, 1, 1)).toBe(true);
  });

  it('checks bounds with fractional extents', () => {
    expect(isOutOfBounds(2.5, 0, 1.5, 1, 4, 4)).toBe(false);
    expect(isOutOfBounds(3, 0, 1.5, 1, 4, 4)).toBe(true);
  });
});

describe('useGridItems with half-unit items', () => {
  it('marks touching half-unit items valid', () => {
    const { result } = load([
      item({ instanceId: 'a', x: 0, y: 0, width: 1.5, height: 1.5 }),
      item({ instanceId: 'b', x: 1.5, y: 0, width: 1, height: 1.5 }),
    ]);
    expect(result.current.placedItems.map(i => i.isValid)).toEqual([true, true]);
  });

  it('marks half-cell overlaps invalid on both items', () => {
    const { result } = load([
      item({ instanceId: 'a', x: 0, y: 0, width: 1.5, height: 1 }),
      item({ instanceId: 'b', x: 1, y: 0, width: 1, height: 1 }),
    ]);
    expect(result.current.placedItems.map(i => i.isValid)).toEqual([false, false]);
  });

  it('marks a half-unit item that pokes past the grid invalid', () => {
    const { result } = load([item({ instanceId: 'a', x: 3, width: 1.5 })]);
    expect(result.current.placedItems[0].isValid).toBe(false);
  });

  it('swaps fractional width and height on rotate and keeps the position', () => {
    const { result } = load([item({ instanceId: 'a', x: 0.5, y: 1.5, width: 2.5, height: 1.5 })]);
    const id = result.current.placedItems[0].instanceId;
    act(() => result.current.rotateItem(id, 'cw'));
    expect(result.current.placedItems[0]).toMatchObject({ x: 0.5, y: 1.5, width: 1.5, height: 2.5, rotation: 90 });
  });

  it('moves a half-unit item to a half-cell drop position', () => {
    const { result } = load([item({ instanceId: 'a', width: 1.5, height: 1.5 })]);
    const id = result.current.placedItems[0].instanceId;
    act(() => result.current.handleDrop({ type: 'placed', itemId: 'custom:custom-x', instanceId: id }, 2.5, 1.5));
    expect(result.current.placedItems[0]).toMatchObject({ x: 2.5, y: 1.5 });
  });
});
