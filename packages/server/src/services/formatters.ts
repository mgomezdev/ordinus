import type { ApiLayout, ApiPlacedItem, BinCustomization } from '@gridfinity/shared';
import { layouts, placedItems } from '../db/schema.js';

export function parseCustomization(json: string | null): BinCustomization | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as BinCustomization;
  } catch {
    return undefined;
  }
}

export function formatLayout(
  row: typeof layouts.$inferSelect,
  ownerUsername?: string,
  ownerEmail?: string,
): ApiLayout {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    gridX: row.gridX,
    gridY: row.gridY,
    widthMm: row.widthMm,
    depthMm: row.depthMm,
    spacerHorizontal: row.spacerHorizontal,
    spacerVertical: row.spacerVertical,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(ownerUsername !== undefined ? { ownerUsername } : {}),
    ...(ownerEmail !== undefined ? { ownerEmail } : {}),
  };
}

export function formatPlacedItem(row: typeof placedItems.$inferSelect): ApiPlacedItem {
  return {
    id: row.id,
    layoutId: row.layoutId,
    libraryId: row.libraryId,
    itemId: row.itemId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    sortOrder: row.sortOrder,
    ...(row.customization ? { customization: parseCustomization(row.customization) } : {}),
  };
}
