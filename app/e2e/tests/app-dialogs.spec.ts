import { test, expect } from '@playwright/test';

test.describe('App dialogs', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gridfinity-walkthrough-seen', 'true');
    });
    await page.goto('/');
    await page.locator('.grid-container').waitFor({ state: 'visible' });
  });

  test('keyboard shortcuts help opens from the toolbar and the ? key', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });

    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    // Focus moves in the same effect pass that attaches the Escape listener.
    await expect(dialog).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.keyboard.press('Shift+Slash');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });

  test('service settings opens, shows fields, and cancels without saving', async ({ page }) => {
    let patched = false;
    await page.route('**/api/v1/settings', async (route) => {
      if (route.request().method() === 'PATCH') patched = true;
      await route.continue();
    });

    await page.getByRole('button', { name: 'Service settings' }).click();
    const heading = page.getByRole('heading', { name: 'Service Settings' });
    await expect(heading).toBeVisible();
    await expect(page.getByLabel('Themis URL')).toBeVisible();

    await page.getByLabel('Laminus URL').fill('http://example.invalid:5000');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(heading).toBeHidden();
    expect(patched).toBe(false);
  });
});
