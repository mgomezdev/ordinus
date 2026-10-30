import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomBinSpec } from '@gridfinity/shared';
import type { LibraryItem, PlacedItem } from '../types/gridfinity';
import { requestCustomGenerationApi } from '../api/generation.api';
import { buildCustomItem, customItemId } from '../utils/customItem';

export { customItemId };

/**
 * Custom bins live outside the library: each one is a synthetic LibraryItem so the rest of the
 * app (overlay, BOM, thumbnails) treats it like any other item. Bins restored from a saved
 * layout are re-registered by asking the server for their (cached) generation hash.
 */
export function useCustomBins(
  getLibraryItemById: (id: string) => LibraryItem | undefined,
  placedItems: PlacedItem[],
) {
  const [items, setItems] = useState<Map<string, LibraryItem>>(new Map());
  const requestedRef = useRef<Set<string>>(new Set());

  const register = useCallback((item: LibraryItem) => {
    setItems(prev => new Map(prev).set(item.id, item));
  }, []);

  const createCustomItem = useCallback(async (spec: CustomBinSpec) => {
    const { hash, status } = await requestCustomGenerationApi(spec);
    const item = buildCustomItem(customItemId(hash), spec, hash);
    requestedRef.current.add(item.id);
    register(item);
    return { item, status };
  }, [register]);

  useEffect(() => {
    const pending = new Map<string, CustomBinSpec>();
    for (const placed of placedItems) {
      if (placed.customSpec && !requestedRef.current.has(placed.itemId)) pending.set(placed.itemId, placed.customSpec);
    }
    pending.forEach((spec, id) => {
      requestedRef.current.add(id);
      requestCustomGenerationApi(spec)
        .then(({ hash }) => register(buildCustomItem(id, spec, hash)))
        .catch(() => requestedRef.current.delete(id));
    });
  }, [placedItems, register]);

  const resolveItem = useCallback(
    (id: string): LibraryItem | undefined => items.get(id) ?? getLibraryItemById(id),
    [items, getLibraryItemById],
  );

  return { resolveItem, createCustomItem, customItems: [...items.values()] };
}
