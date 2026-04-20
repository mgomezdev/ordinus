import { test, expect, type Page, type Route } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { pointerDragDrop, dragToGridCell } from '../utils/drag-drop';
import type { ApiRefImage } from '../../shared/src/types';

// --- Mock auth helpers ---

// Fake JWT that AuthContext.tsx can decode via atob(payload)
const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
const JWT_PAYLOAD = Buffer.from(JSON.stringify({ userId: 1, role: 'user', exp: 9999999999 })).toString('base64');
const FAKE_ACCESS_TOKEN = `${JWT_HEADER}.${JWT_PAYLOAD}.fakesig`;
const FAKE_REFRESH_TOKEN = 'e2e-fake-refresh-token';

// 1x1 red pixel PNG
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

const MOCK_IMAGE: ApiRefImage = {
  id: 1,
  ownerId: 1,
  name: 'test-image.png',
  isGlobal: false,
  imageUrl: 'ref-lib/abc123.webp',
  fileSize: 2048,
  createdAt: '2024-01-01T00:00:00.000Z',
};

let nextImageId = 10;
function makeMockImage(name: string, isGlobal = false): ApiRefImage {
  return {
    id: nextImageId++,
    ownerId: isGlobal ? null : 1,
    name,
    isGlobal,
    imageUrl: `ref-lib/${name.replace(/\s/g, '-')}.webp`,
    fileSize: 1024,
    createdAt: '2024-01-01T00:00:00.000Z',
  };
}

/**
 * Sets up API route interception for auth + ref-images.
 * Returns a mutable images array that tests can modify.
 */
async function setupApiMocks(page: Page, images: ApiRefImage[] = [MOCK_IMAGE]) {
  // Auth refresh — makes AuthContext think we're logged in
  await page.route('**/api/v1/auth/refresh', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          accessToken: FAKE_ACCESS_TOKEN,
          refreshToken: FAKE_REFRESH_TOKEN,
        },
      }),
    });
  });

  // Auth me — returns the current user after refresh
  await page.route('**/api/v1/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' },
      }),
    });
  });

  // GET ref images
  await page.route('**/api/v1/ref-images', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: images }),
      });
    } else if (route.request().method() === 'POST') {
      // Upload: return a new mock image
      const newImage = makeMockImage(`uploaded-${Date.now()}.png`);
      images.push(newImage);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: newImage }),
      });
    } else {
      await route.continue();
    }
  });

  // DELETE ref image
  await page.route('**/api/v1/ref-images/*', async (route: Route) => {
    if (route.request().method() === 'DELETE') {
      const url = route.request().url();
      const idStr = url.split('/').pop();
      const id = Number(idStr);
      const idx = images.findIndex(img => img.id === id);
      if (idx !== -1) images.splice(idx, 1);
      await route.fulfill({ status: 204 });
    } else if (route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: images[0] }),
      });
    } else {
      await route.continue();
    }
  });

  // Image serving — return our tiny PNG for any ref-lib image request
  await page.route('**/api/v1/images/ref-lib/**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: PNG_BUFFER,
    });
  });

  return images;
}

/**
 * Seed localStorage with a refresh token so AuthContext tries to refresh on mount.
 */
async function seedAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('gridfinity_refresh_token', 'e2e-fake-refresh-token');
  });
}

// --- Tests ---

test.describe('Reference Images — Unauthenticated', () => {
  let gridPage: GridPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
  });

  test('Images tab is not shown when not authenticated', async ({ page }) => {
    // The Images tab is only rendered for authenticated users
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await expect(imagesTab).not.toBeVisible();
  });
});

test.describe('Reference Images — Authenticated', () => {
  let gridPage: GridPage;
  let libraryPage: LibraryPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    libraryPage = new LibraryPage(page);

    await setupApiMocks(page);
    await seedAuth(page);

    await gridPage.goto();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();
  });

  test('Images tab shows ref image library', async ({ page }) => {
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();

    // Should show "Reference Images" heading
    await expect(page.locator('text=Reference Images')).toBeVisible();

    // Should show the Upload button
    await expect(page.locator('button', { hasText: 'Upload Image' })).toBeVisible();
  });

  test('displays images from API in "My Images" section', async ({ page }) => {
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();

    // Should show "My Images" section with the mock image
    await expect(page.locator('text=My Images (1)')).toBeVisible();

    // The image card should be visible with the mock image name
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('test-image.png');
  });

  test('can drag ref image from library to grid', async ({ page }) => {
    // Switch to Images tab
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();

    // Wait for card to appear
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();

    // No reference images on grid initially
    const overlaysBefore = page.locator('.reference-image-overlay');
    await expect(overlaysBefore).toHaveCount(0);

    // Drag the ref image card onto the grid
    const gridContainer = gridPage.gridContainer;
    await pointerDragDrop(page, card, gridContainer);

    // Should have a reference image overlay on the grid
    const overlaysAfter = page.locator('.reference-image-overlay');
    await expect(overlaysAfter).toHaveCount(1);
  });

  test('placed ref image shows toolbar when selected', async ({ page }) => {
    // Switch to Images tab and drag an image to grid
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();
    await pointerDragDrop(page, card, gridPage.gridContainer);

    // Click on the overlay to select it
    const overlay = page.locator('.reference-image-overlay').first();
    await overlay.click();
    await page.waitForTimeout(100);

    // Toolbar should be visible
    const toolbar = page.locator('.reference-image-overlay__toolbar');
    await expect(toolbar).toBeVisible();

    // Verify toolbar controls exist
    await expect(toolbar.locator('#opacity-slider')).toBeVisible();
    await expect(toolbar.locator('#scale-slider')).toBeVisible();
    await expect(toolbar.locator('.reference-image-overlay__toolbar-btn--lock')).toBeVisible();
    await expect(toolbar.locator('.reference-image-overlay__toolbar-btn--remove')).toBeVisible();
  });

  test('can adjust image opacity via slider', async ({ page }) => {
    // Place image on grid
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();
    await pointerDragDrop(page, card, gridPage.gridContainer);

    // Select the overlay
    const overlay = page.locator('.reference-image-overlay').first();
    await overlay.click();
    await page.waitForTimeout(100);

    // Get initial opacity from the content div
    const contentDiv = overlay.locator('.reference-image-overlay__content');
    const initialOpacity = await contentDiv.evaluate(el =>
      window.getComputedStyle(el).opacity,
    );

    // Change opacity to 80% via slider
    const opacitySlider = page.locator('#opacity-slider');
    await opacitySlider.fill('80');
    await page.waitForTimeout(100);

    // Verify opacity changed
    const newOpacity = await contentDiv.evaluate(el =>
      window.getComputedStyle(el).opacity,
    );
    expect(parseFloat(newOpacity)).toBeCloseTo(0.8, 1);
    expect(newOpacity).not.toBe(initialOpacity);
  });

  test('can lock and unlock image', async ({ page }) => {
    // Place image on grid
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();
    await pointerDragDrop(page, card, gridPage.gridContainer);

    // Select the overlay
    const overlay = page.locator('.reference-image-overlay').first();
    await overlay.click();
    await page.waitForTimeout(100);

    // Lock button should say "Lock"
    const lockBtn = page.locator('.reference-image-overlay__toolbar-btn--lock');
    await expect(lockBtn).toHaveText('Lock');

    // Lock the image
    await lockBtn.click();
    await page.waitForTimeout(100);
    await expect(lockBtn).toHaveText('Unlock');
    await expect(overlay).toHaveClass(/reference-image-overlay--locked/);

    // Unlock the image
    await lockBtn.click();
    await page.waitForTimeout(100);
    await expect(lockBtn).toHaveText('Lock');
    await expect(overlay).not.toHaveClass(/reference-image-overlay--locked/);
  });

  test('can remove image from grid', async ({ page }) => {
    // Place image on grid
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();
    await pointerDragDrop(page, card, gridPage.gridContainer);

    // Verify overlay exists
    await expect(page.locator('.reference-image-overlay')).toHaveCount(1);

    // Select and click remove
    const overlay = page.locator('.reference-image-overlay').first();
    await overlay.click();
    await page.waitForTimeout(100);

    const removeBtn = page.locator('.reference-image-overlay__toolbar-btn--remove');
    await removeBtn.click();
    await page.waitForTimeout(200);

    // Overlay should be gone
    await expect(page.locator('.reference-image-overlay')).toHaveCount(0);
  });

  test('placed library items and ref images coexist on grid', async ({ page }) => {
    // First, drag a library item onto the grid (Items tab is default)
    const firstItem = libraryPage.libraryItems.first();
    await expect(firstItem).toBeVisible();

    const { columns, rows } = await gridPage.getGridDimensions();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, columns, rows);
    const placedCount = await gridPage.getPlacedItemCount();
    expect(placedCount).toBe(1);

    // Switch to Images tab and drag a ref image
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();
    await pointerDragDrop(page, card, gridPage.gridContainer);

    // Both should exist on the grid
    const overlays = page.locator('.reference-image-overlay');
    await expect(overlays).toHaveCount(1);
    expect(await gridPage.getPlacedItemCount()).toBe(1);
  });

  test('reference image is always interactive (pointer-events: auto)', async ({ page }) => {
    // Place image on grid
    const imagesTab = page.locator('.library-cat-tab', { hasText: 'Images' });
    await imagesTab.click();
    const card = page.locator('.ref-image-card').first();
    await expect(card).toBeVisible();
    await pointerDragDrop(page, card, gridPage.gridContainer);

    const overlay = page.locator('.reference-image-overlay').first();
    await expect(overlay).toBeVisible();

    // Should have interactive class and pointer-events: auto
    await expect(overlay).toHaveClass(/reference-image-overlay--interactive/);
    const pointerEvents = await overlay.evaluate(el =>
      window.getComputedStyle(el).pointerEvents,
    );
    expect(pointerEvents).toBe('auto');
  });
});
