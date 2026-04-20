import { test, expect } from '@playwright/test';
import { LibraryPage } from '../pages/LibraryPage';
import { BOMPage } from '../pages/BOMPage';
import { GridPage } from '../pages/GridPage';
import { dragToGridCell } from '../utils/drag-drop';

test.describe('Library Management', () => {
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    libraryPage = new LibraryPage(page);
    await page.goto('/');
    await libraryPage.waitForLibraryReady();
  });

  test('library displays items with name and size', async () => {
    // Get first library item
    const firstItem = libraryPage.libraryItems.first();
    await expect(firstItem).toBeVisible();

    // Should have name
    const name = firstItem.locator('.library-item-name');
    await expect(name).toBeVisible();
    const nameText = await name.textContent();
    expect(nameText).toBeTruthy();

    // Should have size
    const size = firstItem.locator('.library-item-size');
    await expect(size).toBeVisible();
    const sizeText = await size.textContent();
    expect(sizeText).toMatch(/\d+x\d+/); // e.g., "1x1", "2x1"
  });

  test('library items are draggable', async () => {
    const firstItem = libraryPage.libraryItems.first();

    // Items use pointer events for drag - verify touch-action is set
    const touchAction = await firstItem.evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');
  });

  test('library shows color preview for items', async () => {
    const firstItem = libraryPage.libraryItems.first();

    // Should have a preview section
    const preview = firstItem.locator('.library-item-preview-container');
    await expect(preview).toBeVisible();
  });
});

test.describe('Bill of Materials Updates', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;
  let bomPage: BOMPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);
    bomPage = new BOMPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test('BOM is empty when no items are placed', async () => {
    // Navigate to order summary — no items placed, should show empty state
    await bomPage.goToBOM();
    const itemCount = await bomPage.getItemCount();
    expect(itemCount).toBe(0);
  });

  test('BOM updates when item is placed', async ({ page }) => {
    // Place an item on the workspace
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Navigate to order summary — BOM should now have 1 entry
    await bomPage.goToBOM();
    expect(await bomPage.getItemCount()).toBe(1);
  });

  test('BOM quantity increases when same item placed multiple times', async ({ page }) => {
    // Place same item twice
    const firstItem = libraryPage.libraryItems.first();

    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Deselect to avoid moving the item
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(50);

    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);

    // Navigate to order summary to check BOM
    await bomPage.goToBOM();

    // Should still have 1 BOM entry (same item type)
    expect(await bomPage.getItemCount()).toBe(1);

    // But quantity should be 2
    const entries = await bomPage.getBOMEntries();
    expect(entries[0].quantity).toBe(2);
  });

  test('BOM shows different entries for different items', async ({ page }) => {
    const items = libraryPage.libraryItems;
    const itemCount = await items.count();

    // Need at least 2 different items
    if (itemCount >= 2) {
      // Place first item type at cell (0,0)
      await dragToGridCell(page, items.first(), gridPage.gridContainer, 0, 0, 4, 4);

      await gridPage.clickEmptyGridArea();
      await page.waitForTimeout(50);

      // Place second item type at cell (2,0)
      await dragToGridCell(page, items.nth(1), gridPage.gridContainer, 2, 0, 4, 4);

      // Navigate to order summary — should have 2 BOM entries
      await bomPage.goToBOM();
      expect(await bomPage.getItemCount()).toBe(2);
    }
  });

  test('BOM updates when item is deleted', async ({ page }) => {
    // Place an item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Delete the item using the inline toolbar button
    const deleteButton = page.locator('[aria-label="Remove item"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await page.waitForTimeout(100);

    // Navigate to order summary — BOM should be empty
    await bomPage.goToBOM();
    expect(await bomPage.getItemCount()).toBe(0);
  });

  test('BOM quantity decreases when one of multiple items is deleted', async ({ page }) => {
    // Place same item twice
    const firstItem = libraryPage.libraryItems.first();

    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(50);

    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);

    // Click on the first item and delete it
    await page.locator('.placed-item').first().click();
    const deleteButton = page.locator('[aria-label="Remove item"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await page.waitForTimeout(100);

    // Navigate to order summary — quantity should be 1 now
    await bomPage.goToBOM();
    const entries = await bomPage.getBOMEntries();
    expect(entries[0].quantity).toBe(1);
  });
});
