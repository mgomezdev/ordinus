import { test, expect } from '@playwright/test';

// Feature tests inherit the real admin login; these start without any cookies.
test.use({ storageState: { cookies: [], origins: [] }, trace: 'off', video: 'off', screenshot: 'off' });

test('reset form survives the session interval and returning from the logs', async ({ page }) => {
  await page.clock.install();
  let sessionChecks = 0;
  page.on('request', req => { if (req.url().endsWith('/api/v1/auth/session')) sessionChecks++; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Reset admin password', exact: true }).click();
  await page.getByRole('button', { name: 'Request reset code' }).click();
  await page.getByLabel('Reset code', { exact: true }).fill('partly-entered-code');
  await page.getByLabel('New password', { exact: true }).fill('eight123');
  await page.getByLabel('Confirm password', { exact: true }).fill('eight123');
  await page.clock.fastForward(31_000);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue('partly-entered-code');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('eight123');
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAttribute('minlength', '8');
  expect(sessionChecks).toBe(1);
});

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
