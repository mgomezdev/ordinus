/** Zoom constraints */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4.0;
export const ZOOM_STEP = 0.1;
export const WHEEL_ZOOM_FACTOR = 0.001;

/** Drag threshold in pixels — below this, treat as tap */
export const DRAG_THRESHOLD = 5;

/** Reference image defaults */
export const DEFAULT_IMAGE_X = 10;
export const DEFAULT_IMAGE_Y = 10;
export const DEFAULT_IMAGE_WIDTH = 50;
export const DEFAULT_IMAGE_HEIGHT = 50;
export const DEFAULT_IMAGE_OPACITY = 0.5;
export const DEFAULT_IMAGE_SCALE = 1;

/** Rotation lookup maps */
import type { Rotation } from '../types/gridfinity';

export const ROTATION_CW: Record<Rotation, Rotation> = { 0: 90, 90: 180, 180: 270, 270: 0 };
export const ROTATION_CCW: Record<Rotation, Rotation> = { 0: 270, 90: 0, 180: 90, 270: 180 };

/** Gridfinity base unit size in mm */
export const GRIDFINITY_UNIT_MM = 42;

/** localStorage debounce delay in ms */
export const STORAGE_DEBOUNCE_MS = 300;
