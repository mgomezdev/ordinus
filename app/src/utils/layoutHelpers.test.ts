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

  it('tags the payload with the half-cell grid resolution', () => {
    const result = buildPayload('L', '', 4, 4, 168, 168, BASE_SPACER, [makeItem({ width: 5, height: 3 })], []);
    expect(result.gridResolution).toBe(2);
    expect(result.placedItems[0]).toMatchObject({ width: 5, height: 3 });
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

  it('includes corner alignment (corners + warped image) when present', () => {
    const corners = [
      { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.88, y: 0.9 }, { x: 0.12, y: 0.88 },
    ] as RefImagePlacement['corners'];
    const ri = makeRefImage({ corners, warpedImageUrl: 'ref-warp/x.webp', x: -12, width: 124 });
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [], [ri]);
    const mapped = result.refImagePlacements![0];
    expect(mapped.corners).toEqual(corners);
    expect(mapped.warpedImageUrl).toBe('ref-warp/x.webp');
    expect(mapped.x).toBe(-12);
  });

  it('sends null alignment for unaligned images', () => {
    const result = buildPayload('Name', '', 4, 4, 168, 168, BASE_SPACER, [], [makeRefImage()]);
    expect(result.refImagePlacements![0].corners).toBeNull();
    expect(result.refImagePlacements![0].warpedImageUrl).toBeNull();
  });
});

describe('buildPayload — custom bins', () => {
  const customSpec = { width: 2.5, depth: 1.5, height: 3.5, overrides: { floor_thickness: 1.2 } };

  it('sends half-unit geometry and the custom spec', () => {
    const item = makeItem({ itemId: 'custom:custom-abc', x: 0.5, y: 1.5, width: 2.5, height: 1.5, customSpec });
    const mapped = buildPayload('L', '', 6, 6, 252, 252, BASE_SPACER, [item], []).placedItems[0];
    expect(mapped).toMatchObject({ itemId: 'custom:custom-abc', x: 0.5, y: 1.5, width: 2.5, height: 1.5, customSpec });
  });

  it('omits customSpec for library items', () => {
    const mapped = buildPayload('L', '', 4, 4, 168, 168, BASE_SPACER, [makeItem()], []).placedItems[0];
    expect('customSpec' in mapped).toBe(false);
  });
});
