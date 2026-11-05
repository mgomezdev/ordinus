import { test, expect } from '@playwright/test';

const NEW_CUSTOMER_LABEL = '+ New customer…';

test.describe('Customer selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gridfinity-walkthrough-seen', 'true');
    });
    await page.goto('/');
    await page.locator('#customer-select').waitFor({ state: 'visible' });
  });

  test('creates a customer, selects it, and remembers it across reloads', async ({ page }) => {
    const name = `E2E Customer ${Date.now()}`;
    await page.locator('#customer-select').selectOption({ label: NEW_CUSTOMER_LABEL });
    await page.getByPlaceholder('New customer name').fill(name);
    await page.getByRole('button', { name: 'Create customer' }).click();

    await expect(page.locator('#customer-select option:checked')).toHaveText(name);

    await page.reload();
    await expect(page.locator('#customer-select option:checked')).toHaveText(name);
  });

  test('cancelling creation does not create a customer', async ({ page }) => {
    await page.locator('#customer-select').selectOption({ label: NEW_CUSTOMER_LABEL });
    await page.getByPlaceholder('New customer name').fill('Never saved');
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.locator('#customer-select')).toBeVisible();
    await expect(page.locator('#customer-select option', { hasText: 'Never saved' })).toHaveCount(0);
  });

  test('clearing the selection returns to none', async ({ page }) => {
    const select = page.locator('#customer-select');
    const value = await select.locator('option:not([value=""]):not([value="__new__"])').first().getAttribute('value');
    test.skip(!value, 'no seeded customers');
    await select.selectOption(value!);
    await select.selectOption('');
    await expect(select.locator('option:checked')).toHaveText('— None —');
  });
});
