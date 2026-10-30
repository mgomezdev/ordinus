import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { CustomBinDialog } from '../pages/CustomBinDialog';
import { dragToGridCell } from '../utils/drag-drop';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
// The library's favorites tab is labelled with a heart glyph.
const FAVORITES_TAB_LABEL = '♥';

test.describe('Custom bin', () => {
  let gridPage: GridPage;
  let dialog: CustomBinDialog;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    dialog = new CustomBinDialog(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await new LibraryPage(page).waitForLibraryReady();
  });

  test('a 3x2x4 bin with untouched defaults sends no overrides and is placed', async ({ page }) => {
    await dialog.open();
    await dialog.setSize(3, 2, 4);
    await expect(dialog.dialog.getByText('126 × 84 × 28 mm')).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/generation/custom')),
      dialog.add().then(body => {
        expect(body).toEqual({ width: 3, depth: 2, height: 4, overrides: {} });
      }),
    ]);

    const { hash } = await response.json() as { hash: string };
    expect(hash).toMatch(HASH_PATTERN);
    await expect(dialog.dialog).toBeHidden();
    expect(await gridPage.getPlacedItemCount()).toBe(1);
    await expect(page.locator('.placed-item-label')).toHaveText('Custom 3×2×4');
  });

  test('the same arguments as the library 3x2 bin produce the same generation hash', async ({ page, request }) => {
    const libraryHash = await request.post('/api/v1/generation/generate', {
      data: { libraryId: 'bins_standard', itemId: 'bin-3x2' },
    }).then(r => r.json() as Promise<{ hash: string }>);

    await dialog.open();
    await dialog.setSize(3, 2, 4);
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/generation/custom')),
      dialog.add(),
    ]);

    expect((await response.json() as { hash: string }).hash).toBe(libraryHash.hash);
  });

  test('typing a default value as an override yields the same hash as leaving it alone', async ({ page }) => {
    const hashFor = async (explicitDefault: boolean): Promise<string> => {
      await gridPage.goto();
      await gridPage.waitForGridReady();
      await dialog.open();
      await dialog.setSize(3, 2, 4);
      if (explicitDefault) {
        await dialog.overrideNumber('Base', 'floor_thickness', 'Floor thickness (mm)', 0.7);
      }
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url().endsWith('/generation/custom')),
        dialog.add(),
      ]);
      return (await response.json() as { hash: string }).hash;
    };

    expect(await hashFor(true)).toBe(await hashFor(false));
  });

  test('an override changes the hash and is sent to the server', async ({ page }) => {
    await dialog.open();
    await dialog.setSize(2, 2, 3);
    await dialog.overrideNumber('Base', 'floor_thickness', 'Floor thickness (mm)', 1.2);
    await expect(dialog.param('floor_thickness')).toHaveAttribute('data-state', 'override');
    await expect(dialog.dialog.getByTestId('group-count-Base')).toHaveText('1');

    const body = await dialog.add();
    expect(body).toEqual({ width: 2, depth: 2, height: 3, overrides: { floor_thickness: 1.2 } });
    await expect(page.locator('.placed-item')).toHaveCount(1);
  });

  test('half-unit bins are placed at half-unit sizes and survive a second bin next to them', async ({ page }) => {
    await dialog.open();
    await dialog.setSize(2.5, 1.5, 3.5);
    await dialog.add();
    await expect(page.locator('.placed-item')).toHaveCount(1);

    await dialog.open();
    await dialog.setSize(1, 1, 2);
    await dialog.add();
    await expect(page.locator('.placed-item')).toHaveCount(2);
    expect(await gridPage.hasInvalidItems()).toBe(false);
  });
});

test.describe('Custom bin favorites', () => {
  const FAVORITES_URL = '/api/v1/favorites';

  test.afterEach(async ({ request }) => {
    const { data } = await (await request.get(FAVORITES_URL)).json() as { data: Array<{ id: string; libraryId: string }> };
    for (const favorite of data.filter(f => f.libraryId === 'custom')) {
      await request.delete(`${FAVORITES_URL}/${favorite.id}`);
    }
  });

  test('a half-unit custom bin can be favorited, survives a reload and is placed from the favorites tab', async ({ page }) => {
    const gridPage = new GridPage(page);
    const dialog = new CustomBinDialog(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await new LibraryPage(page).waitForLibraryReady();

    await dialog.open();
    await dialog.setSize(1.5, 1, 2);
    await dialog.add();
    await expect(page.locator('.placed-item')).toHaveCount(1);

    const created = page.waitForResponse(r => r.url().endsWith('/favorites') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add to favorites' }).click();
    const { data } = await (await created).json() as { data: { libraryId: string; widthUnits: number; customSpec: unknown } };
    expect(data).toMatchObject({ libraryId: 'custom', widthUnits: 1.5, customSpec: { width: 1.5, depth: 1, height: 2, overrides: {} } });
    await expect(page.getByRole('button', { name: 'Remove from favorites' })).toBeVisible();

    await page.reload();
    await gridPage.waitForGridReady();
    await page.locator('.library-cat-tab', { hasText: FAVORITES_TAB_LABEL }).click();
    const card = page.locator('.favorite-card', { hasText: 'Custom 1.5×1×2' });
    await expect(card).toBeVisible();

    await dragToGridCell(page, card, gridPage.gridContainer, 2, 2, 4, 4);
    await expect(page.locator('.placed-item')).toHaveCount(1);
    expect(await gridPage.hasInvalidItems()).toBe(false);
  });
});

test.describe('Half-cell layout persistence', () => {
  const geometry = { x: 1, y: 3, width: 5, height: 3 };
  const base = { name: 'Half-cell e2e', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168 };
  const customSpec = { width: 2.5, depth: 1.5, height: 3.5, overrides: {} };
  const placed = { itemId: 'custom:custom-e2e', rotation: 0, customSpec };

  test('stores and returns half-cell geometry at resolution 2', async ({ request }) => {
    const created = await request.post('/api/v1/layouts', {
      data: { ...base, gridResolution: 2, placedItems: [{ ...placed, ...geometry }] },
    });
    expect(created.status()).toBe(201);
    const { data } = await created.json() as { data: { id: number; gridResolution: number; placedItems: Array<Record<string, unknown>> } };
    try {
      expect(data.gridResolution).toBe(2);
      expect(data.placedItems[0]).toMatchObject(geometry);
    } finally {
      await request.delete(`/api/v1/layouts/${data.id}`);
    }
  });

  test('rescales a whole-unit payload (no resolution) to half-cells', async ({ request }) => {
    const created = await request.post('/api/v1/layouts', {
      data: { ...base, placedItems: [{ itemId: 'bins_standard:bin-3x2', rotation: 0, x: 1, y: 2, width: 3, height: 2 }] },
    });
    expect(created.status()).toBe(201);
    const { data } = await created.json() as { data: { id: number; gridResolution: number; placedItems: Array<Record<string, unknown>> } };
    try {
      expect(data.gridResolution).toBe(2);
      expect(data.placedItems[0]).toMatchObject({ x: 2, y: 4, width: 6, height: 4 });
    } finally {
      await request.delete(`/api/v1/layouts/${data.id}`);
    }
  });
});
