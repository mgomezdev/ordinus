import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRefImagePlacements } from './useRefImagePlacements';
import type { RefImagePlacement } from './useRefImagePlacements';
import type { Quad } from '@gridfinity/shared';

function makePlacement(overrides: Partial<RefImagePlacement> = {}): Omit<RefImagePlacement, 'id'> {
  return {
    refImageId: 1,
    name: 'test-image.png',
    imageUrl: 'ref-lib/test.png',
    x: 10,
    y: 10,
    width: 25,
    height: 25,
    opacity: 0.5,
    scale: 1,
    isLocked: false,
    rotation: 0,
    ...overrides,
  };
}

describe('useRefImagePlacements', () => {
  it('starts with empty placements', () => {
    const { result } = renderHook(() => useRefImagePlacements());
    expect(result.current.placements).toEqual([]);
  });

  it('adds a placement', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    expect(result.current.placements).toHaveLength(1);
    expect(result.current.placements[0].name).toBe('test-image.png');
    expect(result.current.placements[0].id).toBeTruthy();
  });

  it('removes a placement', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.removePlacement(id);
    });

    expect(result.current.placements).toHaveLength(0);
  });

  it('updates position', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.updatePosition(id, 50, 60);
    });

    expect(result.current.placements[0].x).toBe(50);
    expect(result.current.placements[0].y).toBe(60);
  });

  it('does not update position when locked', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement({ isLocked: true }));
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.updatePosition(id, 50, 60);
    });

    expect(result.current.placements[0].x).toBe(10);
    expect(result.current.placements[0].y).toBe(10);
  });

  it('updates scale', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.updateScale(id, 1.5);
    });

    expect(result.current.placements[0].scale).toBe(1.5);
  });

  it('updates opacity', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.updateOpacity(id, 0.8);
    });

    expect(result.current.placements[0].opacity).toBe(0.8);
  });

  it('rotates clockwise', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.updateRotation(id, 'cw');
    });

    expect(result.current.placements[0].rotation).toBe(90);
  });

  it('rotates counter-clockwise', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.updateRotation(id, 'ccw');
    });

    expect(result.current.placements[0].rotation).toBe(270);
  });

  it('toggles lock', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    const id = result.current.placements[0].id;

    act(() => {
      result.current.toggleLock(id);
    });

    expect(result.current.placements[0].isLocked).toBe(true);

    act(() => {
      result.current.toggleLock(id);
    });

    expect(result.current.placements[0].isLocked).toBe(false);
  });

  it('rebinds a broken image', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement({ refImageId: null, imageUrl: null }));
    });

    const id = result.current.placements[0].id;
    expect(result.current.placements[0].refImageId).toBe(null);
    expect(result.current.placements[0].imageUrl).toBe(null);

    act(() => {
      result.current.rebindImage(id, 5, 'ref-lib/new.png', 'new-image.png');
    });

    expect(result.current.placements[0].refImageId).toBe(5);
    expect(result.current.placements[0].imageUrl).toBe('ref-lib/new.png');
    expect(result.current.placements[0].name).toBe('new-image.png');
  });

  it('loads placements (bulk replace)', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
    });

    expect(result.current.placements).toHaveLength(1);

    act(() => {
      result.current.loadPlacements([
        { id: 'loaded-1', refImageId: 2, name: 'a.png', imageUrl: 'ref-lib/a.png', x: 5, y: 5, width: 30, height: 30, opacity: 0.7, scale: 1, isLocked: false, rotation: 0 },
        { id: 'loaded-2', refImageId: null, name: 'b.png', imageUrl: null, x: 20, y: 20, width: 40, height: 40, opacity: 0.3, scale: 2, isLocked: true, rotation: 180 },
      ]);
    });

    expect(result.current.placements).toHaveLength(2);
    expect(result.current.placements[0].id).toBe('loaded-1');
    expect(result.current.placements[1].refImageId).toBe(null);
  });

  it('clears all placements', () => {
    const { result } = renderHook(() => useRefImagePlacements());

    act(() => {
      result.current.addPlacement(makePlacement());
      result.current.addPlacement(makePlacement({ name: 'second.png' }));
    });

    expect(result.current.placements).toHaveLength(2);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.placements).toHaveLength(0);
  });

  describe('corner alignment', () => {
    const TRAPEZOID: Quad = [
      { x: 0.3, y: 0.2 },
      { x: 0.7, y: 0.2 },
      { x: 0.9, y: 0.8 },
      { x: 0.1, y: 0.8 },
    ];
    const ALIGNMENT = {
      corners: TRAPEZOID,
      warpedImageUrl: 'ref-warp/abc.webp',
      x: -50, y: -50, width: 200, height: 164,
    };

    it('applies an alignment: stores corners + warped image, fits geometry and locks', () => {
      const { result } = renderHook(() => useRefImagePlacements());
      act(() => {
        result.current.addPlacement(makePlacement({ scale: 2, rotation: 90 }));
      });
      const id = result.current.placements[0].id;

      act(() => {
        result.current.applyAlignment(id, ALIGNMENT);
      });

      const p = result.current.placements[0];
      expect(p.corners).toEqual(TRAPEZOID);
      expect(p.warpedImageUrl).toBe('ref-warp/abc.webp');
      expect(p.imageUrl).toBe('ref-lib/test.png'); // original kept
      expect([p.x, p.y, p.width, p.height]).toEqual([-50, -50, 200, 164]);
      expect(p.scale).toBe(1);
      expect(p.rotation).toBe(0);
      expect(p.isLocked).toBe(true);
    });

    it('clears an alignment back to an unwarped full-grid placement', () => {
      const { result } = renderHook(() => useRefImagePlacements());
      act(() => {
        result.current.addPlacement(makePlacement());
      });
      const id = result.current.placements[0].id;
      act(() => {
        result.current.applyAlignment(id, ALIGNMENT);
      });
      act(() => {
        result.current.clearAlignment(id);
      });

      const p = result.current.placements[0];
      expect(p.corners).toBeNull();
      expect(p.warpedImageUrl).toBeNull();
      expect([p.x, p.y, p.width, p.height]).toEqual([0, 0, 100, 100]);
      expect(p.isLocked).toBe(false);
    });

    it('drops the alignment when the image is rebound', () => {
      const { result } = renderHook(() => useRefImagePlacements());
      act(() => {
        result.current.addPlacement(makePlacement());
      });
      const id = result.current.placements[0].id;
      act(() => {
        result.current.applyAlignment(id, ALIGNMENT);
      });
      act(() => {
        result.current.rebindImage(id, 9, 'ref-lib/other.png', 'other.png');
      });

      expect(result.current.placements[0].corners).toBeNull();
      expect(result.current.placements[0].warpedImageUrl).toBeNull();
    });
  });
});
