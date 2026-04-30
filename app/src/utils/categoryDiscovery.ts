import type { LibraryItem, Category } from '../types/gridfinity';

/**
 * Discover unique categories from library items
 * Generates default metadata (name, color, order) if not specified
 */
export function discoverCategories(items: LibraryItem[]): Category[] {
  const categoryMap = new Map<string, Category>();

  for (const item of items) {
    for (const categoryId of item.categories) {
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          id: categoryId,
          name: formatCategoryName(categoryId),
          color: generateColorForCategory(categoryId),
          order: categoryMap.size + 1,
        });
      }
    }
  }

  return Array.from(categoryMap.values()).sort((a, b) =>
    (a.order || 0) - (b.order || 0)
  );
}

/**
 * Format category ID into display name
 * @example 'bin' => 'Bin', 'utensil' => 'Utensil', 'labeled' => 'Labeled'
 */
function formatCategoryName(categoryId: string): string {
  return categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
}

/**
 * Generate consistent color for category based on ID
 * Uses simple hash to ensure same category always gets same color
 */
function generateColorForCategory(categoryId: string): string {
  // Simple string hash
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) {
    hash = categoryId.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Convert to hue (0-360)
  const hue = Math.abs(hash % 360);

  // Return HSL color with fixed saturation and lightness
  return `hsl(${hue}, 70%, 50%)`;
}
