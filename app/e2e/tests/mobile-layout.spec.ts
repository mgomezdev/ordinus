import { test, expect } from '@playwright/test';
import { MobileLayoutPage } from '../pages/MobileLayoutPage';

test.describe('Mobile Layout', () => {
  // Use tablet viewport for all tests in this describe block
  test.use({ viewport: { width: 768, height: 1024 } });

  let mobilePage: MobileLayoutPage;

  test.beforeEach(async ({ page }) => {
    // Use addInitScript with a one-shot flag so it only clears on the very first
    // navigation and does NOT re-clear on a page.reload() within a test.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__mobile_test_cleared__')) {
        sessionStorage.setItem('__mobile_test_cleared__', '1');
        localStorage.removeItem('gridfinity-mobile-layout');
      }
    });
    mobilePage = new MobileLayoutPage(page);
    await mobilePage.gotoMobile();
  });

  test('settings panel is collapsed by default on tablet', async () => {
    const isOpen = await mobilePage.isSettingsOpen();
    expect(isOpen).toBe(false);
  });

  test('library panel is collapsed by default on tablet', async () => {
    const isOpen = await mobilePage.isLibraryOpen();
    expect(isOpen).toBe(false);
  });

  test('tapping settings toggle opens settings panel', async () => {
    await mobilePage.openSettings();
    const isOpen = await mobilePage.isSettingsOpen();
    expect(isOpen).toBe(true);
  });

  test('tapping backdrop closes settings panel', async () => {
    await mobilePage.openSettings();
    expect(await mobilePage.isSettingsOpen()).toBe(true);
    await mobilePage.closeSettings();
    expect(await mobilePage.isSettingsOpen()).toBe(false);
  });

  test('tapping library toggle opens library panel', async () => {
    await mobilePage.openLibrary();
    const isOpen = await mobilePage.isLibraryOpen();
    expect(isOpen).toBe(true);
  });

  test('mutual exclusion: opening library when settings is open closes settings', async () => {
    await mobilePage.openSettings();
    expect(await mobilePage.isSettingsOpen()).toBe(true);

    // Now open library
    await mobilePage.openLibrary();

    expect(await mobilePage.isLibraryOpen()).toBe(true);
    expect(await mobilePage.isSettingsOpen()).toBe(false);
  });

  test('grid container is visible when both panels are closed', async () => {
    // Both panels start closed; grid should be visible
    await expect(mobilePage.gridContainer).toBeVisible();
  });

  test('library card width is at most 80px on tablet', async () => {
    await mobilePage.openAndWaitForLibraryReady();
    const firstCard = mobilePage.libraryItems.first();
    const box = await firstCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(80);
  });

  test('panel state persists after page refresh (library stays open)', async ({ page }) => {
    await mobilePage.openLibrary();
    expect(await mobilePage.isLibraryOpen()).toBe(true);

    // Reload without clearing localStorage
    await page.reload();
    await mobilePage.gridContainer.waitFor({ state: 'visible' });

    // Wait for the library panel to reflect persisted open state
    await expect(mobilePage.libraryPanel).toHaveClass(/library-panel--open/, { timeout: 5000 });
  });
});
