import type { PlacedItem } from '../types/gridfinity';

const GRID_ITEMS_KEY = 'gridfinity-grid-items';
const MIGRATION_FLAG_KEY = 'gridfinity-migrated-to-multi-library';

/**
 * Migrate placed items from single-library format to multi-library format
 * Adds 'bins_standard:' prefix to item IDs that don't already have a library prefix
 *
 * This runs automatically on app startup and is idempotent (safe to run multiple times)
 */
export function migrateStoredItems(): void {
  // Check if migration already completed
  const migrationComplete = localStorage.getItem(MIGRATION_FLAG_KEY);
  if (migrationComplete === 'true') {
    return;
  }

  try {
    const stored = localStorage.getItem(GRID_ITEMS_KEY);
    if (!stored) {
      // No items to migrate - mark as complete
      localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      return;
    }

    const items: PlacedItem[] = JSON.parse(stored);
    let needsMigration = false;

    const migrated = items.map((item) => {
      // Check if itemId is already prefixed (contains ':')
      if (!item.itemId.includes(':')) {
        needsMigration = true;
        // Add 'bins_standard:' prefix to unprefixed items
        return {
          ...item,
          itemId: `bins_standard:${item.itemId}`,
        };
      }
      return item;
    });

    if (needsMigration) {
      localStorage.setItem(GRID_ITEMS_KEY, JSON.stringify(migrated));
      console.log('✓ Migrated placed items to multi-library format');
    }

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
  } catch (err) {
    console.error('Failed to migrate placed items:', err);
    // Don't set migration flag on error - will retry next load
  }
}

/**
 * Migrates library selection:
 * - Renames 'default' to 'bins_standard'
 * - Adds 'simple-utensils' if only one library was selected
 */
export function migrateLibrarySelection(): void {
  const STORAGE_KEY = 'gridfinity-selected-libraries';
  const MIGRATION_KEY = 'gridfinity-migration-library-selection';

  const migrated = localStorage.getItem(MIGRATION_KEY);
  if (migrated === 'v2') return;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    let selectedLibraries: string[] = stored ? JSON.parse(stored) : ['bins_standard'];

    // Rename 'default' to 'bins_standard'
    selectedLibraries = selectedLibraries.map(id => id === 'default' ? 'bins_standard' : id);

    // If user only has one library, add 'simple-utensils'
    if (selectedLibraries.length === 1) {
      selectedLibraries.push('simple-utensils');
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedLibraries));
    localStorage.setItem(MIGRATION_KEY, 'v2');
  } catch (err) {
    console.warn('Failed to migrate library selection:', err);
  }
}

/**
 * Clean up old localStorage keys that are no longer used
 * Safe to call even if keys don't exist
 */
export function cleanupOldStorage(): void {
  const keysToRemove = [
    'gridfinity-library-custom', // Custom items no longer supported
    'gridfinity-categories',     // Categories now derived from items
  ];

  for (const key of keysToRemove) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore errors - not critical
    }
  }
}
