import { useMemo } from 'react';
import type { BOMItem } from '@gridfinity/shared';
import type { PlacedItem, LibraryItem, BinCustomization } from '../types/gridfinity';
import { isDefaultCustomization, getBOMKey } from '../types/gridfinity';

export function useBillOfMaterials(placedItems: PlacedItem[], libraryItems: LibraryItem[]): BOMItem[] {
  return useMemo(() => {
    const itemCounts = new Map<string, { count: number; customization: BinCustomization | undefined }>();

    placedItems.forEach(placedItem => {
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

    const bomItems: BOMItem[] = [];

    itemCounts.forEach(({ count, customization }, groupKey) => {
      const itemId = groupKey.split('::')[0];
      const libraryItem = libraryItems.find(item => item.id === itemId);
      if (libraryItem) {
        bomItems.push({
          libraryId: libraryItem.libraryId,
          itemId: libraryItem.id,
          name: libraryItem.name,
          widthUnits: libraryItem.widthUnits,
          heightUnits: libraryItem.heightUnits,
          color: libraryItem.color,
          categories: libraryItem.categories,
          quantity: count,
          customization,
          ...(libraryItem.price !== undefined ? { price: libraryItem.price } : {}),
          ...(libraryItem.parameters && Object.keys(libraryItem.parameters).length > 0
            ? { parameters: libraryItem.parameters }
            : {}),
        });
      }
    });

    return bomItems.sort((a, b) => a.name.localeCompare(b.name));
  }, [placedItems, libraryItems]);
}
