import type { GridSpacerConfig } from './gridfinity';
import type { RefImagePlacement } from '../hooks/useRefImagePlacements';
import type { PlacedItem } from './gridfinity';

export interface LoadedLayoutConfig {
  layoutId: number;
  layoutName: string;
  layoutDescription: string | null;
  widthMm: number;
  depthMm: number;
  spacerConfig: GridSpacerConfig;
  placedItems: PlacedItem[];
  refImagePlacements?: RefImagePlacement[];
  ownerUsername?: string;
  ownerEmail?: string;
}
