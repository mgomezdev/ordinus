import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { SavedConfigsPage } from '../pages/SavedConfigsPage';
import type { LiveSnapshot } from '@gridfinity/shared';
test.use({ trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 10_000 });

test('client and organizer use workspace drag, overlap flags, library placement and atomic selection actions', async ({ page: owner, request, browser, baseURL }) => {
  test.setTimeout(90_000);
  await owner.setViewportSize({ width: 1440, height: 1100 });
  const created = await request.post('/api/v1/layouts', { data: { name: `Placement ${randomUUID().slice(0, 8)}`, gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168,
    placedItems: [0, 4].map(x => ({ itemId: 'bins_standard:bin-1x1', x, y: 0, width: 2, height: 2, rotation: 0 })) } });
  const id = (await created.json()).data.id as number;
  const link = await (await request.post(`/api/v1/layouts/${id}/guest-links`, { data: { expiresInHours: 1, allowEdit: true, libraryId: 'bins_standard' } })).json() as { id: string; secret: string };
  const client = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 1100 } });
  const current = async () => (await (await request.get(`/api/v1/layouts/${id}/live/snapshot`)).json()) as LiveSnapshot;
  async function drag(page: Page, number: number, x: number, y: number, overlap = false) {
    const bin = page.getByRole('button', { name: new RegExp(`^Select bin ${number}:`) }); await bin.scrollIntoViewIfNeeded();
    await expect(bin).toHaveAttribute('aria-disabled', 'false');
    const box = (await bin.boundingBox())!, grid = (await page.getByRole('group', { name: 'Drawer layout' }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(grid.x + (x + 0.2) / 8 * grid.width, grid.y + (y + 0.2) / 8 * grid.height, { steps: 6 });
    if (overlap) await expect(page.locator('.snap-preview--invalid')).toHaveCount(1);
    await page.mouse.up();
  }
  try {
    const guest = await client.newPage();
    await owner.goto(`/collaborate/${id}`); await expect(owner.locator('.live-status')).toContainText('Live · Saved');
    await guest.goto(`/guest/${link.id}#${link.secret}`); await guest.getByRole('button', { name: 'Open preview' }).click();
    await expect(guest.locator('.live-status')).toContainText('Live · Saved');
    await drag(guest, 1, 4, 0, true);
    await expect(owner.locator('.live-bin-invalid')).toHaveCount(2); await expect(guest.locator('.live-bin-invalid')).toHaveCount(2);
    expect((await current()).layout.bins.map(bin => bin.x)).toEqual([4, 4]);
    // Bin 2 is the topmost bin where the two footprints overlap.
    await drag(owner, 2, 0, 2);
    await expect(guest.locator('.live-bin-invalid')).toHaveCount(0); await expect(owner.locator('.live-bin-invalid')).toHaveCount(0);
    // A selected group moves as one revision, retaining relative positions.
    await guest.getByRole('button', { name: /^Bin 1:/ }).click();
    await guest.getByRole('button', { name: /^Bin 2:/ }).click({ modifiers: ['Control'] });
    await expect(guest.getByText('2 selected', { exact: true })).toBeVisible();
    const before = (await current()).revision;
    await drag(guest, 2, 0, 3);
    await expect.poll(async () => (await current()).revision).toBe(before + 1);
    expect((await current()).layout.bins.map(bin => bin.y)).toEqual([1, 3]);
    await expect.poll(() => owner.getByRole('button', { name: /^Select bin 1:/ }).evaluate(el => (el as HTMLElement).style.top)).toBe('12.5%');
    // Duplicate retains frozen bin settings; right-click uses the workspace menu.
    await guest.getByRole('button', { name: /^Select bin 1:/ }).click({ button: 'right' });
    await guest.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
    await expect(owner.getByRole('button', { name: /^Select bin/ })).toHaveCount(3);
    await expect(guest.locator('.live-status')).toContainText('Live · Saved');
    // Phone library opens over the canvas and closes when the drag starts.
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.getByRole('group', { name: 'Drawer layout' }).scrollIntoViewIfNeeded();
    await guest.getByRole('button', { name: 'Bin library', exact: true }).click();
    // Select a known 1x1 footprint from the approved library.
    const small = (await current()).catalog.find(bin => bin.width === 1 && bin.depth === 1)!;
    const card = guest.getByRole('button', { name: `Drag ${small.name} into drawer`, exact: true }); await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!, grid = (await guest.getByRole('group', { name: 'Drawer layout' }).boundingBox())!;
    await guest.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await guest.mouse.down();
    await guest.mouse.move(grid.x + grid.width * 0.8, grid.y + grid.height * 0.8, { steps: 8 });
    await expect(guest.getByRole('button', { name: 'Close library' })).not.toBeVisible(); await guest.mouse.up();
    await expect(owner.getByRole('button', { name: /^Select bin/ })).toHaveCount(4);
    expect((await guest.request.get('/api/v1/libraries')).status()).toBe(401);
  } finally { await client.close(); await request.delete(`/api/v1/layouts/${id}`); }
});

test('a phone client reconnects to current state and safely retries a lost acknowledgement', async ({ page: owner, request, browser, baseURL }) => {
  test.setTimeout(60_000);
  const created = await request.post('/api/v1/layouts', { data: { name: `Reconnect ${randomUUID().slice(0, 8)}`, gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168,
    placedItems: [{ itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 2, height: 2, rotation: 0 }] } });
  const id = (await created.json()).data.id as number;
  const link = await (await request.post(`/api/v1/layouts/${id}/guest-links`, { data: { expiresInHours: 1, allowEdit: true, libraryId: 'bins_standard' } })).json() as { id: string; secret: string };
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {}, viewport: { width: 390, height: 844 } });
  try {
    await owner.goto(`/collaborate/${id}`); await expect(owner.locator('.live-status')).toContainText('Live · Saved');
    const guest = await context.newPage(); await guest.goto(`/guest/${link.id}#${link.secret}`);
    await guest.getByRole('button', { name: 'Open preview' }).click(); await expect(guest.locator('.live-status')).toContainText('Live · Saved');
    await guest.getByRole('button', { name: /^Bin 1:/ }).click();
    const guestBin = guest.getByRole('region', { name: 'Selected bin' });
    await guestBin.getByLabel('X position', { exact: true }).fill('1.5');
    let writes = 0; guest.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/commands')) writes++; });
    await context.setOffline(true);
    await expect(guest.locator('.live-status')).toContainText('Reconnecting');
    await expect(guestBin.getByRole('button', { name: 'Move bin', exact: true })).toBeDisabled();
    await owner.getByRole('button', { name: /^Bin 1:/ }).click();
    const ownerBin = owner.getByRole('region', { name: 'Selected bin' });
    await ownerBin.getByLabel('X position', { exact: true }).fill('0.5'); await ownerBin.getByLabel('Y position', { exact: true }).fill('1');
    await ownerBin.getByRole('button', { name: 'Move bin', exact: true }).click();
    await expect.poll(() => owner.getByRole('button', { name: /^Select bin 1:/ }).evaluate(el => (el as HTMLElement).style.top)).toBe('25%');
    await context.setOffline(false);
    await expect(guest.locator('.live-status')).toContainText('Live · Saved', { timeout: 15000 });
    await expect.poll(() => guest.getByRole('button', { name: /^Select bin 1:/ }).evaluate(el => (el as HTMLElement).style.top)).toBe('25%');
    await expect(guestBin.getByLabel('X position', { exact: true })).toHaveValue('1.5'); expect(writes).toBe(0);
    await guestBin.getByRole('button', { name: 'Use latest revision for these values' }).click();
    const before = (await (await request.get(`/api/v1/layouts/${id}/live/snapshot`)).json()).revision as number;
    const commandIds: string[] = [];
    const pattern = '**/api/v1/guest/*/live/commands';
    await guest.route(pattern, async route => { commandIds.push((route.request().postDataJSON() as { commandId: string }).commandId); await route.fetch(); await route.abort('failed'); });
    await guestBin.getByRole('button', { name: 'Move bin', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Retry last change' })).toBeVisible();
    await expect.poll(() => owner.getByRole('button', { name: /^Select bin 1:/ }).evaluate(el => (el as HTMLElement).style.left)).toBe('37.5%');
    await guest.unroute(pattern);
    guest.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/commands')) commandIds.push((req.postDataJSON() as { commandId: string }).commandId); });
    await guest.getByRole('button', { name: 'Retry last change' }).click();
    await expect(guest.getByRole('button', { name: 'Retry last change' })).toHaveCount(0);
    expect(commandIds).toHaveLength(2); expect(commandIds[0]).toBe(commandIds[1]);
    expect((await (await request.get(`/api/v1/layouts/${id}/live/snapshot`)).json()).revision).toBe(before + 1);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await context.close(); await request.delete(`/api/v1/layouts/${id}`); }
});

test('organizer and client configure the same drawer live, with conflicts and revocation', async ({ page: owner, request, browser, baseURL }) => {
  test.setTimeout(90_000);
  const name = `Live ${randomUUID().slice(0, 8)}`;
  const created = await request.post('/api/v1/layouts', { data: { name, gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168,
    placedItems: [0, 4].map(x => ({ itemId: 'bins_standard:bin-1x1', x, y: 0, width: 2, height: 2, rotation: 0 })) } });
  expect(created.status()).toBe(201); const id = (await created.json()).data.id as number;
  const guestContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: {} });
  const stale = await owner.context().newPage();
  await owner.addInitScript(() => localStorage.setItem('gridfinity-walkthrough-seen', 'true'));
  await stale.addInitScript(() => localStorage.setItem('gridfinity-walkthrough-seen', 'true'));
  try {
    const staleConfigs = new SavedConfigsPage(stale); await staleConfigs.goto(); await staleConfigs.editButton(name).click();
    await expect(stale.getByRole('navigation', { name: 'breadcrumb' })).toContainText(name);
    const configs = new SavedConfigsPage(owner); await configs.goto(); await configs.editButton(name).click();
    const share = owner.getByRole('region', { name: 'Share workspace' });
    await share.getByRole('button', { name: 'Share preview', exact: true }).click();
    await share.getByLabel('Allow client editing (live)').check();
    await share.getByLabel('Approved bin library').selectOption('bins_standard');
    await share.getByRole('button', { name: 'Create collaboration link' }).click();
    const invitation = await share.getByLabel('Preview link', { exact: true }).inputValue();
    await share.getByRole('link', { name: 'Open live editor' }).click();
    await expect(owner).toHaveURL(new RegExp(`/collaborate/${id}$`));
    await expect(owner.locator('.live-status')).toContainText('Live · Saved');
    const guest = await guestContext.newPage(); await guest.goto(invitation);
    await guest.getByLabel('Your name (optional)').fill('Alex'); await guest.getByRole('button', { name: 'Open preview' }).click();
    await expect(guest.locator('.live-status')).toContainText('Live · Saved');
    await expect(owner.locator('.live-status')).toContainText('Alex');
    await expect(guest.getByRole('navigation')).toHaveCount(0);
    const current = async () => (await (await request.get(`/api/v1/layouts/${id}/live/snapshot`)).json()) as LiveSnapshot;

    // Leave a local owner draft open while the client commits a newer change.
    await owner.getByRole('button', { name: /^Bin 1:/ }).click();
    const ownerBin = owner.getByRole('region', { name: 'Selected bin' });
    await ownerBin.getByLabel('X position', { exact: true }).fill('0.5');
    await guest.getByRole('button', { name: /^Bin 1:/ }).click();
    const guestBin = guest.getByRole('region', { name: 'Selected bin' });
    await guestBin.getByLabel('X position', { exact: true }).fill('1'); await guestBin.getByLabel('Y position', { exact: true }).fill('1');
    await guestBin.getByRole('button', { name: 'Move bin', exact: true }).click();
    await expect.poll(() => owner.getByRole('button', { name: /^Select bin 1:/ }).evaluate(el => (el as HTMLElement).style.left)).toBe('25%');
    await ownerBin.getByRole('button', { name: 'Move bin', exact: true }).click();
    await expect(owner.getByRole('alert')).toContainText('Someone changed this drawer');
    await expect(ownerBin.getByLabel('X position', { exact: true })).toHaveValue('0.5');
    await ownerBin.getByRole('button', { name: 'Use latest revision for these values' }).click();
    await ownerBin.getByRole('button', { name: 'Move bin', exact: true }).click();
    await expect.poll(() => guest.getByRole('button', { name: /^Select bin 1:/ }).evaluate(el => (el as HTMLElement).style.left)).toBe('12.5%');

    // Owner drag is one committed command; the guest receives it without reload.
    const bin2 = owner.getByRole('button', { name: /^Select bin 2:/ });
    await bin2.scrollIntoViewIfNeeded();
    const box = (await bin2.boundingBox())!;
    const grid = (await owner.getByRole('group', { name: 'Drawer layout' }).boundingBox())!;
    await owner.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await owner.mouse.down();
    await owner.mouse.move(box.x + grid.width / 32, grid.y + grid.height / 4 + grid.height / 32, { steps: 6 }); await owner.mouse.up();
    await expect.poll(() => guest.getByRole('button', { name: /^Select bin 2:/ }).evaluate(el => (el as HTMLElement).style.top)).toBe('25%');

    await guest.getByText('Add a bin', { exact: true }).click();
    const add = guest.getByRole('form', { name: 'Add bin' });
    await expect(add).toBeVisible();
    const item = (await current()).catalog.find(item => item.width === 1 && item.depth === 1)!;
    await add.getByRole('combobox').selectOption(item.key);
    await add.getByLabel('Add X position').fill('0'); await add.getByLabel('Add Y position').fill('2');
    await add.getByRole('button', { name: 'Place bin' }).click();
    await expect(owner.getByRole('button', { name: /^Select bin/ })).toHaveCount(3);

    await owner.getByRole('button', { name: /^Bin 1:/ }).click();
    await ownerBin.getByLabel('Height units (7 mm)').fill('6'); await ownerBin.getByLabel('Lip style').selectOption('none');
    await ownerBin.getByRole('button', { name: 'Apply bin options' }).click();
    await expect.poll(async () => (await current()).bins[0].height).toBe(6);
    await expect(guest.getByRole('button', { name: /^Bin 1:/ })).toContainText('42 mm tall');

    await owner.getByText('Drawer dimensions and spacers', { exact: true }).click();
    const drawer = owner.getByRole('form', { name: 'Drawer dimensions' });
    await drawer.getByLabel('Drawer width (mm)').fill('210'); await drawer.getByLabel('Horizontal spacers').selectOption('symmetrical');
    await drawer.getByRole('button', { name: 'Apply drawer changes' }).click();
    await expect(guest.getByText('210 × 168 mm', { exact: true })).toBeVisible();

    await guest.getByRole('button', { name: /^Bin 3:/ }).click();
    await guest.getByRole('button', { name: 'Remove bin', exact: true }).click();
    await expect(owner.getByRole('button', { name: /^Select bin/ })).toHaveCount(2);
    expect((await guest.request.get('/api/v1/customers')).status()).toBe(401);
    await owner.getByRole('link', { name: 'BOM', exact: true }).click();
    await expect(owner).toHaveURL(/\/order$/);
    await expect(owner.locator('.app-status-bar .status-count')).toContainText('2 items');
    await expect(owner.locator('.app-status-bar .status-count')).toContainText('5×4 grid');
    await owner.goto(`/collaborate/${id}`);
    await expect(owner.locator('.live-status')).toContainText('Live · Saved');

    const staleSave = stale.waitForResponse(response => response.url().endsWith(`/layouts/${id}`) && response.request().method() === 'PUT');
    await stale.getByRole('button', { name: 'Save Changes', exact: true }).click();
    expect((await staleSave).status()).toBe(409);
    expect((await current()).layout.widthMm).toBe(210);
    await owner.getByRole('button', { name: 'Close live guest access' }).click();
    await expect(guest.getByRole('heading', { name: 'Session unavailable' })).toBeVisible({ timeout: 7000 });
    await expect(guest.getByRole('group', { name: 'Drawer layout' })).toHaveCount(0);
    await owner.getByRole('button', { name: 'Back to workspace' }).click();
    await expect(owner.getByRole('spinbutton', { name: 'Width mm', exact: true })).toHaveValue('210');
  } finally { await stale.close(); await guestContext.close(); await request.delete(`/api/v1/layouts/${id}`); }
});
