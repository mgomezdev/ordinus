import { describe, it, expect } from 'vitest';
import { buildPayload } from './layoutHelpers';
import type { PlacedItemWithValidity } from '../types/gridfinity';
import type { RefImagePlacement } from '../hooks/useRefImagePlacements';

const BASE_SPACER = { horizontal: 'none' as const, vertical: 'none' as const };

const makeItem = (overrides: Partial<PlacedItemWithValidity> = {}): PlacedItemWithValidity => ({
  instanceId: 'inst-1',
  itemId: 'item-abc',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation: 0,
  isValid: true,
  ...overrides,
});

const makeRefImage = (overrides: Partial<RefImagePlacement> = {}): RefImagePlacement => ({
  id: 'ri-1',
  refImageId: 'img-1',
  name: 'photo.png',
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  opacity: 1,
  scale: 1,
  isLocked: false,
  rotation: 0,
  ...overrides,
});

describe('buildPayload', () => {
  it('maps basic fields correctly', () => {
    const result = buildPayload('My Layout', 'A description', 4, 4, 168, 168, BASE_SPACER, [], []);
    expect(result.name).toBe('My Layout');
    expect(result.description).toBe('A description');
    expect(result.gridX).toBe(4);
    expect(result.gridY).toBe(4);
    expect(result.widthMm).toBe(168);
    expect(result.depthMm).toBe(168);
  });

  it('trims name and description', () => {
    const result = buildPayload('  My Layout  ', '  desc  ', 4, 4, 168, 168, BASE_SPACER, [], []);
    expect(result.name).toBe('My Layout');
    expect(result.description).toBe('desc');
  });

  it('returns undefined description when description is blank', () => {
    const result = buildPayload('Name', '   ', 4, 4, 168, 168, BASE_SPACER, [], []);
    expect(result.description).toBeUndefined();
  });

  it('maps spacer config', () => {
    const spacer = { horizontal: 'small' as const, vertical: 'large' as const };
    const result = buildPayload('Name', '', 4, 4, 168, 168, spacer, [], []);
    expect(result.spacerHorizontal).toBe('small');
    expect(result.spacerVertical).toBe('large');
  });

  it('maps placed items without customization', () => {
    const item = makeItem({ itemId: 'abc', x: 1, y: 2, width: 2, height: 1, rotation: 90 });
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [item], []);
    expect(result.placedItems).toHaveLength(1);
    const mapped = result.placedItems[0];
    expect(mapped.itemId).toBe('abc');
    expect(mapped.x).toBe(1);
    expect(mapped.y).toBe(2);
    expect(mapped.width).toBe(2);
    expect(mapped.height).toBe(1);
    expect(mapped.rotation).toBe(90);
    expect('customization' in mapped).toBe(false);
  });

  it('includes customization when present', () => {
    const item = makeItem({ customization: { filledIn: true } });
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [item], []);
    expect(result.placedItems[0].customization).toEqual({ filledIn: true });
  });

  it('omits customization key when undefined', () => {
    const item = makeItem({ customization: undefined });
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [item], []);
    expect('customization' in result.placedItems[0]).toBe(false);
  });

  it('maps valid ref image placements', () => {
    const ri = makeRefImage({ refImageId: 'img-1', x: 5, y: 10, opacity: 0.8, rotation: 45 });
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [], [ri]);
    expect(result.refImagePlacements).toHaveLength(1);
    const mapped = result.refImagePlacements![0];
    expect(mapped.refImageId).toBe('img-1');
    expect(mapped.x).toBe(5);
    expect(mapped.y).toBe(10);
    expect(mapped.opacity).toBe(0.8);
    expect(mapped.rotation).toBe(45);
  });

  it('filters out ref images where refImageId is null', () => {
    const valid = makeRefImage({ refImageId: 'img-1' });
    const unbound = makeRefImage({ id: 'ri-2', refImageId: null });
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [], [valid, unbound]);
    expect(result.refImagePlacements).toHaveLength(1);
    expect(result.refImagePlacements![0].refImageId).toBe('img-1');
  });

  it('omits refImagePlacements key when all are filtered out', () => {
    const unbound = makeRefImage({ refImageId: null });
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [], [unbound]);
    expect('refImagePlacements' in result).toBe(false);
  });

  it('omits refImagePlacements key when array is empty', () => {
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [], []);
    expect('refImagePlacements' in result).toBe(false);
  });
});
