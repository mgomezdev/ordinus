// ============================================================
// Core Gridfinity types (migrated from src/types/gridfinity.ts)
// ============================================================

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

export interface LibraryItem {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  imageUrl?: string;
  perspectiveImageUrl?: string;
}

export type WallPattern = 'none' | 'grid' | 'hexgrid' | 'voronoi' | 'voronoigrid' | 'voronoihexgrid';
export type LipStyle = 'normal' | 'reduced' | 'minimum' | 'none';
export type FingerSlide = 'none' | 'rounded' | 'chamfered';
export type WallCutout = 'none' | 'vertical' | 'horizontal' | 'both';

export type GeneratorParams = Record<string, unknown>;

import gridfinityExtendedDefaultParamsJson from './gridfinity-extended-default-params.json' with { type: 'json' };
export const gridfinityExtendedDefaultParams: GeneratorParams = gridfinityExtendedDefaultParamsJson;

export interface BinCustomization {
  wallPattern: WallPattern;
  lipStyle: LipStyle;
  fingerSlide: FingerSlide;
  wallCutout: WallCutout;
  height: number;
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
  libraryId: string;
  itemId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  quantity: number;
  customization?: BinCustomization;
  gridfinityExtendedParams?: GeneratorParams;
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
}

// ============================================================
// API types (new for backend)
// ============================================================

export interface ApiResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  nextCursor?: string;
  hasMore?: boolean;
}

export interface ApiLibrary {
  id: string;
  name: string;
  description: string | null;
  version: string;
  isActive: boolean;
  sortOrder: number;
  itemCount?: number;
}

export interface ApiLibraryItem {
  id: string;
  libraryId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  imagePath: string | null;
  perspectiveImagePath: string | null;
  isActive: boolean;
  sortOrder: number;
  categories: string[];
  stlFile: string | null;
}

export interface ApiCategory {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime: number;
}

export interface ReadyResponse {
  status: 'ok';
  db: 'connected';
}

export type UserRole = 'user' | 'admin';

// ============================================================
// Layout API types
// ============================================================

export interface ApiLayout {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  gridX: number;
  gridY: number;
  widthMm: number;
  depthMm: number;
  spacerHorizontal: string;
  spacerVertical: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  ownerUsername?: string;
  ownerEmail?: string;
}

export interface ApiPlacedItem {
  id: number;
  layoutId: number;
  libraryId: string;
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  sortOrder: number;
  customization?: BinCustomization;
}

export interface ApiReferenceImage {
  id: number;
  layoutId: number;
  name: string;
  filePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  scale: number;
  isLocked: boolean;
  rotation: number;
  createdAt: string;
}

export interface ApiRefImage {
  id: number;
  ownerId: number | null;
  name: string;
  isGlobal: boolean;
  imageUrl: string;
  fileSize: number;
  createdAt: string;
}

export interface ApiRefImagePlacement {
  id: number;
  layoutId: number;
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
  rotation: number;
}

export interface ApiLayoutDetail extends ApiLayout {
  placedItems: ApiPlacedItem[];
  referenceImages?: ApiReferenceImage[];
  refImagePlacements?: ApiRefImagePlacement[];
}

export interface CreateLayoutRequest {
  name: string;
  description?: string;
  gridX: number;
  gridY: number;
  widthMm: number;
  depthMm: number;
  spacerHorizontal?: string;
  spacerVertical?: string;
  placedItems: Array<{
    itemId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    customization?: BinCustomization;
  }>;
  refImagePlacements?: Array<{
    refImageId: number;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
    scale: number;
    isLocked: boolean;
    rotation: number;
  }>;
}

export type UpdateLayoutRequest = CreateLayoutRequest;

export interface UpdateLayoutMetaRequest {
  name?: string;
  description?: string;
}

// ============================================================
// Auth API types
// ============================================================

export interface ApiUser {
  id: number;
  email: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface AuthResponse {
  user: ApiUser;
  accessToken: string;
  refreshToken: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

// ============================================================
// Sharing API types
// ============================================================

export interface ApiSharedProject {
  id: number;
  layoutId: number;
  slug: string;
  createdBy: number;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}

export interface ApiSharedLayoutView {
  layout: ApiLayout;
  placedItems: ApiPlacedItem[];
  sharedBy: string;
}

// ============================================================
// BOM API types
// ============================================================

export type BomGenerationStatus = 'pending' | 'generating' | 'ready' | 'error';

export interface BomGenerationManifestEntry {
  filename: string;
  widthUnits: number;
  heightUnits: number;
  customization?: BinCustomization;
  qty: number;
}

export interface ApiBomGeneration {
  id: number;
  layoutId: number;
  status: BomGenerationStatus;
  fileManifest: BomGenerationManifestEntry[] | null;
  threeMfPath: string | null;
  generatedAt: string | null;
  errorMessage: string | null;
}

// ============================================================
// User STL upload types
// ============================================================

export interface ApiUserStl {
  id: string;
  name: string;
  gridX: number | null;
  gridY: number | null;
  imageUrl: string | null;
  perspImageUrls: string[];
  status: 'pending' | 'processing' | 'ready' | 'error';
  errorMessage: string | null;
  createdAt: string;
}

export interface ApiUserStlAdmin extends ApiUserStl {
  userId: number;
  userName: string;
  originalFilename: string;
  updatedAt: string;
}

