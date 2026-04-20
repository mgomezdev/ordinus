import { test, expect, type Page, type Route } from '@playwright/test';
import { SavedConfigsPage } from '../pages/SavedConfigsPage';
import type { ApiLayout } from '../../shared/src/types';

// ── Auth mock helpers (same pattern as reference-images.spec.ts) ──

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
const JWT_PAYLOAD = Buffer.from(
  JSON.stringify({ userId: 1, role: 'user', exp: 9999999999 }),
).toString('base64');
const FAKE_ACCESS_TOKEN = `${JWT_HEADER}.${JWT_PAYLOAD}.fakesig`;

function makeLayout(overrides: Partial<ApiLayout> = {}): ApiLayout {
  return {
    id: 1,
    userId: 1,
    name: 'My Layout',
    description: null,
    status: 'draft',
    isPublic: false,
    gridX: 4,
    gridY: 4,
    widthMm: 168,
    depthMm: 168,
    spacerHorizontal: 'none',
    spacerVertical: 'none',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const MOCK_LAYOUT_DETAIL = {
  ...makeLayout(),
  placedItems: [],
  refImagePlacements: [],
};

/**
 * Seed localStorage so AuthContext attempts silent refresh on mount,
 * and skip the walkthrough overlay which blocks clicks on first visit.
 * Must be called before page.goto() via addInitScript.
 */
async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('gridfinity_refresh_token', 'e2e-fake-refresh-token');
    localStorage.setItem('gridfinity-walkthrough-seen', 'true');
  });
}

async function setupAuthMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/refresh', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { accessToken: FAKE_ACCESS_TOKEN, refreshToken: 'fake-refresh' },
      }),
    });
  });

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

async function setupLayoutsMock(page: Page, layouts: ApiLayout[]): Promise<void> {
  await page.route('**/api/v1/layouts', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: layouts }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Navigate to the workspace first so auth can resolve, then click the nav tab.
 * RequireAuth redirects immediately if isAuthenticated=false (no isLoading check),
 * so auth must be resolved before navigating to the protected page.
 * Clicking the nav tab uses client-side navigation so React state is preserved.
 */
async function gotoConfigsAuthenticated(page: Page): Promise<void> {
  await page.goto('/');
  const savedConfigsTab = page.locator('.nav-tab', { hasText: 'Saved Configs' });
  await savedConfigsTab.waitFor({ state: 'visible', timeout: 10000 });
  await savedConfigsTab.click();
  await page.waitForURL('**/configs');
}

// ── Tests ──

test('unauthenticated user is redirected to home', async ({ page }) => {
  // Mock refresh to fail — no valid session
  await page.route('**/api/v1/auth/refresh', async (route: Route) => {
    await route.fulfill({ status: 401, body: '{}' });
  });

  await page.goto('/configs');
  // RequireAuth redirects to /?authRequired=1
  await expect(page).toHaveURL(/authRequired=1/);
  await expect(page.locator('.nav-tab', { hasText: 'Workspace' })).toBeVisible();
});

test('shows list of saved layouts when authenticated', async ({ page }) => {
  await setupAuthMocks(page);
  await seedAuth(page);
  await setupLayoutsMock(page, [
    makeLayout({ id: 1, name: 'Layout One' }),
    makeLayout({ id: 2, name: 'Layout Two' }),
  ]);

  const configs = new SavedConfigsPage(page);
  await gotoConfigsAuthenticated(page);
  await configs.waitForLoaded();

  await expect(configs.cards).toHaveCount(2);
  await expect(configs.card('Layout One')).toBeVisible();
  await expect(configs.card('Layout Two')).toBeVisible();
});

test('shows empty state when no layouts exist', async ({ page }) => {
  await setupAuthMocks(page);
  await seedAuth(page);
  await setupLayoutsMock(page, []);

  const configs = new SavedConfigsPage(page);
  await gotoConfigsAuthenticated(page);
  await configs.waitForLoaded();

  await expect(configs.emptyState).toBeVisible();
  await expect(configs.emptyState).toContainText('No saved layouts');
});

test('edit button loads layout into workspace and navigates to /', async ({ page }) => {
  await setupAuthMocks(page);
  await seedAuth(page);
  await setupLayoutsMock(page, [makeLayout({ id: 1, name: 'My Layout' })]);

  // Mock the detail fetch for the edit/load flow
  await page.route('**/api/v1/layouts/1', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_LAYOUT_DETAIL }),
      });
    } else {
      await route.continue();
    }
  });

  const configs = new SavedConfigsPage(page);
  await gotoConfigsAuthenticated(page);
  await configs.waitForLoaded();

  await configs.editButton('My Layout').click();

  // Should navigate back to workspace
  await expect(page).toHaveURL('/');
  // Layout name appears in breadcrumb
  await expect(page.locator('.canvas-breadcrumb-current')).toContainText('My Layout');
});

test('delete button requires confirmation then removes card', async ({ page }) => {
  await setupAuthMocks(page);
  await seedAuth(page);
  await setupLayoutsMock(page, [makeLayout({ id: 1, name: 'To Delete' })]);

  await page.route('**/api/v1/layouts/1', async (route: Route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });

  const configs = new SavedConfigsPage(page);
  await gotoConfigsAuthenticated(page);
  await configs.waitForLoaded();

  // First click shows "Confirm" button, not immediate deletion
  await configs.deleteButton('To Delete').click();
  await expect(configs.confirmDeleteButton('To Delete')).toBeVisible();

  // Override the GET /layouts to return empty list after deletion
  await page.route('**/api/v1/layouts', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
  await configs.confirmDeleteButton('To Delete').click();

  await expect(configs.emptyState).toBeVisible({ timeout: 5000 });
});

test('duplicate button clones layout and shows new card', async ({ page }) => {
  await setupAuthMocks(page);
  await seedAuth(page);
  let cloned = false;
  await page.route('**/api/v1/layouts', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: cloned
          ? [makeLayout({ id: 1, name: 'Original' }), makeLayout({ id: 2, name: 'Copy of Original' })]
          : [makeLayout({ id: 1, name: 'Original' })],
      }),
    });
  });

  await page.route('**/api/v1/layouts/1/clone', async (route: Route) => {
    cloned = true;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ data: makeLayout({ id: 2, name: 'Copy of Original' }) }),
    });
  });

  const configs = new SavedConfigsPage(page);
  await gotoConfigsAuthenticated(page);
  await configs.waitForLoaded();

  await configs.duplicateButton('Original').click();

  await expect(configs.card('Copy of Original')).toBeVisible({ timeout: 5000 });
});

test('submit button changes status badge to submitted', async ({ page }) => {
  await setupAuthMocks(page);
  await seedAuth(page);
  let submitted = false;
  await page.route('**/api/v1/layouts', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [makeLayout({ id: 1, name: 'Draft Layout', status: submitted ? 'submitted' : 'draft' })],
      }),
    });
  });

  await page.route('**/api/v1/layouts/1/submit', async (route: Route) => {
    submitted = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: makeLayout({ id: 1, name: 'Draft Layout', status: 'submitted' }) }),
    });
  });

  const configs = new SavedConfigsPage(page);
  await gotoConfigsAuthenticated(page);
  await configs.waitForLoaded();

  await configs.submitButton('Draft Layout').click();

  await expect(
    configs.card('Draft Layout').locator('.layout-status-badge'),
  ).toContainText('submitted', { timeout: 5000 });
});

test('failed mutation shows dismissible error banner', async ({ page }) => {
  await setupAuthMocks(page);
  await seedAuth(page);
  await setupLayoutsMock(page, [makeLayout({ id: 1, name: 'My Layout', status: 'draft' })]);

  // Submit fails with 500
  await page.route('**/api/v1/layouts/1/submit', async (route: Route) => {
    await route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server error' }) });
  });

  const configs = new SavedConfigsPage(page);
  await gotoConfigsAuthenticated(page);
  await configs.waitForLoaded();

  await configs.submitButton('My Layout').click();

  await expect(configs.errorBanner).toBeVisible({ timeout: 5000 });
  await expect(configs.errorBanner).toContainText('Failed to submit');

  // Banner can be dismissed
  await configs.errorBanner.getByRole('button', { name: 'Dismiss error' }).click();
  await expect(configs.errorBanner).not.toBeVisible();
});
