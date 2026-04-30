import { useCallback } from 'react';
import type { PlacedItem, GridSpacerConfig, Rotation, SpacerMode, UnitSystem } from '../types/gridfinity';
import type { RefImagePlacement } from './useRefImagePlacements';
import type { LoadedLayoutConfig } from '../types/layoutConfig';
import type { LayoutMetaAction } from '../reducers/layoutMetaReducer';
import { mmToInches } from '../utils/conversions';
import { fetchLayout } from '../api/layouts.api';

interface UseLayoutLoaderParams {
  unitSystem: UnitSystem;
  setWidth: (w: number) => void;
  setDepth: (d: number) => void;
  setSpacerConfig: (c: GridSpacerConfig) => void;
  loadItems: (items: PlacedItem[]) => void;
  loadRefImagePlacements: (placements: RefImagePlacement[]) => void;
  layoutDispatch: React.Dispatch<LayoutMetaAction>;
  getAccessToken: () => string | null;
  clearExtras?: () => void;
}

export function useLayoutLoader({
  unitSystem, setWidth, setDepth, setSpacerConfig,
  loadItems, loadRefImagePlacements, layoutDispatch, getAccessToken,
  clearExtras,
}: UseLayoutLoaderParams) {
  const handleLoadLayout = useCallback((config: LoadedLayoutConfig) => {
    if (unitSystem === 'imperial') {
      setWidth(parseFloat(mmToInches(config.widthMm).toFixed(4)));
      setDepth(parseFloat(mmToInches(config.depthMm).toFixed(4)));
    } else {
      setWidth(config.widthMm);
      setDepth(config.depthMm);
    }
    setSpacerConfig(config.spacerConfig);
    loadItems(config.placedItems);
    loadRefImagePlacements(config.refImagePlacements ?? []);

    let owner = '';
    if (config.ownerUsername) {
      owner = config.ownerUsername;
      if (config.ownerEmail) owner += ` <${config.ownerEmail}>`;
    }

    clearExtras?.();

    layoutDispatch({
      type: 'LOAD_LAYOUT',
      payload: {
        id: config.layoutId,
        name: config.layoutName,
        description: config.layoutDescription ?? '',
        owner,
      },
    });
  }, [unitSystem, setWidth, setDepth, setSpacerConfig, loadItems, loadRefImagePlacements, layoutDispatch, clearExtras]);

  const loadLayout = useCallback(async (id: number) => {
    const token = getAccessToken();
    if (!token) throw new Error('Not authenticated');
    try {
      const detail = await fetchLayout(token, id);
      const loadPrefix = Date.now();

      const loadedPlacedItems: PlacedItem[] = detail.placedItems.map((item, index) => ({
        instanceId: `loaded-${loadPrefix}-${index}`,
        itemId: `${item.libraryId}:${item.itemId}`,
        x: item.x, y: item.y, width: item.width, height: item.height,
        rotation: item.rotation as Rotation,
        ...(item.customization ? { customization: item.customization } : {}),
      }));

      const loadedRefImagePlacements: RefImagePlacement[] = (detail.refImagePlacements ?? []).map((p, index) => ({
        id: `loaded-ref-${loadPrefix}-${index}`,
        refImageId: p.refImageId, name: p.name, imageUrl: p.imageUrl,
        x: p.x, y: p.y, width: p.width, height: p.height,
        opacity: p.opacity, scale: p.scale, isLocked: p.isLocked,
        rotation: p.rotation as Rotation,
      }));

      handleLoadLayout({
        layoutId: detail.id, layoutName: detail.name,
        layoutDescription: detail.description,
        widthMm: detail.widthMm, depthMm: detail.depthMm,
        spacerConfig: {
          horizontal: detail.spacerHorizontal as SpacerMode,
          vertical: detail.spacerVertical as SpacerMode,
        },
        placedItems: loadedPlacedItems,
        refImagePlacements: loadedRefImagePlacements,
      });
    } catch (err) {
      console.error('Failed to load layout:', err);
      throw err;
    }
  }, [getAccessToken, handleLoadLayout]);

  return { handleLoadLayout, loadLayout };
}
