import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import type { CuratedLibrary } from '../../../shared/src/curatedLibrary';
import { SimpleLayoutPage } from '../pages/SimpleLayoutPage';
import { SavedConfigsPage } from '../pages/SavedConfigsPage';

const test = base.extend<{ simple: SimpleLayoutPage; library: CuratedLibrary }>({
  library: async ({ request }, provide) => {
    const library: CuratedLibrary = { id: randomUUID(), name: `Kitchen ${randomUUID().slice(0, 8)}`, description: 'Simple silverware drawers', entries: [
      { id: 'fixed', name: 'Fixed tray', kind: 'fixed', sourceId: 'bins_standard:bin-3x2', width: 3, depth: 2 },
      { id: 'wrong', name: 'Wrong size', kind: 'fixed', sourceId: 'bins_standard:bin-2x4', width: 2, depth: 4 },
      { id: 'cup', name: 'Silverware bin', kind: 'parametric', generator: 'basic-cup', width: { min: 0.5, max: 20, step: 0.5 }, depth: { min: 0.5, max: 20, step: 0.5 }, defaults: { height: 4 }, groups: [{ id: 'height', name: 'Height', choices: [
        { id: 'short', name: 'Short', values: { height: 2 } }, { id: 'medium', name: 'Medium', values: { height: 4 } }, { id: 'tall', name: 'Tall', values: { height: 6, lip_style: 'none' } },
      ] }] },
    ] };
    // Existing standard bins use width/depth-specific ids; use an actual nonmatching source.
    const response = await request.get('/api/v1/libraries/bins_standard/items');
    const items = (await response.json()).data as { id: string; widthUnits: number; heightUnits: number }[];
    const wrong = items.find(i => i.widthUnits === 2 && i.heightUnits === 4) ?? items.find(i => i.widthUnits === 1 && i.heightUnits === 1);
    if (!wrong) throw new Error('Standard library needs a nonmatching fixture');
    library.entries[1] = { id: 'wrong', name: 'Wrong size', kind: 'fixed', sourceId: `bins_standard:${wrong.id}`, width: wrong.widthUnits, depth: wrong.heightUnits };
    expect((await request.post('/api/v1/curated-libraries', { data: library })).status()).toBe(201);
    await provide(library);
    await request.delete(`/api/v1/curated-libraries/${library.id}`);
  },
  simple: async ({ page, library }, provide) => {
    const simple = new SimpleLayoutPage(page);
    await simple.open();
    await simple.panel.getByLabel('Bin library').selectOption(library.id);
    await provide(simple);
  },
});

test('draws in reverse under zoom and places a rotated fixed bin', async ({ page, simple }, testInfo) => {
  await page.getByRole('button', { name: 'Fit to screen' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await simple.draw(0, 0, 2, 3, true);
  await expect(simple.panel.getByRole('heading', { name: '2 × 3 footprint' })).toBeVisible();
  await expect(simple.panel.getByLabel('Choose a bin').getByRole('option', { name: 'Wrong size' })).toHaveCount(0);
  await expect(simple.panel.getByText('This bin will be rotated to fit.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('simple-picker.png'), fullPage: true });
  await simple.panel.getByRole('button', { name: 'Place bin' }).click();
  const placed = page.locator('.placed-item');
  await expect(placed).toHaveCount(1);
  await expect(placed).toHaveCSS('width', /.+/);
  expect(await placed.evaluate(el => ({ width: el.style.width, height: el.style.height }))).toEqual({ width: '50%', height: '75%' });
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(placed).toHaveCount(1);
  await page.getByRole('button', { name: 'Simple', exact: true }).click();
  await expect(placed).toHaveCount(1);
});

test('rejects overlap and bounds, supports cancel, and explains no matches', async ({ page, simple, request, library }) => {
  await simple.keyboardRectangle(0, 0, 2, 3);
  await simple.panel.getByRole('button', { name: 'Place bin' }).click();
  await expect(page.locator('.placed-item')).toHaveCount(1);
  await simple.keyboardRectangle(0, 0, 2, 3);
  await expect(simple.panel.getByRole('button', { name: 'Place bin' })).toBeDisabled();
  await expect(simple.panel.getByText('Choose an empty rectangle inside the grid.')).toBeVisible();
  await simple.keyboardRectangle(3, 3, 2, 3);
  await expect(simple.panel.getByRole('button', { name: 'Place bin' })).toBeDisabled();
  await simple.panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.drawn-footprint')).toHaveCount(0);
  await request.put(`/api/v1/curated-libraries/${library.id}`, { data: { ...library, entries: [library.entries[0]] } });
  await page.reload();
  await simple.panel.getByLabel('Bin library').selectOption(library.id);
  await simple.keyboardRectangle(0, 0, 1, 1);
  await expect(simple.panel.getByText(/No bins in this library fit/)).toBeVisible();
  await simple.panel.getByRole('button', { name: 'Redraw bin' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.draw-footprint-surface')).toHaveCount(0);
});

test('named presets reach generation and survive saving, library edits, reload and BOM', async ({ page, request, simple, library }) => {
  await simple.keyboardRectangle(0.5, 0.5, 1.5, 2);
  await simple.panel.getByLabel('Choose a bin').selectOption('cup');
  await simple.panel.getByRole('combobox', { name: 'Height', exact: true }).selectOption('tall');
  const generation = page.waitForRequest(r => r.url().endsWith('/generation/custom') && r.method() === 'POST');
  await simple.panel.getByRole('button', { name: 'Place bin' }).click();
  expect((await generation).postDataJSON()).toEqual({ width: 1.5, depth: 2, height: 6, overrides: { lip_style: 'none' } });
  await expect(page.locator('.placed-item')).toHaveCount(1);
  await page.locator('.layout-save-btn').click();
  const dialog = page.getByRole('dialog', { name: 'Save Layout' });
  const name = `Simple saved ${randomUUID().slice(0, 8)}`;
  await dialog.locator('#layout-name').fill(name);
  const saved = page.waitForResponse(r => r.url().endsWith('/layouts') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const body = (await (await saved).json()).data;
  try {
    expect(body.placedItems[0]).toMatchObject({ x: 1, y: 1, width: 3, height: 4, customSpec: { width: 1.5, depth: 2, height: 6, overrides: { lip_style: 'none' } } });
    await request.put(`/api/v1/curated-libraries/${library.id}`, { data: { ...library, entries: [] } });
    const configs = new SavedConfigsPage(page);
    await configs.goto(); await configs.waitForLoaded(); await configs.editButton(name).click();
    await expect(page.locator('.placed-item-label')).toHaveText('Custom 1.5×2×6');
    await page.getByRole('link', { name: 'BOM', exact: true }).click();
    await expect(page.locator('.order-bom-table')).toContainText('Custom 1.5×2×6');
    await page.locator('.nav-tab', { hasText: 'Workspace' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  } finally { await request.delete(`/api/v1/layouts/${body.id}`); }
});

test('draws a footprint with one finger on a tablet and opens the matching picker', async ({ browser, baseURL, library }, testInfo) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 900, height: 900 } });
  try {
    const page = await context.newPage();
    const simple = new SimpleLayoutPage(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Simple', exact: true }).tap();
    await page.getByRole('button', { name: 'Toggle library panel' }).tap();
    await simple.panel.getByLabel('Bin library').selectOption(library.id);
    await simple.panel.getByRole('button', { name: 'Draw bin', exact: true }).tap();
    await page.locator('.draw-footprint-surface').scrollIntoViewIfNeeded();
    const box = await page.locator('.draw-footprint-surface').boundingBox();
    if (!box) throw new Error('Drawing surface unavailable');
    const session = await context.newCDPSession(page);
    const start = { x: box.x + 1, y: box.y + 1 };
    const end = { x: box.x + box.width / 2 - 1, y: box.y + box.height * 3 / 4 - 1 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * step / 8, y: start.y + (end.y - start.y) * step / 8 }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(simple.panel.getByRole('heading', { name: '2 × 3 footprint' })).toBeVisible();
    await expect(simple.panel).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await expect.poll(() => simple.panel.evaluate(el => el.getAnimations().length)).toBe(0);
    await simple.panel.getByRole('button', { name: 'Place bin' }).tap();
    await expect(page.locator('.placed-item')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('simple-tablet.png'), fullPage: true });
  } finally { await context.close(); }
});

test('authors a mixed library and named height presets without editing model files', async ({ page, simple, request }, testInfo) => {
  await simple.panel.getByRole('button', { name: 'New library' }).click();
  const editor = simple.panel.getByRole('form', { name: 'Library editor' });
  await editor.getByLabel('Library name').fill(`Silverware ${randomUUID().slice(0, 8)}`);
  await editor.getByText('Add an existing bin', { exact: true }).click();
  await editor.getByRole('combobox', { name: 'Existing bin', exact: true }).selectOption('bins_standard:bin-3x2');
  await editor.getByRole('button', { name: 'Add selected bin' }).click();
  await editor.getByRole('button', { name: 'Add parametric bin' }).click();
  await editor.getByLabel('Bin name', { exact: true }).fill('Utensil bin');
  await editor.getByRole('button', { name: 'Add named option' }).click();
  const short = editor.locator('details').filter({ has: page.locator('summary', { hasText: /^Short$/ }) });
  await short.locator('summary').click();
  await short.getByLabel('Height (7 mm units)', { exact: true }).fill('3');
  const save = page.waitForResponse(r => r.url().endsWith('/curated-libraries') && r.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Save library' }).click();
  const created = (await (await save).json()).data;
  try {
    expect(created.entries).toHaveLength(2);
    expect(created.entries[1].groups[0].choices[0]).toMatchObject({ name: 'Short', values: { height: 3 } });
    await simple.keyboardRectangle(0, 0, 1, 2);
    await expect(simple.panel.getByRole('combobox', { name: 'Height', exact: true })).toHaveValue(created.entries[1].groups[0].choices[0].id);
    await page.screenshot({ path: testInfo.outputPath('authored-library.png'), fullPage: true });
    await page.reload();
    await simple.panel.getByLabel('Bin library').selectOption(created.id);
    await expect(simple.panel.getByLabel('Bin library')).toHaveValue(created.id);
  } finally { await request.delete(`/api/v1/curated-libraries/${created.id}`); }
});
