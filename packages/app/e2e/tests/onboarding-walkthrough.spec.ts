import { test, expect, type Page, type Route } from '@playwright/test';
import { GridPage } from '../pages/GridPage';

// --- Auth mock helpers (mirrored from reference-images.spec.ts) ---

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
const JWT_PAYLOAD = Buffer.from(JSON.stringify({ userId: 1, role: 'user', exp: 9999999999 })).toString('base64');
const FAKE_ACCESS_TOKEN = `${JWT_HEADER}.${JWT_PAYLOAD}.fakesig`;
const FAKE_REFRESH_TOKEN = 'e2e-fake-refresh-token';

const WALKTHROUGH_SEEN_KEY = 'gridfinity-walkthrough-seen';
const REFRESH_TOKEN_KEY = 'gridfinity_refresh_token';

/**
 * Sets up route mocks for auth so the app treats the user as logged in.
 * Mocks both the token-refresh path (for seedAuth) and the login POST path
 * (for tests that go through the login UI).
 */
async function setupAuthMocks(page: Page) {
  // Refresh token endpoint — makes AuthContext think we're logged in on mount
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

  // Login endpoint — used when going through the login UI
  await page.route('**/api/v1/auth/login', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          accessToken: FAKE_ACCESS_TOKEN,
          refreshToken: FAKE_REFRESH_TOKEN,
          user: { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' },
        },
      }),
    });
  });

  // /me endpoint — called after login or token refresh to hydrate the user
  await page.route('**/api/v1/auth/me', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' },
      }),
    });
  });
}

/**
 * Seeds the refresh token in localStorage so AuthContext silently re-authenticates
 * on mount (no UI login needed).
 */
async function seedAuth(page: Page) {
  await page.addInitScript((key: string) => {
    localStorage.setItem(key, 'e2e-fake-refresh-token');
  }, REFRESH_TOKEN_KEY);
}

// --- Tests ---

test.describe('Onboarding Walkthrough', () => {
  let gridPage: GridPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);

    // Clear the walkthrough-seen flag before each test so the tour can auto-start.
    // Individual tests that need it set will override via addInitScript.
    await page.addInitScript((key: string) => {
      localStorage.removeItem(key);
    }, WALKTHROUGH_SEEN_KEY);
  });

  test('walkthrough auto-starts after login and shows step 1', async ({ page }) => {
    await setupAuthMocks(page);
    await seedAuth(page);
    await gridPage.goto();

    // Tour should appear automatically after auth resolves
    const counter = page.locator('.walkthrough-counter');
    await expect(counter).toBeVisible({ timeout: 10000 });
    await expect(counter).toHaveText('Step 1 of 3');

    const title = page.locator('.walkthrough-title');
    await expect(title).toHaveText('Drag a bin onto your grid');
  });

  test('clicking Next advances through all 3 steps and ends with Finish', async ({ page }) => {
    await setupAuthMocks(page);
    await seedAuth(page);
    await gridPage.goto();

    // Wait for step 1
    await expect(page.locator('.walkthrough-counter')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.walkthrough-counter')).toHaveText('Step 1 of 3');

    // Advance to step 2
    await page.locator('.walkthrough-next-btn').click();
    await expect(page.locator('.walkthrough-counter')).toHaveText('Step 2 of 3');

    // Advance to step 3
    await page.locator('.walkthrough-next-btn').click();
    await expect(page.locator('.walkthrough-counter')).toHaveText('Step 3 of 3');

    // On the last step the button reads "Finish"
    await expect(page.locator('.walkthrough-next-btn')).toHaveText('Finish');

    // Click Finish — tour should disappear
    await page.locator('.walkthrough-next-btn').click();
    await expect(page.locator('.walkthrough-card')).not.toBeVisible();
  });

  test('clicking Skip tour dismisses the walkthrough', async ({ page }) => {
    await setupAuthMocks(page);
    await seedAuth(page);
    await gridPage.goto();

    // Wait for tour to appear
    await expect(page.locator('.walkthrough-card')).toBeVisible({ timeout: 10000 });

    // Skip
    await page.locator('.walkthrough-skip-btn').click();

    // Tour should be gone
    await expect(page.locator('.walkthrough-card')).not.toBeVisible();
  });

  test('walkthrough does NOT auto-start when gridfinity-walkthrough-seen is already set', async ({ page }) => {
    // Override beforeEach: set the key before navigation
    await page.addInitScript((key: string) => {
      localStorage.setItem(key, 'true');
    }, WALKTHROUGH_SEEN_KEY);

    await setupAuthMocks(page);
    await seedAuth(page);
    await gridPage.goto();

    // Give the app time to settle (auth resolves, any walkthrough logic runs)
    await gridPage.waitForGridReady();
    await page.waitForTimeout(500);

    // Tour must NOT appear
    await expect(page.locator('.walkthrough-card')).not.toBeVisible();
  });

  test('"Take the tour" in the user menu re-triggers the tour', async ({ page }) => {
    await setupAuthMocks(page);
    await seedAuth(page);
    await gridPage.goto();

    // Wait for tour to auto-start, then dismiss it
    await expect(page.locator('.walkthrough-card')).toBeVisible({ timeout: 10000 });
    await page.locator('.walkthrough-skip-btn').click();
    await expect(page.locator('.walkthrough-card')).not.toBeVisible();

    // Open the user menu
    await page.locator('.user-menu-trigger').click();
    await expect(page.locator('[role="menu"]')).toBeVisible();

    // Click "Take the tour"
    await page.locator('[role="menuitem"]', { hasText: 'Take the tour' }).click();

    // Tour should restart at step 1
    await expect(page.locator('.walkthrough-card')).toBeVisible();
    await expect(page.locator('.walkthrough-counter')).toHaveText('Step 1 of 3');
    await expect(page.locator('.walkthrough-title')).toHaveText('Drag a bin onto your grid');
  });
});
