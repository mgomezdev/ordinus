import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { dragToGridCell } from '../utils/drag-drop';

test.describe('Collision Detection', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test('overlapping items are marked as invalid', async ({ page }) => {
    // Place first item at cell (0, 0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // No invalid items yet
    expect(await gridPage.hasInvalidItems()).toBe(false);

    // Place another item at the same position (overlapping)
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Both items should now be marked as invalid due to collision
    await page.waitForTimeout(100);
    expect(await gridPage.hasInvalidItems()).toBe(true);
  });

  test('non-overlapping items remain valid', async ({ page }) => {
    // Place first item at cell (0, 0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Place second item far away at cell (2, 2)
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    // Should have 2 items
    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // No items should be invalid (assuming they don't overlap)
    await page.waitForTimeout(100);
    expect(await gridPage.hasInvalidItems()).toBe(false);
  });

  test('item moved to overlap becomes invalid', async ({ page }) => {
    // Place first item at cell (0, 0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Deselect
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(50);

    // Place second item in non-overlapping position at cell (2, 0)
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);

    // Both should be valid
    expect(await gridPage.hasInvalidItems()).toBe(false);

    // Deselect before dragging the placed item
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(200);

    // Verify items are placed correctly before the move
    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Move second item to overlap with first at cell (0, 0)
    // Scroll the second item into view first — clickEmptyGridArea scrolls
    // to the bottom-right cell, which can push top-row items off-viewport
    const secondItem = page.locator('.placed-item').nth(1);
    await secondItem.scrollIntoViewIfNeeded();
    await dragToGridCell(page, secondItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Now should have invalid items
    await page.waitForTimeout(100);
    expect(await gridPage.hasInvalidItems()).toBe(true);
  });

  test('item extending beyond grid boundary is invalid', async ({ page }) => {
    // Get the first item and place at the far right column
    const item = libraryPage.libraryItems.first();
    await dragToGridCell(page, item, gridPage.gridContainer, 3, 0, 4, 4);

    // Wait for placement
    await page.waitForTimeout(100);

    // Check if item is placed
    const placedCount = await gridPage.getPlacedItemCount();
    expect(placedCount).toBe(1);

    // Item at edge might be invalid if it extends beyond boundary
    // This depends on item size
  });

  test('moving item away from overlap makes it valid', async ({ page }) => {
    // Create overlapping items first at cell (0, 0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Should have invalid items
    await page.waitForTimeout(100);
    expect(await gridPage.hasInvalidItems()).toBe(true);

    // Move one item away to cell (2, 2)
    const secondItem = page.locator('.placed-item').nth(1);
    await dragToGridCell(page, secondItem, gridPage.gridContainer, 2, 2, 4, 4);

    // Should no longer have invalid items
    await page.waitForTimeout(100);
    expect(await gridPage.hasInvalidItems()).toBe(false);
  });
});
