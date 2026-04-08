import { useMemo } from 'react';
import type { PlacedItem, BOMItem, LibraryItem, BinCustomization } from '../types/gridfinity';
import { isDefaultCustomization, getBOMKey } from '../types/gridfinity';

export function useBillOfMaterials(placedItems: PlacedItem[], libraryItems: LibraryItem[]): BOMItem[] {
  return useMemo(() => {
    // Group placed items by itemId + customization and count quantities
    const itemCounts = new Map<string, { count: number; customization: BinCustomization | undefined }>();

    placedItems.forEach(placedItem => {
      // Treat undefined and all-default customizations as the same group
      const groupKey = getBOMKey(placedItem.itemId, placedItem.customization);
      const existing = itemCounts.get(groupKey);
      if (existing) {
        existing.count++;
      } else {
        itemCounts.set(groupKey, {
          count: 1,
          customization: isDefaultCustomization(placedItem.customization) ? undefined : placedItem.customization,
        });
      }
    });

    // Convert to BOMItem array with library item details
    const bomItems: BOMItem[] = [];

    itemCounts.forEach(({ count, customization }, groupKey) => {
      const itemId = groupKey.split('::')[0];
      const libraryItem = libraryItems.find(item => item.id === itemId);
      if (libraryItem) {
        bomItems.push({
          itemId: libraryItem.id,
          name: libraryItem.name,
          widthUnits: libraryItem.widthUnits,
          heightUnits: libraryItem.heightUnits,
          color: libraryItem.color,
          categories: libraryItem.categories,
          quantity: count,
          customization,
          ...(libraryItem.price !== undefined ? { price: libraryItem.price } : {}),
        });
      }
    });

    // Sort by name, ascending
    return bomItems.sort((a, b) => a.name.localeCompare(b.name));
  }, [placedItems, libraryItems]);
}
