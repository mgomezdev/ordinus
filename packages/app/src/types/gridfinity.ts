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
  libraryId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  stlFile?: string;
  imageUrl?: string;
  perspectiveImageUrl?: string;
  perspectiveImageUrl90?: string;
  perspectiveImageUrl180?: string;
  perspectiveImageUrl270?: string;
  price?: number;
  parameters?: GeneratorParams;
  paramHash?: string;
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
  parameters?: GeneratorParams;
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

export type WallPattern = 'grid' | 'hexgrid' | 'brick' | 'voronoi' | 'voronoigrid' | 'voronoihexgrid';
export type LipStyle = 'normal' | 'reduced' | 'minimum' | 'none';
export type FingerSlide = 'none' | 'rounded' | 'chamfered';
export interface WallCutoutConfig {
  front: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

export type CustomizableField = 'wallPatternEnabled' | 'wallPattern' | 'lipStyle' | 'fingerSlide' | 'wallCutout' | 'height';

export interface CustomizableBooleanFieldDef {
  field: 'wallPatternEnabled';
  label: string;
}

export interface CustomizableSelectFieldDef {
  field: Exclude<CustomizableField, 'height' | 'wallPatternEnabled' | 'wallCutout'>;
  label: string;
  options: string[];
}

export interface CustomizableNumericFieldDef {
  field: 'height';
  label: string;
  min: number;
  max: number;
}

export interface CustomizableWallCutoutFieldDef {
  field: 'wallCutout';
  label: string;
}

export type CustomizableFieldDef =
  | CustomizableBooleanFieldDef
  | CustomizableSelectFieldDef
  | CustomizableNumericFieldDef
  | CustomizableWallCutoutFieldDef;

export interface BinCustomization {
  wallPatternEnabled: boolean;
  wallPattern: WallPattern;
  lipStyle: LipStyle;
  fingerSlide: FingerSlide;
  wallCutout: WallCutoutConfig;
  height: number;  // gridfinity units (1-20), default 4
}

export const DEFAULT_BIN_CUSTOMIZATION: BinCustomization = {
  wallPatternEnabled: false,
  wallPattern: 'grid',
  lipStyle: 'normal',
  fingerSlide: 'none',
  wallCutout: { front: false, back: false, left: false, right: false },
  height: 4,
};

export function serializeCustomization(c: BinCustomization | undefined): string {
  if (!c) return '';
  const wc = c.wallCutout;
  const wcKey =
    `${wc.front ? 'F' : '-'}${wc.back ? 'B' : '-'}${wc.left ? 'L' : '-'}${wc.right ? 'R' : '-'}`;
  return `${c.wallPatternEnabled ? c.wallPattern : 'none'}|${c.lipStyle}|${c.fingerSlide}|${wcKey}|${c.height}`;
}

export function isDefaultCustomization(c: BinCustomization | undefined): boolean {
  if (!c) return true;
  return !c.wallPatternEnabled
    && c.lipStyle === 'normal'
    && c.fingerSlide === 'none'
    && !c.wallCutout.front && !c.wallCutout.back && !c.wallCutout.left && !c.wallCutout.right
    && c.height === 4;
}

export function getBOMKey(itemId: string, customization?: BinCustomization): string {
  const customKey = isDefaultCustomization(customization) ? '' : serializeCustomization(customization);
  return `${itemId}::${customKey}`;
}

// Maps BOM group key (itemId::serializedCustomization) → extra quantity
export type BOMExtras = Record<string, number>;

export interface LibraryMeta {
  customizableFields: CustomizableFieldDef[];
  parameters: GeneratorParams;
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
  customizableFields?: CustomizableFieldDef[];
  parameters?: GeneratorParams;
  baseModel?: string;
}
