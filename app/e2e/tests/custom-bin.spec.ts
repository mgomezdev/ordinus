import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { CustomBinDialog } from '../pages/CustomBinDialog';

const HASH_PATTERN = /^[0-9a-f]{64}$/;

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
    await dialog.overrideNumber('Base', 'magnet_diameter', 'Magnet diameter (mm)', 6.5);
    await expect(dialog.param('magnet_diameter')).toHaveAttribute('data-state', 'override');
    await expect(dialog.dialog.getByTestId('group-count-Base')).toHaveText('1');

    const body = await dialog.add();
    expect(body).toEqual({ width: 2, depth: 2, height: 3, overrides: { magnet_diameter: 6.5 } });
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
