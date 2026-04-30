import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { dragToGridCell } from '../utils/drag-drop';

test.describe('Multi-Select and Batch Operations', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test('Shift+Click adds item to selection', async ({ page }) => {
    // Place first item
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);

    // Place second item
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);
    await page.waitForTimeout(100);

    // Should have 2 items
    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Second item should be selected after placement
    const secondItem = page.locator('.placed-item').nth(1);
    await expect(secondItem).toHaveClass(/selected/);

    // Click first item normally (replaces selection)
    const firstPlacedItem = page.locator('.placed-item').first();
    await firstPlacedItem.click();
    await page.waitForTimeout(50);

    // Verify only first item is selected
    await expect(firstPlacedItem).toHaveClass(/selected/);
    await expect(secondItem).not.toHaveClass(/selected/);

    // Shift+Click second item (adds to selection)
    await page.keyboard.down('Shift');
    await secondItem.click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(50);

    // Verify both items are now selected
    await expect(firstPlacedItem).toHaveClass(/selected/);
    await expect(secondItem).toHaveClass(/selected/);

    // Verify selection count
    const selectedItems = page.locator('.placed-item.selected');
    expect(await selectedItems.count()).toBe(2);
  });

  test('Ctrl+Click toggles item in selection', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Click first item to select it
    const firstPlacedItem = page.locator('.placed-item').first();
    await firstPlacedItem.click();
    await page.waitForTimeout(50);

    // Ctrl+Click second item to add to selection
    const secondItem = page.locator('.placed-item').nth(1);
    await page.keyboard.down('Control');
    await secondItem.click();
    await page.keyboard.up('Control');
    await page.waitForTimeout(50);

    // Both should be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Ctrl+Click second item again to toggle it off
    await page.keyboard.down('Control');
    await secondItem.click();
    await page.keyboard.up('Control');
    await page.waitForTimeout(50);

    // Only first item should be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(1);
    await expect(firstPlacedItem).toHaveClass(/selected/);
    await expect(secondItem).not.toHaveClass(/selected/);
  });

  test('Ctrl+A selects all placed items', async ({ page }) => {
    // Place three items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(3);

    // Initially only the last placed item is selected
    expect(await page.locator('.placed-item.selected').count()).toBe(1);

    // Press Ctrl+A to select all
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // All three items should be selected
    const selectedItems = page.locator('.placed-item.selected');
    expect(await selectedItems.count()).toBe(3);

    // Verify each item has the selected class
    const placedItems = page.locator('.placed-item');
    await expect(placedItems.nth(0)).toHaveClass(/selected/);
    await expect(placedItems.nth(1)).toHaveClass(/selected/);
    await expect(placedItems.nth(2)).toHaveClass(/selected/);
  });

  test('Escape deselects all items', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Select all items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Both should be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Press Escape to deselect all
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);

    // No items should be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(0);
  });

  test('Selection count indicator appears when multiple items selected', async ({ page }) => {
    // Place three items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 2, 4, 4);
    await page.waitForTimeout(100);

    // Initially only one item is selected, indicator should not appear
    const indicator = page.locator('.selection-count-indicator');
    await expect(indicator).toBeHidden();

    // Select all items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    // Indicator should now be visible
    await expect(indicator).toBeVisible();

    // Verify text shows correct count
    await expect(indicator).toHaveText('3 items selected');
  });

  test('Batch delete removes all selected items', async ({ page }) => {
    // Place three items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(3);

    // Select first two items using Shift+Click
    const firstPlacedItem = page.locator('.placed-item').first();
    await firstPlacedItem.click();
    await page.waitForTimeout(50);

    const secondItem = page.locator('.placed-item').nth(1);
    await page.keyboard.down('Shift');
    await secondItem.click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(50);

    // Verify two items are selected
    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Press Delete to remove selected items
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);

    // Should have only 1 item remaining
    expect(await gridPage.getPlacedItemCount()).toBe(1);
  });

  test('Batch delete with Backspace removes all selected items', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Select all items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Press Backspace to remove selected items
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    // Should have no items remaining
    expect(await gridPage.getPlacedItemCount()).toBe(0);
  });

  test('Batch rotate rotates all selected items', async ({ page }) => {
    // Place two non-square items (1x2 bins) to verify rotation
    const rectangularItem = page.locator('.library-item-card').filter({ hasText: '1x2 Bin' }).first();
    await dragToGridCell(page, rectangularItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, rectangularItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Get initial bounding boxes (rotation will swap width/height)
    const firstPlacedItem = page.locator('.placed-item').first();
    const secondPlacedItem = page.locator('.placed-item').nth(1);

    const initialBox1 = await firstPlacedItem.boundingBox();
    const initialBox2 = await secondPlacedItem.boundingBox();
    expect(initialBox1).not.toBeNull();
    expect(initialBox2).not.toBeNull();

    // Select all items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Press R to rotate all selected items
    await page.keyboard.press('r');
    await page.waitForTimeout(100);

    // Get bounding boxes after rotation (dimensions should swap)
    const rotatedBox1 = await firstPlacedItem.boundingBox();
    const rotatedBox2 = await secondPlacedItem.boundingBox();
    expect(rotatedBox1).not.toBeNull();
    expect(rotatedBox2).not.toBeNull();

    // For non-square items, width and height should have swapped
    if (initialBox1 && rotatedBox1) {
      expect(Math.abs(initialBox1.width - rotatedBox1.height)).toBeLessThan(25);
      expect(Math.abs(initialBox1.height - rotatedBox1.width)).toBeLessThan(25);
    }

    // Both items should still be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(2);
  });

  test('Batch rotate with Shift+R rotates all selected items counterclockwise', async ({ page }) => {
    // Place two non-square items (1x2 bins) to verify rotation
    const rectangularItem = page.locator('.library-item-card').filter({ hasText: '1x2 Bin' }).first();
    await dragToGridCell(page, rectangularItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, rectangularItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Select all items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Get initial bounding boxes
    const firstPlacedItem = page.locator('.placed-item').first();
    const secondPlacedItem = page.locator('.placed-item').nth(1);

    const initialBox1 = await firstPlacedItem.boundingBox();
    const initialBox2 = await secondPlacedItem.boundingBox();
    expect(initialBox1).not.toBeNull();
    expect(initialBox2).not.toBeNull();

    // Press Shift+R to rotate counterclockwise
    await page.keyboard.press('Shift+r');
    await page.waitForTimeout(100);

    // Get bounding boxes after rotation
    const rotatedBox1 = await firstPlacedItem.boundingBox();
    const rotatedBox2 = await secondPlacedItem.boundingBox();
    expect(rotatedBox1).not.toBeNull();
    expect(rotatedBox2).not.toBeNull();

    // For non-square items, width and height should have swapped
    if (initialBox1 && rotatedBox1) {
      expect(Math.abs(initialBox1.width - rotatedBox1.height)).toBeLessThan(25);
      expect(Math.abs(initialBox1.height - rotatedBox1.width)).toBeLessThan(25);
    }
  });

  test('Click without modifier replaces selection', async ({ page }) => {
    // Place three items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(3);

    // Select first two items
    const firstPlacedItem = page.locator('.placed-item').first();
    await firstPlacedItem.click();
    await page.waitForTimeout(50);

    const secondItem = page.locator('.placed-item').nth(1);
    await page.keyboard.down('Shift');
    await secondItem.click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(50);

    // Verify two items are selected
    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Click third item without modifier (should replace selection)
    const thirdItem = page.locator('.placed-item').nth(2);
    await thirdItem.click();
    await page.waitForTimeout(50);

    // Only third item should be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(1);
    await expect(thirdItem).toHaveClass(/selected/);
    await expect(firstPlacedItem).not.toHaveClass(/selected/);
    await expect(secondItem).not.toHaveClass(/selected/);
  });

  test('Copy/paste with multi-select copies all selected items', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Select both items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Copy selected items
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(50);

    // Paste
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(100);

    // Should have 4 total items (2 originals + 2 pasted)
    expect(await gridPage.getPlacedItemCount()).toBe(4);

    // All items should be visible
    const placedItems = page.locator('.placed-item');
    await expect(placedItems.nth(0)).toBeVisible();
    await expect(placedItems.nth(1)).toBeVisible();
    await expect(placedItems.nth(2)).toBeVisible();
    await expect(placedItems.nth(3)).toBeVisible();
  });

  test('Multi-select shortcuts do not fire when typing in input', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Focus on a dimension input
    const widthInput = page.locator('input').first();
    await widthInput.focus();

    // Press Ctrl+A in the input (should select text, not items)
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(100);

    // Items should not all be selected (only the last placed one)
    const selectedCount = await page.locator('.placed-item.selected').count();
    expect(selectedCount).toBeLessThan(2);

    // Ctrl+C should not copy items while in input (just copy text)
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(50);

    // Click on grid to blur input
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(50);

    // Ctrl+V should not paste items (clipboard should be empty or contain text)
    const itemCountBeforePaste = await gridPage.getPlacedItemCount();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(100);

    // Item count should be the same (no items pasted)
    expect(await gridPage.getPlacedItemCount()).toBe(itemCountBeforePaste);
  });

  test('Selection count indicator shows correct text for different counts', async ({ page }) => {
    // Place three items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 2, 4, 4);
    await page.waitForTimeout(100);

    const indicator = page.locator('.selection-count-indicator');

    // Initially no indicator (only 1 selected)
    await expect(indicator).toBeHidden();

    // Select first item
    const firstPlacedItem = page.locator('.placed-item').first();
    await firstPlacedItem.click();
    await page.waitForTimeout(50);

    // Add second item to selection
    const secondItem = page.locator('.placed-item').nth(1);
    await page.keyboard.down('Shift');
    await secondItem.click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(50);

    // Should show "2 items selected"
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('2 items selected');

    // Add third item to selection
    const thirdItem = page.locator('.placed-item').nth(2);
    await page.keyboard.down('Shift');
    await thirdItem.click();
    await page.keyboard.up('Shift');
    await page.waitForTimeout(50);

    // Should show "3 items selected"
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('3 items selected');

    // Deselect one item
    await page.keyboard.down('Control');
    await thirdItem.click();
    await page.keyboard.up('Control');
    await page.waitForTimeout(50);

    // Should show "2 items selected"
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText('2 items selected');

    // Deselect another item
    await page.keyboard.down('Control');
    await secondItem.click();
    await page.keyboard.up('Control');
    await page.waitForTimeout(50);

    // Indicator should be hidden (only 1 selected)
    await expect(indicator).toBeHidden();
  });

  test('Batch operations work after dragging new item onto grid', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 0, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Select both items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Batch rotate
    await page.keyboard.press('r');
    await page.waitForTimeout(100);

    // Both should still be selected and rotated
    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Place a new item (should deselect others and select new one)
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(3);

    // Only the new item should be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(1);

    // Select all again and delete
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);
    expect(await page.locator('.placed-item.selected').count()).toBe(3);

    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);

    // All items should be deleted
    expect(await gridPage.getPlacedItemCount()).toBe(0);
  });

  test('Clicking empty grid area deselects all items', async ({ page }) => {
    // Place two items
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);
    await page.waitForTimeout(100);
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 2, 4, 4);
    await page.waitForTimeout(100);

    expect(await gridPage.getPlacedItemCount()).toBe(2);

    // Select all items
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(50);

    expect(await page.locator('.placed-item.selected').count()).toBe(2);

    // Click empty grid area
    await gridPage.clickEmptyGridArea();
    await page.waitForTimeout(50);

    // No items should be selected
    expect(await page.locator('.placed-item.selected').count()).toBe(0);
  });
});
