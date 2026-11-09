import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { SavedConfigsPage } from '../pages/SavedConfigsPage';

// Invitations and guest cookies stay out of failure traces/artifacts.
test.use({ trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 10_000 });

test('workspace sharing saves pending edits before opening and before creating a guest link', async ({ page, request, browser, baseURL }) => {
  const name = `Workspace share ${randomUUID().slice(0, 8)}`;
  const created = await request.post('/api/v1/layouts', { data: { name, gridX: 4, gridY: 4, widthMm: 168, depthMm: 168, placedItems: [] } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id as number;
  await page.addInitScript(() => localStorage.setItem('gridfinity-walkthrough-seen', 'true'));
  const guest = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {} });
  try {
    const configs = new SavedConfigsPage(page);
    await configs.goto(); await configs.editButton(name).click();
    await expect(page.getByRole('navigation', { name: 'breadcrumb' })).toContainText(name);
    await page.getByRole('spinbutton', { name: 'Width mm', exact: true }).fill('210');
    const share = page.getByRole('region', { name: 'Share workspace' });
    await share.getByRole('button', { name: 'Share preview', exact: true }).click();
    await expect(share.getByRole('button', { name: 'Create preview link' })).toBeVisible();
    expect((await (await request.get(`/api/v1/layouts/${id}`)).json()).data.widthMm).toBe(210);
    await page.getByRole('spinbutton', { name: 'Width mm', exact: true }).fill('252');
    await share.getByRole('button', { name: 'Create preview link' }).click();
    const invitation = await share.getByLabel('Preview link', { exact: true }).inputValue();
    const guestPage = await guest.newPage();
    await guestPage.goto(invitation); await guestPage.getByRole('button', { name: 'Open preview' }).click();
    await expect(guestPage.getByText(/252 × 168 mm/)).toBeVisible();
    expect((await (await request.get(`/api/v1/layouts/${id}`)).json()).data.widthMm).toBe(252);
    await page.route(`**/api/v1/layouts/${id}`, route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Save rejected' } }) }) : route.continue());
    const linksBefore = (await (await request.get(`/api/v1/layouts/${id}/guest-links`)).json()).data.length;
    await share.getByRole('button', { name: 'Create preview link' }).click();
    await expect(share.getByRole('alert').first()).toContainText('Could not save');
    expect((await (await request.get(`/api/v1/layouts/${id}/guest-links`)).json()).data).toHaveLength(linksBefore);
  } finally { await guest.close(); await request.delete(`/api/v1/layouts/${id}`); }
});

test('phone workspace can name, save and share a new configuration without leaving the workspace', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('gridfinity-walkthrough-seen', 'true'));
  await page.goto('/');
  const share = page.getByRole('region', { name: 'Share workspace' });
  const name = `Phone share ${randomUUID().slice(0, 8)}`;
  await share.getByRole('button', { name: 'Share preview', exact: true }).click();
  await share.getByLabel('Configuration name').fill(name);
  const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/layouts') && response.request().method() === 'POST');
  await share.getByRole('button', { name: 'Save and continue' }).click();
  const id = (await (await saved).json()).data.id as number;
  try {
    await share.getByRole('button', { name: 'Create preview link' }).click();
    await expect(share.getByLabel('Preview link', { exact: true })).toHaveValue(/\/guest\/.+#/);
    expect(page.url()).toMatch(/\/$/);
    expect((await (await request.get(`/api/v1/layouts/${id}`)).json()).data.name).toBe(name);
  } finally { await request.delete(`/api/v1/layouts/${id}`); }
});

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
