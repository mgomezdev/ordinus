import fs from 'fs/promises';
import path from 'path';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { layouts, libraryItems } from '../db/schema.js';
import { config } from '../config.js';
import { generateThumbnailSvg, type ThumbnailPlacedItem } from '../utils/thumbnailSvg.js';

export async function generate(
  layoutId: number,
  gridX: number,
  gridY: number,
  items: ThumbnailPlacedItem[],
): Promise<void> {
  const colorMap = new Map<string, string>();

  if (items.length > 0) {
    const uniqueLibraryIds = [...new Set(items.map(i => i.libraryId))];
    for (const libraryId of uniqueLibraryIds) {
      const itemIds = [...new Set(items.filter(i => i.libraryId === libraryId).map(i => i.itemId))];
      const rows = await db
        .select({ id: libraryItems.id, libraryId: libraryItems.libraryId, color: libraryItems.color })
        .from(libraryItems)
        .where(and(eq(libraryItems.libraryId, libraryId), inArray(libraryItems.id, itemIds)));
      for (const row of rows) {
        colorMap.set(`${row.libraryId}:${row.id}`, row.color);
      }
    }
  }

  const svg = generateThumbnailSvg(gridX, gridY, items, colorMap);
  const filename = `${layoutId}.svg`;
  await fs.writeFile(path.join(config.THUMBNAIL_DIR, filename), svg, 'utf-8');

  await db
    .update(layouts)
    .set({ thumbnailPath: filename })
    .where(eq(layouts.id, layoutId));
}

export async function deleteThumbnail(layoutId: number): Promise<void> {
  try {
    await fs.unlink(path.join(config.THUMBNAIL_DIR, `${layoutId}.svg`));
  } catch {
    // File may not exist — idempotent
  }
  await db
    .update(layouts)
    .set({ thumbnailPath: null })
    .where(eq(layouts.id, layoutId));
}
