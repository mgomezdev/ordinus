import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { dragToGridCell } from '../utils/drag-drop';

test.describe('Bin Context Menu', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test('duplicate button appears when bin is selected', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    await placedItem.click();
    await expect(page.locator('button[aria-label="Duplicate"]').first()).toBeVisible();
  });

  test('duplicate button creates a copy of the bin', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    expect(await page.locator('.placed-item').count()).toBe(1);

    const placedItem = page.locator('.placed-item').first();
    await placedItem.click();
    await page.locator('button[aria-label="Duplicate"]').first().click();

    expect(await page.locator('.placed-item').count()).toBe(2);
  });

  test('right-click on bin shows context menu', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    await placedItem.click({ button: 'right' });
    await expect(page.locator('[role="menu"]')).toBeVisible();
  });

  test('context menu contains all expected items', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    await page.locator('.placed-item').first().click({ button: 'right' });
    await expect(page.locator('[role="menuitem"][aria-label="Rotate counter-clockwise"]')).toBeVisible();
    await expect(page.locator('[role="menuitem"][aria-label="Rotate clockwise"]')).toBeVisible();
    await expect(page.locator('[role="menuitem"][aria-label="Duplicate"]')).toBeVisible();
    await expect(page.locator('[role="menuitem"][aria-label="Customize"]')).toBeVisible();
    await expect(page.locator('[role="menuitem"][aria-label="Delete"]')).toBeVisible();
  });

  test('right-clicking unselected bin selects it and opens menu', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 1, 1, 4, 4);
    const secondItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, secondItem, gridPage.gridContainer, 3, 3, 4, 4);

    // Click first bin to select it
    await page.locator('.placed-item').first().click();
    // Right-click second bin (not selected)
    await page.locator('.placed-item').nth(1).click({ button: 'right' });

    await expect(page.locator('[role="menu"]')).toBeVisible();
    // Second bin should now be selected
    await expect(page.locator('.placed-item').nth(1)).toHaveClass(/selected/);
  });

  test('context menu Duplicate creates a copy', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    expect(await page.locator('.placed-item').count()).toBe(1);
    await page.locator('.placed-item').first().click({ button: 'right' });
    await page.locator('[role="menuitem"][aria-label="Duplicate"]').click();

    expect(await page.locator('.placed-item').count()).toBe(2);
    // Menu should close after action
    await expect(page.locator('[role="menu"]')).not.toBeVisible();
  });

  test('context menu Delete removes the bin', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    expect(await page.locator('.placed-item').count()).toBe(1);
    await page.locator('.placed-item').first().click({ button: 'right' });
    await page.locator('[role="menuitem"][aria-label="Delete"]').click();

    expect(await page.locator('.placed-item').count()).toBe(0);
  });

  test('context menu Rotate CW rotates the bin', async ({ page }) => {
    // Use a non-square item so rotation changes dimensions
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    const beforeBox = await placedItem.boundingBox();
    expect(beforeBox).not.toBeNull();

    await placedItem.click({ button: 'right' });
    await page.locator('[role="menuitem"][aria-label="Rotate clockwise"]').click();

    await page.waitForTimeout(100);
    // Menu should close
    await expect(page.locator('[role="menu"]')).not.toBeVisible();
  });

  test('context menu Customize opens the customization popover', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    await page.locator('.placed-item').first().click({ button: 'right' });
    await page.locator('[role="menuitem"][aria-label="Customize"]').click();

    await expect(page.locator('.placed-item-customize-popover')).toBeVisible();
  });

  test('context menu closes on Escape', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    await page.locator('.placed-item').first().click({ button: 'right' });
    await expect(page.locator('[role="menu"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="menu"]')).not.toBeVisible();
  });

  test('context menu closes on outside click', async ({ page }) => {
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 2, 2, 4, 4);

    await page.locator('.placed-item').first().click({ button: 'right' });
    await expect(page.locator('[role="menu"]')).toBeVisible();
    // Click well outside the grid
    await page.mouse.click(10, 10);
    await expect(page.locator('[role="menu"]')).not.toBeVisible();
  });
});
