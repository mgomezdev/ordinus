import { test, expect } from '@playwright/test';

// Feature tests inherit the real admin login; these start without any cookies.
test.use({ storageState: { cookies: [], origins: [] }, trace: 'off', video: 'off', screenshot: 'off' });

test('anonymous visitors cannot access private data and can sign in and out', async ({ page }) => {
  expect((await page.request.get('/api/v1/customers')).status()).toBe(401);
  expect((await page.request.get('/api/v1/images/ref/private.png')).status()).toBe(401);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Ordinus' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid username or password');
  await page.getByLabel('Password', { exact: true }).fill(process.env.ORDINUS_E2E_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  expect((await page.request.get('/api/v1/customers')).status()).toBe(200);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Ordinus' })).toBeVisible();
  expect((await page.request.get('/api/v1/customers')).status()).toBe(401);
});
