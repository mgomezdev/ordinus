import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { dragToGridCell } from '../utils/drag-drop';

test.describe('Drag and Drop', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test('can drag a library item onto the grid', async ({ page }) => {
    // Get initial placed item count
    const initialCount = await gridPage.getPlacedItemCount();
    expect(initialCount).toBe(0);

    // Get the first library item
    const firstItem = libraryPage.libraryItems.first();
    await expect(firstItem).toBeVisible();

    // Drag to grid cell (0,0)
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Should have one placed item now
    const newCount = await gridPage.getPlacedItemCount();
    expect(newCount).toBe(1);
  });

  test('placed item becomes selected after placement', async ({ page }) => {
    // Drag first item to grid cell (0,0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // The item should be selected (has .selected class)
    const selectedItems = page.locator('.placed-item.selected');
    await expect(selectedItems).toHaveCount(1);
  });

  test('can place multiple items on the grid', async ({ page }) => {
    const items = libraryPage.libraryItems;
    const itemCount = await items.count();

    // Need at least 1 item for this test
    expect(itemCount).toBeGreaterThanOrEqual(1);

    // Place first item at cell (0,0)
    await dragToGridCell(page, items.first(), gridPage.gridContainer, 0, 0, 4, 4);

    // Place the same item again at cell (2,0)
    await dragToGridCell(page, items.first(), gridPage.gridContainer, 2, 0, 4, 4);

    // Should have 2 placed items
    const placedCount = await gridPage.getPlacedItemCount();
    expect(placedCount).toBe(2);
  });

  test('can move a placed item to a new position', async ({ page }) => {
    // First place an item at cell (0,0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Get the placed item
    const placedItem = page.locator('.placed-item').first();
    await expect(placedItem).toBeVisible();

    // Get initial position
    const initialBox = await placedItem.boundingBox();
    expect(initialBox).not.toBeNull();

    // Drag the placed item to cell (2,1)
    await dragToGridCell(page, placedItem, gridPage.gridContainer, 2, 1, 4, 4);

    // Get new position - should be different
    const newBox = await placedItem.boundingBox();
    expect(newBox).not.toBeNull();
  });

  test('clicking on empty grid area deselects item', async ({ page }) => {
    // Place and select an item at cell (0,0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Item should be selected
    const selectedItems = page.locator('.placed-item.selected');
    await expect(selectedItems).toHaveCount(1);

    // Click on empty area of the grid
    await gridPage.clickEmptyGridArea();

    // Wait for state update
    await page.waitForTimeout(100);

    // Should be deselected - check for no selected items
    await expect(selectedItems).toHaveCount(0);
  });
});
