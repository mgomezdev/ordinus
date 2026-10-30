import { CUSTOM_LIBRARY_ID } from '@gridfinity/shared';
import type { CustomBinSpec } from '@gridfinity/shared';
import type { LibraryItem } from '../types/gridfinity';

const ID_HASH_LENGTH = 12;
const CUSTOM_BIN_COLOR = '#3B82F6';
const CUSTOM_CATEGORY = 'custom';

/** Id used for a custom bin in layouts: `custom:custom-<hash prefix>`. */
export function customItemId(hash: string): string {
  return `${CUSTOM_LIBRARY_ID}:custom-${hash.slice(0, ID_HASH_LENGTH)}`;
}

export function customBinName(spec: CustomBinSpec): string {
  return `Custom ${spec.width}\u00d7${spec.depth}\u00d7${spec.height}`;
}

/** A custom bin as a synthetic LibraryItem, so overlay, BOM and thumbnails treat it like any other item. */
export function buildCustomItem(id: string, spec: CustomBinSpec, hash: string | null): LibraryItem {
  return {
    id,
    libraryId: CUSTOM_LIBRARY_ID,
    name: customBinName(spec),
    widthUnits: spec.width,
    heightUnits: spec.depth,
    color: CUSTOM_BIN_COLOR,
    categories: [CUSTOM_CATEGORY],
    paramHash: hash ?? undefined,
    customSpec: spec,
  };
}
