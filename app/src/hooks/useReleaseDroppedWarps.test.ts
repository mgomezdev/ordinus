import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Quad } from '@gridfinity/shared';
import { useReleaseDroppedWarps } from './useReleaseDroppedWarps';
import type { RefImagePlacement } from './useRefImagePlacements';

const CORNERS: Quad = [
  { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 },
];

function placement(id: string, warpedImageUrl: string | null): RefImagePlacement {
  return {
    id, refImageId: 1, name: 'p.png', imageUrl: 'ref-lib/p.png',
    x: 0, y: 0, width: 100, height: 100, opacity: 0.5, scale: 1, isLocked: true, rotation: 0,
    corners: warpedImageUrl ? CORNERS : null,
    warpedImageUrl,
  };
}

function setup(initial: RefImagePlacement[]) {
  const release = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(
    ({ placements }) => useReleaseDroppedWarps(placements, release),
    { initialProps: { placements: initial } },
  );
  return { release, rerender: (placements: RefImagePlacement[]) => hook.rerender({ placements }) };
}

describe('useReleaseDroppedWarps', () => {
  it('does nothing while warps stay in use', () => {
    const { release, rerender } = setup([placement('a', 'ref-warp/1.webp')]);
    rerender([{ ...placement('a', 'ref-warp/1.webp'), opacity: 0.9 }]);
    expect(release).not.toHaveBeenCalled();
  });

  it('releases the previous warp when an image is re-aligned', () => {
    const { release, rerender } = setup([placement('a', 'ref-warp/1.webp')]);
    rerender([placement('a', 'ref-warp/2.webp')]);
    expect(release).toHaveBeenCalledExactlyOnceWith('ref-warp/1.webp');
  });

  it('releases the warp when an image is unaligned', () => {
    const { release, rerender } = setup([placement('a', 'ref-warp/1.webp')]);
    rerender([placement('a', null)]);
    expect(release).toHaveBeenCalledExactlyOnceWith('ref-warp/1.webp');
  });

  it('releases warps of removed images (remove, clear all, load another layout)', () => {
    const { release, rerender } = setup([
      placement('a', 'ref-warp/1.webp'),
      placement('b', 'ref-warp/2.webp'),
      placement('c', null),
    ]);
    rerender([]);
    expect(release).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledWith('ref-warp/1.webp');
    expect(release).toHaveBeenCalledWith('ref-warp/2.webp');
  });

  it('ignores a stale warp path left without corners', () => {
    const stale = { ...placement('a', null), warpedImageUrl: 'ref-warp/1.webp' };
    const { release, rerender } = setup([stale]);
    rerender([]);
    expect(release).not.toHaveBeenCalled();
  });

  it('swallows release failures', async () => {
    const release = vi.fn().mockRejectedValue(new Error('offline'));
    const hook = renderHook(
      ({ placements }) => useReleaseDroppedWarps(placements, release),
      { initialProps: { placements: [placement('a', 'ref-warp/1.webp')] } },
    );
    expect(() => hook.rerender({ placements: [] })).not.toThrow();
    await Promise.resolve();
    expect(release).toHaveBeenCalledOnce();
  });
});
