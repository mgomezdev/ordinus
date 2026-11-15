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
  const requestedRef = useRef<Map<string, string>>(new Map());

  const register = useCallback((item: LibraryItem) => {
    setItems(prev => new Map(prev).set(item.id, item));
  }, []);

  const createCustomItem = useCallback(async (spec: CustomBinSpec) => {
    const { hash, status } = await requestCustomGenerationApi(spec);
    const item = buildCustomItem(customItemId(hash), spec, hash);
    requestedRef.current.set(item.id, JSON.stringify(spec));
    register(item);
    return { item, status };
  }, [register]);

  useEffect(() => {
    const pending = new Map<string, CustomBinSpec>();
    for (const placed of placedItems) {
      if (placed.customSpec && requestedRef.current.get(placed.itemId) !== JSON.stringify(placed.customSpec)) pending.set(placed.itemId, placed.customSpec);
    }
    pending.forEach((spec, id) => {
      const fingerprint = JSON.stringify(spec);
      requestedRef.current.set(id, fingerprint);
      requestCustomGenerationApi(spec)
        .then(({ hash }) => { if (requestedRef.current.get(id) === fingerprint) register(buildCustomItem(id, spec, hash)); })
        .catch(() => { if (requestedRef.current.get(id) === fingerprint) requestedRef.current.delete(id); });
    });
  }, [placedItems, register]);

  const resolveItem = useCallback(
    (id: string): LibraryItem | undefined => items.get(id) ?? getLibraryItemById(id),
    [items, getLibraryItemById],
  );

  return { resolveItem, createCustomItem, customItems: [...items.values()] };
}
