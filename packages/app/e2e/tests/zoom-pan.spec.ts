import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { dragToGridCell } from '../utils/drag-drop';

async function ctrlWheel(page: Page, deltaY: number) {
  const viewport = page.locator('[data-testid="preview-viewport"]');
  await viewport.hover();
  const box = await viewport.boundingBox();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.evaluate(
    ({ cx, cy, deltaY }) => {
      const el = document.elementFromPoint(cx, cy);
      if (!el) throw new Error(`No element at (${cx}, ${cy})`);
      el.dispatchEvent(
        new WheelEvent('wheel', { deltaY, ctrlKey: true, bubbles: true, cancelable: true }),
      );
    },
    { cx, cy, deltaY },
  );
  await page.waitForTimeout(50);
}

test.describe('Zoom and Pan Controls', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test.describe('Zoom Control Buttons', () => {
    test('zoom controls toolbar is visible', async ({ page }) => {
      const toolbar = page.locator('[role="toolbar"]');
      await expect(toolbar).toBeVisible();
    });

    test('displays 100% at default zoom', async ({ page }) => {
      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('100%');
    });

    test('zoom in button increases zoom level', async ({ page }) => {
      const zoomInBtn = page.getByLabel('Zoom in');
      await zoomInBtn.click();

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('110%');
    });

    test('zoom out button decreases zoom level', async ({ page }) => {
      const zoomOutBtn = page.getByLabel('Zoom out');
      await zoomOutBtn.click();

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('90%');
    });

    test('reset button returns to 100%', async ({ page }) => {
      // Zoom in first
      const zoomInBtn = page.getByLabel('Zoom in');
      await zoomInBtn.click();
      await zoomInBtn.click();

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('120%');

      // Reset
      const resetBtn = page.getByLabel('Reset zoom');
      await resetBtn.click();

      await expect(zoomLevel).toHaveText('100%');
    });

    test('fit to screen button adjusts zoom', async ({ page }) => {
      const fitBtn = page.getByLabel('Fit to screen');
      await fitBtn.click();

      // Zoom should change from 100% (exact value depends on viewport)
      const zoomLevel = page.locator('.zoom-level');
      const text = await zoomLevel.textContent();
      expect(text).toBeTruthy();
      expect(text).toMatch(/^\d+%$/);
    });

    test('zoom in button disabled at max zoom (400%)', async ({ page }) => {
      const zoomInBtn = page.getByLabel('Zoom in');

      // Click zoom in until button becomes disabled
      for (let i = 0; i < 35; i++) {
        if (await zoomInBtn.isDisabled()) break;
        await zoomInBtn.click();
      }

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('400%');
      await expect(zoomInBtn).toBeDisabled();
    });

    test('zoom out button disabled at min zoom (25%)', async ({ page }) => {
      const zoomOutBtn = page.getByLabel('Zoom out');

      // Click zoom out until button becomes disabled
      for (let i = 0; i < 10; i++) {
        if (await zoomOutBtn.isDisabled()) break;
        await zoomOutBtn.click();
      }

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('25%');
      await expect(zoomOutBtn).toBeDisabled();
    });
  });

  test.describe('Keyboard Zoom Shortcuts', () => {
    test('+/= key zooms in', async ({ page }) => {
      await page.keyboard.press('=');

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('110%');
    });

    test('- key zooms out', async ({ page }) => {
      await page.keyboard.press('-');

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('90%');
    });

    test('Ctrl+0 resets zoom', async ({ page }) => {
      // Zoom in first
      await page.keyboard.press('=');
      await page.keyboard.press('=');

      const zoomLevel = page.locator('.zoom-level');
      await expect(zoomLevel).toHaveText('120%');

      // Reset with Ctrl+0
      await page.keyboard.press('Control+0');

      await expect(zoomLevel).toHaveText('100%');
    });
  });

  test.describe('Wheel Zoom', () => {
    test('ctrl+scroll up zooms in', async ({ page }) => {
      await ctrlWheel(page, -200);

      const zoomLevel = page.locator('.zoom-level');
      const text = await zoomLevel.textContent();
      const percent = parseInt(text!.replace('%', ''), 10);
      expect(percent).toBeGreaterThan(100);
    });

    test('ctrl+scroll down zooms out', async ({ page }) => {
      await ctrlWheel(page, 200);

      const zoomLevel = page.locator('.zoom-level');
      const text = await zoomLevel.textContent();
      const percent = parseInt(text!.replace('%', ''), 10);
      expect(percent).toBeLessThan(100);
    });
  });

  test.describe('CSS Transform', () => {
    test('zoom applies CSS scale transform', async ({ page }) => {
      const zoomInBtn = page.getByLabel('Zoom in');
      await zoomInBtn.click();

      const content = page.locator('.preview-content');
      const transform = await content.evaluate((el) => el.style.transform);
      expect(transform).toContain('scale(1.1)');
    });

    test('reset returns transform to default', async ({ page }) => {
      // Zoom in
      const zoomInBtn = page.getByLabel('Zoom in');
      await zoomInBtn.click();

      // Reset
      const resetBtn = page.getByLabel('Reset zoom');
      await resetBtn.click();

      const content = page.locator('.preview-content');
      const transform = await content.evaluate((el) => el.style.transform);
      // At default zoom (1x, no pan), no inline transform is applied
      expect(transform).toBe('');
    });
  });

  test.describe('Drag and Drop with Zoom', () => {
    test('drag and drop still works when zoomed in', async ({ page }) => {
      // Zoom in
      const zoomInBtn = page.getByLabel('Zoom in');
      await zoomInBtn.click();
      await zoomInBtn.click();

      // Place an item
      const firstItem = libraryPage.libraryItems.first();
      await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

      // Should have 1 item placed
      expect(await gridPage.getPlacedItemCount()).toBe(1);
    });

    test('drag and drop still works when zoomed out', async ({ page }) => {
      // Zoom out
      const zoomOutBtn = page.getByLabel('Zoom out');
      await zoomOutBtn.click();
      await zoomOutBtn.click();

      // Place an item
      const firstItem = libraryPage.libraryItems.first();
      await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

      // Should have 1 item placed
      expect(await gridPage.getPlacedItemCount()).toBe(1);
    });
  });
});
