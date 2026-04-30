import type { Page } from '@playwright/test';

const LIBRARY_STORAGE_KEY = 'gridfinity-library';
const CATEGORIES_STORAGE_KEY = 'gridfinity-categories';

export interface StoredLibraryItem {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  imageUrl?: string;
}

export interface StoredCategory {
  id: string;
  name: string;
  color?: string;
  order?: number;
}

/**
 * Clears all Gridfinity-related localStorage data
 */
export async function clearStorage(page: Page): Promise<void> {
  await page.evaluate(([libKey, catKey]) => {
    localStorage.removeItem(libKey);
    localStorage.removeItem(catKey);
  }, [LIBRARY_STORAGE_KEY, CATEGORIES_STORAGE_KEY]);
}

/**
 * Sets library items in localStorage
 */
export async function setLibraryItems(
  page: Page,
  items: StoredLibraryItem[]
): Promise<void> {
  await page.evaluate(
    ([key, data]) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    [LIBRARY_STORAGE_KEY, items]
  );
}

/**
 * Gets library items from localStorage
 */
export async function getLibraryItems(
  page: Page
): Promise<StoredLibraryItem[]> {
  const data = await page.evaluate((key) => {
    return localStorage.getItem(key);
  }, LIBRARY_STORAGE_KEY);

  return data ? JSON.parse(data) : [];
}

/**
 * Sets categories in localStorage
 */
export async function setCategories(
  page: Page,
  categories: StoredCategory[]
): Promise<void> {
  await page.evaluate(
    ([key, data]) => {
      localStorage.setItem(key, JSON.stringify(data));
    },
    [CATEGORIES_STORAGE_KEY, categories]
  );
}

/**
 * Gets categories from localStorage
 */
export async function getCategories(page: Page): Promise<StoredCategory[]> {
  const data = await page.evaluate((key) => {
    return localStorage.getItem(key);
  }, CATEGORIES_STORAGE_KEY);

  return data ? JSON.parse(data) : [];
}

/**
 * Sets up initial test data with standard library items
 */
export async function setupTestData(page: Page): Promise<void> {
  const testItems: StoredLibraryItem[] = [
    {
      id: 'test-1x1',
      name: '1x1 Bin',
      widthUnits: 1,
      heightUnits: 1,
      color: '#4299e1',
      categories: ['bins'],
    },
    {
      id: 'test-2x1',
      name: '2x1 Bin',
      widthUnits: 2,
      heightUnits: 1,
      color: '#48bb78',
      categories: ['bins'],
    },
    {
      id: 'test-2x2',
      name: '2x2 Bin',
      widthUnits: 2,
      heightUnits: 2,
      color: '#ed8936',
      categories: ['bins'],
    },
  ];

  const testCategories: StoredCategory[] = [
    { id: 'bins', name: 'Bins', order: 0 },
    { id: 'tools', name: 'Tools', order: 1 },
  ];

  await setLibraryItems(page, testItems);
  await setCategories(page, testCategories);
}
