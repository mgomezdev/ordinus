export type UnitSystem = 'metric' | 'imperial';
export type ImperialFormat = 'decimal' | 'fractional';

export interface Dimensions {
  width: number;
  depth: number;
  unit: UnitSystem;
}

export type Rotation = 0 | 90 | 180 | 270;

export type SpacerMode = 'none' | 'one-sided' | 'symmetrical';

export interface GridSpacerConfig {
  horizontal: SpacerMode;
  vertical: SpacerMode;
}

export interface ComputedSpacer {
  id: string;
  position: 'left' | 'right' | 'top' | 'bottom';
  size: number;
  renderX: number;
  renderY: number;
  renderWidth: number;
  renderHeight: number;
}

export interface GridResult {
  gridX: number;
  gridY: number;
  actualWidth: number;
  actualDepth: number;
  gapWidth: number;
  gapDepth: number;
  spacers?: ComputedSpacer[];
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  order?: number;
}

export type GeneratorParams = Record<string, unknown>;

export interface LibraryItem {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  stlFile?: string;
  imageUrl?: string;
  perspectiveImageUrl?: string;
  price?: number;
  defaultParameters?: GeneratorParams;
}

export interface PlacedItem {
  instanceId: string;
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: Rotation;
  customization?: BinCustomization;
  shadowBoxId?: string | null;
  defaultParameters?: GeneratorParams;
}

export interface PlacedItemWithValidity extends PlacedItem {
  isValid: boolean;
}

export interface DragData {
  type: 'library' | 'placed' | 'ref-image';
  itemId: string;
  instanceId?: string;
  refImageId?: number;
  refImageUrl?: string;
  refImageName?: string;
}

export interface BOMItem {
  itemId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  quantity: number;
  customization?: BinCustomization;
  shadowboxId?: string;
  price?: number;
  defaultParameters?: GeneratorParams;
}

export interface ReferenceImage {
  id: string;
  name: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  scale: number;
  isLocked: boolean;
  rotation: Rotation;
}

export type WallPattern = 'none' | 'grid' | 'hexgrid' | 'voronoi' | 'voronoigrid' | 'voronoihexgrid';
export type LipStyle = 'normal' | 'reduced' | 'minimum' | 'none';
export type FingerSlide = 'none' | 'rounded' | 'chamfered';
export type WallCutout = 'none' | 'vertical' | 'horizontal' | 'both';

export type CustomizableField = 'wallPattern' | 'lipStyle' | 'fingerSlide' | 'wallCutout' | 'height';

export interface BinCustomization {
  wallPattern: WallPattern;
  lipStyle: LipStyle;
  fingerSlide: FingerSlide;
  wallCutout: WallCutout;
  height: number;  // gridfinity units (1-20), default 8
}

export const DEFAULT_BIN_CUSTOMIZATION: BinCustomization = {
  wallPattern: 'none',
  lipStyle: 'normal',
  fingerSlide: 'none',
  wallCutout: 'none',
  height: 8,
};

export function serializeCustomization(c: BinCustomization | undefined): string {
  if (!c) return '';
  return `${c.wallPattern}|${c.lipStyle}|${c.fingerSlide}|${c.wallCutout}|${c.height}`;
}

export function isDefaultCustomization(c: BinCustomization | undefined): boolean {
  if (!c) return true;
  return c.wallPattern === 'none'
    && c.lipStyle === 'normal'
    && c.fingerSlide === 'none'
    && c.wallCutout === 'none'
    && c.height === 8;
}

export function getBOMKey(itemId: string, customization?: BinCustomization): string {
  const customKey = isDefaultCustomization(customization) ? '' : serializeCustomization(customization);
  return `${itemId}::${customKey}`;
}

// Maps BOM group key (itemId::serializedCustomization) → extra quantity
export type BOMExtras = Record<string, number>;

export interface LibraryMeta {
  customizableFields: CustomizableField[];
  defaultParameters: GeneratorParams;
}

export type ImageViewMode = 'ortho' | 'perspective';

export type InteractionMode = 'items' | 'images';

// Multi-library system types
export interface Library {
  id: string;
  name: string;
  path: string;
  isEnabled: boolean;
  itemCount?: number;
}

export interface LibraryManifest {
  version: string;
  libraries: {
    id: string;
    name: string;
    path: string;
  }[];
}

export interface LibraryIndex {
  version: string;
  items: LibraryItem[];
  customizableFields?: CustomizableField[];
  defaultParameters?: GeneratorParams;
}
