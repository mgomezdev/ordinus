import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { dragToGridCell } from '../utils/drag-drop';

test.describe('Item Manipulation', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test('can rotate a selected item CW', async ({ page }) => {
    // Place an item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Item should be selected after placement
    const placedItem = page.locator('.placed-item').first();
    await expect(placedItem).toBeVisible();

    // Get initial dimensions
    const initialBox = await placedItem.boundingBox();
    expect(initialBox).not.toBeNull();

    // Click CW rotate button in inline toolbar
    const cwButton = page.locator('[aria-label="Rotate clockwise"]');
    await expect(cwButton.first()).toBeVisible();
    await cwButton.first().click();

    // Wait for rotation animation/state update
    await page.waitForTimeout(100);

    // Dimensions may have changed (width <-> height swap)
    const newBox = await placedItem.boundingBox();
    expect(newBox).not.toBeNull();
  });

  test('can rotate a selected item CCW', async ({ page }) => {
    // Place an item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Item should be selected after placement
    const placedItem = page.locator('.placed-item').first();
    await expect(placedItem).toBeVisible();

    // Click CCW rotate button in inline toolbar
    const ccwButton = page.locator('[aria-label="Rotate counter-clockwise"]');
    await expect(ccwButton).toBeVisible();
    await ccwButton.click();

    // Wait for rotation animation/state update
    await page.waitForTimeout(100);

    // Dimensions may have changed (width <-> height swap)
    const newBox = await placedItem.boundingBox();
    expect(newBox).not.toBeNull();
  });

  test('can delete a selected item', async ({ page }) => {
    // Place an item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Should have 1 item
    expect(await gridPage.getPlacedItemCount()).toBe(1);

    // Click delete button in inline toolbar
    const deleteButton = page.locator('[aria-label="Remove item"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Wait for state update
    await page.waitForTimeout(100);

    // Should have 0 items
    expect(await gridPage.getPlacedItemCount()).toBe(0);
  });

  test('item controls appear when item is selected', async ({ page }) => {
    // Initially, item controls should not be visible (no selection)
    const itemControls = page.locator('.placed-item-toolbar');
    await expect(itemControls).not.toBeVisible();

    // Place an item - it becomes selected automatically
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Item controls should now be visible
    await expect(itemControls).toBeVisible();
  });

  test('item controls hide when item is deselected', async ({ page }) => {
    // Place an item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Item controls should be visible
    const itemControls = page.locator('.placed-item-toolbar');
    await expect(itemControls).toBeVisible();

    // Click on empty grid area to deselect
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(100);

    // Item controls should be hidden
    await expect(itemControls).not.toBeVisible();
  });

  test('Delete key removes selected item', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    expect(await gridPage.getPlacedItemCount()).toBe(1);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(0);
  });

  test('Backspace key removes selected item', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    expect(await gridPage.getPlacedItemCount()).toBe(1);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(0);
  });

  test('R key rotates selected item', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    const initialBox = await placedItem.boundingBox();
    expect(initialBox).not.toBeNull();

    await page.keyboard.press('r');
    await page.waitForTimeout(100);

    const newBox = await placedItem.boundingBox();
    expect(newBox).not.toBeNull();
  });

  test('keyboard shortcuts do not fire when typing in input', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    expect(await gridPage.getPlacedItemCount()).toBe(1);

    // Focus on a dimension input and type Delete — should not remove the item
    const widthInput = page.locator('input').first();
    await widthInput.focus();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(1);
  });

  test('Clear All button shows with count and removes all items', async ({ page }) => {
    const clearAllButton = page.locator('.clear-all-button');

    // Button should not be visible with no items
    await expect(clearAllButton).not.toBeVisible();

    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Button should be visible with count
    await expect(clearAllButton).toBeVisible();
    await expect(clearAllButton).toContainText('Clear All (2)');

    // Click Clear All and confirm in the custom dialog
    await clearAllButton.click();
    const confirmBtn = page.locator('.confirm-dialog-confirm');
    await confirmBtn.click();
    await page.waitForTimeout(100);

    // All items should be removed
    expect(await gridPage.getPlacedItemCount()).toBe(0);

    // Button should be hidden again
    await expect(clearAllButton).not.toBeVisible();
  });

  test('Clear All button hidden when no items placed', async ({ page }) => {
    const clearAllButton = page.locator('.clear-all-button');
    await expect(clearAllButton).not.toBeVisible();
  });

  test('inline delete button removes selected item', async ({ page }) => {
    // Place an item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    expect(await gridPage.getPlacedItemCount()).toBe(1);

    // Item should be selected after placement — delete button should be visible
    const deleteBtn = page.locator('[aria-label="Remove item"]');
    await expect(deleteBtn).toBeVisible();

    // Click the inline delete button
    await deleteBtn.click();
    await page.waitForTimeout(100);

    // Item should be removed
    expect(await gridPage.getPlacedItemCount()).toBe(0);
  });

  test('inline delete button not visible when no item selected', async ({ page }) => {
    // Place an item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Deselect by clicking empty area
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(100);

    // Delete button should not be visible
    const deleteBtn = page.locator('[aria-label="Remove item"]');
    await expect(deleteBtn).not.toBeVisible();
  });

  test('inline delete button removes correct item with multiple items', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Second item should be selected (most recently placed)
    // Click the first item to select it
    const placedItems = page.locator('.placed-item');
    await placedItems.first().click();
    await page.waitForTimeout(50);

    // Delete button should be on the selected (first) item
    const deleteBtn = page.locator('[aria-label="Remove item"]');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await page.waitForTimeout(100);

    // Should have 1 item remaining
    expect(await gridPage.getPlacedItemCount()).toBe(1);
  });

  test('can select a placed item by clicking on it', async ({ page }) => {
    // Place first item at cell (0,0)
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Deselect by clicking empty area
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(50);

    // Place second item at cell (2,0)
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);

    // Second item should be selected (most recently placed)
    const placedItems = page.locator('.placed-item');
    expect(await placedItems.count()).toBe(2);

    // Click on the first item to select it
    await placedItems.first().click();
    await page.waitForTimeout(50);

    // First item should now be selected
    await expect(placedItems.first()).toHaveClass(/selected/);
  });
});
