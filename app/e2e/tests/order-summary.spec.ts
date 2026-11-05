import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { BOMPage } from '../pages/BOMPage';

test.describe('Order Summary (BOM page)', () => {
  let gridPage: GridPage;
  let bomPage: BOMPage;

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gridfinity-walkthrough-seen', 'true');
      localStorage.removeItem('gridfinity-bom-extras');
    });
    gridPage = new GridPage(page);
    bomPage = new BOMPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
  });

  test('shows the empty state and drawer info with nothing placed', async ({ page }) => {
    await bomPage.goToBOM();
    await expect(page.locator('.order-empty')).toBeVisible();
    await expect(page.locator('.order-drawer-dims')).toHaveText('168mm × 168mm');
    await expect(page.locator('.order-capacity .order-cap-label')).toHaveText('0% used');
  });

  test('prompts to save an unsaved layout and opens the save dialog', async ({ page }) => {
    await bomPage.goToBOM();
    await page.getByRole('button', { name: 'Save Now' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('lists placed items and updates capacity', async ({ page }) => {
    await gridPage.placeFirstLibraryItem();
    await bomPage.goToBOM();
    expect(await bomPage.getItemCount()).toBe(1);
    await expect(page.locator('.order-capacity .order-cap-label')).not.toHaveText('0% used');
  });

  test('adds, adjusts and removes extras, reflected in the full order', async ({ page }) => {
    await gridPage.placeFirstLibraryItem();
    await bomPage.goToBOM();

    await bomPage.addFirstExtra();
    await expect(bomPage.extrasRows).toHaveCount(1);
    await expect(bomPage.fullOrderQuantities.first()).toHaveText('×2');

    await page.getByRole('button', { name: 'Increase quantity' }).click();
    await expect(page.getByLabel('Extra quantity')).toHaveValue('2');
    await expect(bomPage.fullOrderQuantities.first()).toHaveText('×3');

    await page.getByRole('button', { name: /from extras$/ }).click();
    await expect(bomPage.extrasRows).toHaveCount(0);
  });

  test('extras survive navigating back to the workspace', async ({ page }) => {
    await gridPage.placeFirstLibraryItem();
    await bomPage.goToBOM();
    await bomPage.addFirstExtra();

    await bomPage.goToWorkspace();
    await gridPage.waitForGridReady();
    await bomPage.goToBOM();
    await expect(bomPage.extrasRows).toHaveCount(1);
    await expect(page.getByLabel('Extra quantity')).toHaveValue('1');
  });
});
