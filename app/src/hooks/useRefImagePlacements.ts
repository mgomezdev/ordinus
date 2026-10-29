import { useState, useCallback } from 'react';
import type { Quad } from '@gridfinity/shared';
import type { Rotation } from '../types/gridfinity';
import { ROTATION_CW, ROTATION_CCW } from '../utils/constants';

export interface RefImagePlacement {
  id: string;
  refImageId: number | null;
  name: string;
  imageUrl: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  scale: number;
  isLocked: boolean;
  rotation: Rotation;
  /** Grid corners marked on the original image (normalised 0–1); null/absent when unaligned. */
  corners?: Quad | null;
  /** Perspective-corrected image path shown instead of the original while aligned. */
  warpedImageUrl?: string | null;
}

/** Result of warping a placement's image to its marked grid corners. */
export interface RefImageAlignment {
  corners: Quad;
  warpedImageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const FULL_GRID_PERCENT = 100;


function generatePlacementId(): string {
  return `ref-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()}`;
}

export interface UseRefImagePlacementsReturn {
  placements: RefImagePlacement[];
  addPlacement: (data: Omit<RefImagePlacement, 'id'>) => void;
  removePlacement: (id: string) => void;
  updatePosition: (id: string, x: number, y: number) => void;
  updateScale: (id: string, scale: number) => void;
  updateOpacity: (id: string, opacity: number) => void;
  updateRotation: (id: string, direction: 'cw' | 'ccw') => void;
  toggleLock: (id: string) => void;
  rebindImage: (placementId: string, newRefImageId: number, newImageUrl: string, newName: string) => void;
  applyAlignment: (id: string, alignment: RefImageAlignment) => void;
  clearAlignment: (id: string) => void;
  loadPlacements: (placements: RefImagePlacement[]) => void;
  clearAll: () => void;
}

export function useRefImagePlacements(): UseRefImagePlacementsReturn {
  const [placements, setPlacements] = useState<RefImagePlacement[]>([]);

  const addPlacement = useCallback((data: Omit<RefImagePlacement, 'id'>) => {
    setPlacements(prev => [...prev, { ...data, id: generatePlacementId() }]);
  }, []);

  const removePlacement = useCallback((id: string) => {
    setPlacements(prev => prev.filter(p => p.id !== id));
  }, []);

  const updatePosition = useCallback((id: string, x: number, y: number) => {
    setPlacements(prev => prev.map(p => {
      if (p.id !== id || p.isLocked) return p;
      return { ...p, x, y };
    }));
  }, []);

  const updateScale = useCallback((id: string, scale: number) => {
    setPlacements(prev => prev.map(p =>
      p.id === id ? { ...p, scale } : p
    ));
  }, []);

  const updateOpacity = useCallback((id: string, opacity: number) => {
    setPlacements(prev => prev.map(p =>
      p.id === id ? { ...p, opacity } : p
    ));
  }, []);

  const updateRotation = useCallback((id: string, direction: 'cw' | 'ccw') => {
    setPlacements(prev => prev.map(p => {
      if (p.id !== id) return p;
      const newRotation = direction === 'cw'
        ? ROTATION_CW[p.rotation]
        : ROTATION_CCW[p.rotation];
      return { ...p, rotation: newRotation };
    }));
  }, []);

  const toggleLock = useCallback((id: string) => {
    setPlacements(prev => prev.map(p =>
      p.id === id ? { ...p, isLocked: !p.isLocked } : p
    ));
  }, []);

  const rebindImage = useCallback((placementId: string, newRefImageId: number, newImageUrl: string, newName: string) => {
    setPlacements(prev => prev.map(p =>
      p.id === placementId
        ? { ...p, refImageId: newRefImageId, imageUrl: newImageUrl, name: newName, corners: null, warpedImageUrl: null }
        : p
    ));
  }, []);

  const applyAlignment = useCallback((id: string, alignment: RefImageAlignment) => {
    setPlacements(prev => prev.map(p =>
      p.id === id
        ? { ...p, ...alignment, scale: 1, rotation: 0, isLocked: true }
        : p
    ));
  }, []);

  const clearAlignment = useCallback((id: string) => {
    setPlacements(prev => prev.map(p =>
      p.id === id
        ? {
          ...p,
          corners: null,
          warpedImageUrl: null,
          x: 0,
          y: 0,
          width: FULL_GRID_PERCENT,
          height: FULL_GRID_PERCENT,
          isLocked: false,
        }
        : p
    ));
  }, []);

  const loadPlacements = useCallback((newPlacements: RefImagePlacement[]) => {
    setPlacements(newPlacements);
  }, []);

  const clearAll = useCallback(() => {
    setPlacements([]);
  }, []);

  return {
    placements,
    addPlacement,
    removePlacement,
    updatePosition,
    updateScale,
    updateOpacity,
    updateRotation,
    toggleLock,
    rebindImage,
    applyAlignment,
    clearAlignment,
    loadPlacements,
    clearAll,
  };
}
