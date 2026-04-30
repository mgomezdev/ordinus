import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';

test.describe('Export PDF', () => {
  test('button is disabled when grid is empty', async ({ page }) => {
    const grid = new GridPage(page);
    await grid.goto();
    const btn = page.getByRole('button', { name: 'Export PDF' });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('button is enabled after placing an item', async ({ page }) => {
    const grid = new GridPage(page);
    await grid.goto();
    await grid.placeFirstLibraryItem();
    const btn = page.getByRole('button', { name: 'Export PDF' });
    await expect(btn).toBeEnabled();
  });

  test('clicking Export PDF triggers a download', async ({ page }) => {
    const grid = new GridPage(page);
    await grid.goto();
    await grid.placeFirstLibraryItem();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export PDF' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });
});
