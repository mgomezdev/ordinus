import { test, expect, type Page, type Route } from '@playwright/test';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { dragToGridCell } from '../utils/drag-drop';
import type { FavoriteItem } from '../../src/types/gridfinity';

// --- Mock auth helpers ---

// Fake JWT that AuthContext.tsx can decode via atob(payload)
const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
const JWT_PAYLOAD = Buffer.from(JSON.stringify({ userId: 1, role: 'user', exp: 9999999999 })).toString('base64');
const FAKE_ACCESS_TOKEN = `${JWT_HEADER}.${JWT_PAYLOAD}.fakesig`;
const FAKE_REFRESH_TOKEN = 'e2e-fake-refresh-token';

/**
 * Sets up API route interception for auth + favorites.
 * Returns a mutable favorites array that tests can modify.
 */
async function setupApiMocks(page: Page, favorites: FavoriteItem[] = []) {
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

  // GET favorites
  await page.route('**/api/v1/favorites', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: favorites }),
      });
    } else if (route.request().method() === 'POST') {
      // Create favorite
      const body = await route.request().postDataJSON();
      const newFavorite: FavoriteItem = {
        id: (favorites.length > 0 ? Math.max(...favorites.map(f => f.id)) : 0) + 1,
        userId: 1,
        libraryId: body.libraryId,
        libraryItemId: body.libraryItemId,
        name: body.name,
        customization: body.customization || null,
        widthUnits: body.widthUnits || 1,
        heightUnits: body.heightUnits || 1,
        color: body.color || '#ffffff',
        paramHash: body.paramHash || null,
        imageUrl: body.imageUrl || null,
        createdAt: new Date().toISOString(),
      };
      favorites.push(newFavorite);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ data: newFavorite }),
      });
    } else {
      await route.continue();
    }
  });

  // DELETE favorite
  await page.route('**/api/v1/favorites/*', async (route: Route) => {
    if (route.request().method() === 'DELETE') {
      const url = route.request().url();
      const idStr = url.split('/').pop();
      const id = Number(idStr);
      const idx = favorites.findIndex(f => f.id === id);
      if (idx !== -1) {
        favorites.splice(idx, 1);
      }
      await route.fulfill({ status: 204 });
    } else if (route.request().method() === 'PATCH') {
      // Update favorite (e.g., rename)
      const url = route.request().url();
      const idStr = url.split('/').pop();
      const id = Number(idStr);
      const body = await route.request().patchDataJSON();
      const fav = favorites.find(f => f.id === id);
      if (fav && body.name) {
        fav.name = body.name;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: fav }),
      });
    } else {
      await route.continue();
    }
  });

  return favorites;
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

test.describe('Favorites — Unauthenticated', () => {
  let gridPage: GridPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
  });

  test('Favorites tab is not shown when not authenticated', async ({ page }) => {
    // The Favorites tab is only rendered for authenticated users
    const favoritesTab = page.locator('.library-cat-tab', { hasText: 'Favorites' });
    await expect(favoritesTab).not.toBeVisible();
  });
});

test.describe('Favorites — Authenticated', () => {
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

  test('Heart button appears on placed item toolbar', async ({ page }) => {
    // Place an item on the grid
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Get the placed item and hover to show toolbar
    const placedItem = page.locator('.placed-item').first();
    await placedItem.hover();

    // Check that the heart button exists
    const heartButton = placedItem.locator('.placed-item-toolbar-btn--heart');
    await expect(heartButton).toBeVisible();
  });

  test('Clicking heart button saves a favorite and shows filled heart', async ({ page }) => {
    // Place an item on the grid
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Hover and click the heart button
    const placedItem = page.locator('.placed-item').first();
    await placedItem.hover();

    const heartButton = placedItem.locator('.placed-item-toolbar-btn--heart');
    await expect(heartButton).toBeVisible();
    await heartButton.click();

    // After clicking, button should have 'favorited' class
    await expect(heartButton).toHaveClass(/favorited/);
  });

  test('Favorite appears in Favorites tab', async ({ page }) => {
    // Place an item on the grid
    const firstItem = libraryPage.libraryItems.first();
    const itemName = await firstItem.locator('.library-item-name').textContent();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    // Click the heart button
    const placedItem = page.locator('.placed-item').first();
    await placedItem.hover();
    const heartButton = placedItem.locator('.placed-item-toolbar-btn--heart');
    await heartButton.click();

    // Wait for the favorite to be saved
    await page.waitForTimeout(200);

    // Switch to Favorites tab
    const favoritesTab = page.locator('.library-cat-tab', { hasText: 'Favorites' });
    await expect(favoritesTab).toBeVisible();
    await favoritesTab.click();

    // The favorite card should appear with the item name
    const favoriteCard = page.locator('.favorite-card').first();
    await expect(favoriteCard).toBeVisible();
    const cardName = await favoriteCard.locator('.favorite-card-name').textContent();
    expect(cardName).toContain(itemName);
  });

  test('Favorite persists after page refresh', async ({ page }) => {
    // Place an item and add it to favorites
    const firstItem = libraryPage.libraryItems.first();
    const itemName = await firstItem.locator('.library-item-name').textContent();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    await placedItem.hover();
    const heartButton = placedItem.locator('.placed-item-toolbar-btn--heart');
    await heartButton.click();

    // Wait for the favorite to be saved
    await page.waitForTimeout(200);

    // Reload the page
    await page.reload();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();

    // Switch to Favorites tab
    const favoritesTab = page.locator('.library-cat-tab', { hasText: 'Favorites' });
    await expect(favoritesTab).toBeVisible();
    await favoritesTab.click();

    // The favorite should still be there
    const favoriteCard = page.locator('.favorite-card').first();
    await expect(favoriteCard).toBeVisible();
    const cardName = await favoriteCard.locator('.favorite-card-name').textContent();
    expect(cardName).toContain(itemName);
  });

  test('Can drag favorite from Favorites tab to grid', async ({ page }) => {
    // Place an item and favorite it
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    await placedItem.hover();
    const heartButton = placedItem.locator('.placed-item-toolbar-btn--heart');
    await heartButton.click();

    // Wait for the favorite to be saved
    await page.waitForTimeout(200);

    // Switch to Favorites tab
    const favoritesTab = page.locator('.library-cat-tab', { hasText: 'Favorites' });
    await favoritesTab.click();

    // Get initial placed item count
    const initialCount = await gridPage.getPlacedItemCount();

    // Drag the favorite card from Favorites tab to grid cell (1,0)
    const favoriteCard = page.locator('.favorite-card').first();
    await dragToGridCell(page, favoriteCard, gridPage.gridContainer, 1, 0, 4, 4);

    // Should have one more placed item
    const newCount = await gridPage.getPlacedItemCount();
    expect(newCount).toBe(initialCount + 1);
  });

  test('Removing favorite via trash icon does not affect placed item', async ({ page }) => {
    // Place an item and favorite it
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    await placedItem.hover();
    const heartButton = placedItem.locator('.placed-item-toolbar-btn--heart');
    await heartButton.click();

    // Wait for the favorite to be saved
    await page.waitForTimeout(200);

    // Switch to Favorites tab
    const favoritesTab = page.locator('.library-cat-tab', { hasText: 'Favorites' });
    await favoritesTab.click();

    // Get initial placed item count
    const initialCount = await gridPage.getPlacedItemCount();

    // Click the trash button to remove the favorite
    const favoriteCard = page.locator('.favorite-card').first();
    const trashButton = favoriteCard.locator('.favorite-card-remove');
    await trashButton.click();

    // Wait for removal
    await page.waitForTimeout(200);

    // Placed item count should not change
    const newCount = await gridPage.getPlacedItemCount();
    expect(newCount).toBe(initialCount);

    // Heart button on placed item should no longer show favorited state
    const favoriteHeart = placedItem.hover();
    await favoriteHeart;
    await expect(heartButton).not.toHaveClass(/favorited/);
  });

  test('Renaming favorite persists after page reload', async ({ page }) => {
    // Place an item and favorite it
    const firstItem = libraryPage.libraryItems.first();
    await dragToGridCell(page, firstItem, gridPage.gridContainer, 0, 0, 4, 4);

    const placedItem = page.locator('.placed-item').first();
    await placedItem.hover();
    const heartButton = placedItem.locator('.placed-item-toolbar-btn--heart');
    await heartButton.click();

    // Wait for the favorite to be saved
    await page.waitForTimeout(200);

    // Switch to Favorites tab
    const favoritesTab = page.locator('.library-cat-tab', { hasText: 'Favorites' });
    await favoritesTab.click();

    // Double-click on the favorite name to edit it
    const favoriteCard = page.locator('.favorite-card').first();
    const cardNameSpan = favoriteCard.locator('.favorite-card-name span');
    await cardNameSpan.dblClick();

    // Fill in new name
    const nameInput = favoriteCard.locator('.favorite-card-name-input');
    await nameInput.clear();
    const newName = 'My Custom Name';
    await nameInput.fill(newName);
    await nameInput.press('Enter');

    // Wait for the rename to be saved
    await page.waitForTimeout(200);

    // Reload the page
    await page.reload();
    await gridPage.waitForGridReady();
    await libraryPage.waitForLibraryReady();

    // Switch to Favorites tab again
    const favoritesTab2 = page.locator('.library-cat-tab', { hasText: 'Favorites' });
    await favoritesTab2.click();

    // The favorite should still have the new name
    const favoriteCard2 = page.locator('.favorite-card').first();
    await expect(favoriteCard2).toContainText(newName);
  });
});
