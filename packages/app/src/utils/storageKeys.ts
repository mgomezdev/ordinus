/**
 * Centralized localStorage key constants.
 * All localStorage access should use these keys to prevent duplication and typos.
 */
export const STORAGE_KEYS = {
  REFERENCE_IMAGES: 'gridfinity-reference-images',
  SELECTED_LIBRARIES: 'gridfinity-selected-libraries',
  COLLAPSED_CATEGORIES: 'gridfinity-collapsed-categories',
  PLACED_ITEMS: 'gridfinity-placed-items',
  CUSTOM_LIBRARY: 'gridfinity-custom-library',
  CUSTOM_CATEGORIES: 'gridfinity-custom-categories',
  WALKTHROUGH_SEEN: 'gridfinity-walkthrough-seen',
  BOM_EXTRAS: 'gridfinity-bom-extras',
  MOBILE_LAYOUT: 'gridfinity-mobile-layout',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
