import { test, expect, type Page, type Route } from '@playwright/test';
import { UserStlPage } from '../pages/UserStlPage';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ApiUserStl } from '../../shared/src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_STL_PATH = path.resolve(__dirname, '../fixtures/bin_2x3.stl');

const FAKE_STL_ID = 'stl-e2e-001';

function makeMockStl(name: string, status: ApiUserStl['status'] = 'pending'): ApiUserStl {
  return {
    id: FAKE_STL_ID,
    name,
    gridX: null,
    gridY: null,
    imageUrl: null,
    perspImageUrls: [],
    status,
    errorMessage: null,
    createdAt: '2026-03-01T00:00:00.000Z',
  };
}

async function setupApiMocks(page: Page, stlName: string) {
  let uploadedStl: ApiUserStl | null = null;

  // GET /api/v1/user-stls — returns uploaded STL if any
  await page.route('**/api/v1/user-stls', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(uploadedStl ? [uploadedStl] : []),
      });
    } else if (route.request().method() === 'POST') {
      uploadedStl = makeMockStl(stlName, 'pending');
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(uploadedStl),
      });
    } else {
      await route.continue();
    }
  });
}

// --- Tests ---

test.describe('User STL upload', () => {
  test.beforeEach(async ({ page }) => {
    const testName = 'e2e-test-bin';
    await setupApiMocks(page, testName);
  });

  test('upload modal validates file extension client-side', async ({ page }) => {
    await page.goto('/');
    const stlPage = new UserStlPage(page);

    // Wait for the section to appear
    await stlPage.uploadButton.waitFor({ state: 'visible', timeout: 10000 });
    await stlPage.openUploadModal();

    // Try uploading a non-STL file via buffer (fake JPEG)
    await page.locator('input[type="file"]').setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-data'),
    });

    await stlPage.submitButton.click();
    await expect(stlPage.errorAlert).toContainText(/stl|3mf/i);
  });

  test('uploading an STL closes modal and shows processing item', async ({ page }) => {

    await page.goto('/');
    const stlPage = new UserStlPage(page);

    // Wait for the section to appear
    await stlPage.uploadButton.waitFor({ state: 'visible', timeout: 10000 });
    await stlPage.openUploadModal();

    // Upload a real STL file
    await stlPage.uploadFile(TEST_STL_PATH, 'e2e-test-bin');

    // Modal closes — heading no longer visible
    await expect(page.getByRole('heading', { name: /upload model/i })).not.toBeVisible();

    // Item appears in library section with name
    await expect(stlPage.itemByName('e2e-test-bin')).toBeVisible({ timeout: 5000 });
  });

  test('upload modal shows error when API fails', async ({ page }) => {
    // Override the POST to return 409 quota error
    await page.route('**/api/v1/user-stls', async (route: Route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Upload quota exceeded' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });


    await page.goto('/');
    const stlPage = new UserStlPage(page);

    await stlPage.uploadButton.waitFor({ state: 'visible', timeout: 10000 });
    await stlPage.openUploadModal();
    await stlPage.uploadFile(TEST_STL_PATH, 'e2e-quota-test');

    // Modal stays open with error shown
    await expect(stlPage.errorAlert).toContainText(/quota|exceeded/i, { timeout: 5000 });
  });
});
