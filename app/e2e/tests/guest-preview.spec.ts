import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

// Invitations and guest cookies stay out of failure traces/artifacts.
test.use({ trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 10_000 });

test('owner shares one drawer; a clean guest can inspect it and photos, then loses access when closed', async ({ page, request, browser, baseURL }) => {
  test.setTimeout(60_000);
  const name = `Guest preview ${randomUUID().slice(0, 8)}`;
  const imageBuffer = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#c9d8de' } }).png().toBuffer();
  const uploaded = await request.post('/api/v1/ref-images', { multipart: { image: { name: 'Drawer reference', mimeType: 'image/png', buffer: imageBuffer } } });
  expect(uploaded.status()).toBe(201);
  const imageId = (await uploaded.json()).data.id as number;
  const created = await request.post('/api/v1/layouts', { data: {
    name, description: 'Operator-only notes', gridX: 4, gridY: 3, gridResolution: 2, widthMm: 178, depthMm: 136, spacerHorizontal: 'symmetrical', spacerVertical: 'one-sided',
    placedItems: [
      { itemId: 'bins_standard:bin-2x1', x: 0, y: 0, width: 4, height: 2, rotation: 0 },
      { itemId: 'bins_standard:bin-1x2', x: 4, y: 0, width: 2, height: 4, rotation: 0 },
    ],
    refImagePlacements: [{ refImageId: imageId, name: 'Drawer reference', x: 0, y: 0, width: 100, height: 100, opacity: 0.4, scale: 1, rotation: 0, isLocked: true }],
  } });
  expect(created.status()).toBe(201);
  const layoutId = (await created.json()).data.id as number;
  const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {}, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  try {
    await page.goto('/configs');
    const card = page.locator('.saved-config-card').filter({ hasText: name });
    await card.getByRole('button', { name: 'Share preview', exact: true }).click();
    await card.getByRole('button', { name: 'Create preview link' }).click();
    const invitation = await card.getByLabel('Preview link', { exact: true }).inputValue();
    expect(invitation).toContain('#');
    const guestPage = await guest.newPage();
    const requested: string[] = [];
    guestPage.on('request', req => { if (req.url().includes('/api/v1/')) requested.push(new URL(req.url()).pathname); });
    await guestPage.goto(invitation);
    await expect(guestPage.getByRole('button', { name: 'Open preview' })).toBeVisible();
    expect(requested).toHaveLength(0);
    await guestPage.getByRole('button', { name: 'Open preview' }).click();
    await expect(guestPage.getByRole('heading', { name, exact: true })).toBeVisible();
    expect(new URL(guestPage.url()).hash).toBe('');
    await expect(guestPage.getByText('Read-only preview', { exact: true })).toBeVisible();
    await expect(guestPage.getByRole('button', { name: /Select bin/ })).toHaveCount(2);
    await expect(guestPage.getByRole('img', { name: 'Drawer reference' })).toBeVisible();
    await expect.poll(() => guestPage.getByRole('img', { name: 'Drawer reference' }).evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await guestPage.getByRole('button', { name: /Select bin 1:/ }).tap();
    await expect(guestPage.getByRole('button', { name: /Bin 1:/ })).toHaveAttribute('aria-pressed', 'true');
    await guestPage.getByLabel('Show reference photos').uncheck();
    await expect(guestPage.getByRole('img', { name: 'Drawer reference' })).toHaveCount(0);
    expect(await guestPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(guestPage.getByRole('navigation')).toHaveCount(0);
    expect(requested.every(path => path.startsWith('/api/v1/guest/'))).toBe(true);
    expect((await guestPage.request.get(`/api/v1/layouts/${layoutId}`)).status()).toBe(401);
    expect((await guestPage.request.get('/api/v1/customers')).status()).toBe(401);
    await guestPage.reload();
    await expect(guestPage.getByRole('heading', { name, exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Close access', exact: true }).click();
    await expect(card.getByRole('status')).toContainText('Access closed');
    await expect(guestPage.getByRole('heading', { name: 'Preview unavailable' })).toBeVisible({ timeout: 7000 });
    await expect(guestPage.getByRole('group', { name: 'Drawer layout' })).toHaveCount(0);
    await guestPage.goto(invitation);
    await guestPage.getByRole('button', { name: 'Open preview' }).click();
    await expect(guestPage.getByRole('heading', { name: 'Preview unavailable' })).toBeVisible();
  } finally {
    await guest.close();
    await request.delete(`/api/v1/layouts/${layoutId}`);
    await request.delete(`/api/v1/ref-images/${imageId}`);
  }
});

test('leaving clears guest access without closing the invitation', async ({ request, browser, baseURL }) => {
  test.setTimeout(60_000);
  const created = await request.post('/api/v1/layouts', { data: { name: 'Guest leave test', gridX: 2, gridY: 2, widthMm: 84, depthMm: 84, placedItems: [] } });
  expect(created.status()).toBe(201);
  const layoutId = (await created.json()).data.id as number;
  const link = await (await request.post(`/api/v1/layouts/${layoutId}/guest-links`, { data: { expiresInHours: 1 } })).json() as { id: string; secret: string };
  const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {} });
  try {
    const page = await guest.newPage();
    const url = `/guest/${link.id}#${link.secret}`;
    await page.goto(url); await page.getByRole('button', { name: 'Open preview' }).click();
    await expect(page.getByText('This drawer has no bins yet.')).toBeVisible();
    await page.getByRole('button', { name: 'Leave preview' }).click();
    await expect(page.getByRole('heading', { name: 'You left the preview' })).toBeVisible();
    expect((await page.request.get(`/api/v1/guest/${link.id}/view`)).status()).toBe(410);
    await page.goto(url); await page.getByRole('button', { name: 'Open preview' }).click();
    await expect(page.getByRole('heading', { name: 'Guest leave test' })).toBeVisible();
  } finally { await guest.close(); await request.delete(`/api/v1/layouts/${layoutId}`); }
});
