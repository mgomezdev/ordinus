import type { PlacedItemWithValidity, GridSpacerConfig } from '../types/gridfinity';
import type { RefImagePlacement } from '../hooks/useRefImagePlacements';

export function buildPayload(
  name: string,
  description: string,
  gridX: number,
  gridY: number,
  widthMm: number,
  depthMm: number,
  spacerConfig: GridSpacerConfig,
  placedItems: PlacedItemWithValidity[],
  refImagePlacements: RefImagePlacement[],
) {
  const validPlacements = refImagePlacements
    .filter(p => p.refImageId !== null)
    .map(p => ({
      refImageId: p.refImageId!,
      name: p.name,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      opacity: p.opacity,
      scale: p.scale,
      isLocked: p.isLocked,
      rotation: p.rotation,
    }));

  return {
    name: name.trim(),
    description: description.trim() || undefined,
    gridX,
    gridY,
    widthMm,
    depthMm,
    spacerHorizontal: spacerConfig.horizontal,
    spacerVertical: spacerConfig.vertical,
    placedItems: placedItems.map(item => ({
      itemId: item.itemId,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      ...(item.customization ? { customization: item.customization } : {}),
    })),
    ...(validPlacements.length > 0 ? { refImagePlacements: validPlacements } : {}),
  };
}
