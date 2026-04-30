import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { BOMPage } from '../pages/BOMPage';

test.describe('Smoke Tests', () => {
  test('app loads successfully', async ({ page }) => {
    await page.goto('/');

    // Check that the header is visible
    await expect(page.locator('h1')).toContainText('Gridfinity');
  });

  test('grid preview renders with default dimensions', async ({ page }) => {
    const gridPage = new GridPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();

    // Grid should be visible
    await expect(gridPage.gridContainer).toBeVisible();

    // Grid should have cells
    const dimensions = await gridPage.getGridDimensions();
    expect(dimensions.columns).toBeGreaterThan(0);
    expect(dimensions.rows).toBeGreaterThan(0);
  });

  test('item library is visible and contains items', async ({ page }) => {
    const libraryPage = new LibraryPage(page);
    await page.goto('/');
    await libraryPage.waitForLibraryReady();

    // Library should be visible
    await expect(libraryPage.libraryContainer).toBeVisible();

    // Should have at least one item (default items)
    const itemCount = await libraryPage.getItemCount();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('bill of materials section is visible', async ({ page }) => {
    const bomPage = new BOMPage(page);
    await page.goto('/');
    await bomPage.goToBOM();

    // Order summary page should load (empty state when no items placed)
    await expect(page.locator('.order-empty, .order-bom-table')).toBeVisible();
  });

  test('unit toggle buttons are visible', async ({ page }) => {
    await page.goto('/');

    // Should see mm and in buttons in the unit toggle
    const unitToggle = page.locator('.unit-toggle-compact');
    await expect(unitToggle).toBeVisible();

    const buttons = unitToggle.locator('button');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.first()).toHaveText('mm');
    await expect(buttons.last()).toHaveText('in');
  });

  test('dimension inputs are functional', async ({ page }) => {
    const gridPage = new GridPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();

    // Get initial dimensions
    const initialDimensions = await gridPage.getGridDimensions();

    // Change width to a larger value
    await gridPage.setDimensions(252, 168);

    // Wait for grid to update
    await page.waitForTimeout(100);

    // Grid should have updated
    const newDimensions = await gridPage.getGridDimensions();
    expect(newDimensions.columns).toBeGreaterThanOrEqual(initialDimensions.columns);
  });
});
