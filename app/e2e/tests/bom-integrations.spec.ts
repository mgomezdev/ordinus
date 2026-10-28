import { test, expect, type Page, type Route } from '@playwright/test';
import { BOMPage } from '../pages/BOMPage';
import { SavedConfigsPage } from '../pages/SavedConfigsPage';
import { configureIntegrations, liveIntegrationUrls, mockIntegrations } from '../utils/integrations';
import type { ApiBomGeneration, ApiLayout } from '../../shared/src/types';

const LAYOUT_ID = 1;
const MOCK_THEMIS_URL = 'http://themis.e2e.test';
const MOCK_LAMINUS_URL = 'http://laminus.e2e.test';
const THEMIS_PROJECT_ID = 7;

const LAYOUT: ApiLayout = {
  id: LAYOUT_ID,
  userId: 1,
  name: 'Integration Layout',
  description: null,
  isPublic: false,
  gridX: 4,
  gridY: 4,
  widthMm: 168,
  depthMm: 168,
  spacerHorizontal: 'none',
  spacerVertical: 'none',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const READY_GENERATION: ApiBomGeneration = {
  id: 1,
  layoutId: LAYOUT_ID,
  status: 'ready',
  fileManifest: [],
  threeMfPath: `bom-layout-${LAYOUT_ID}/layout.3mf`,
  generatedAt: '2026-01-01T00:00:00.000Z',
  errorMessage: null,
  themisProjectId: null,
};

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Mock a saved layout with a ready BOM generation, and a Themis send that succeeds. */
async function mockLayoutWithGeneration(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('gridfinity-walkthrough-seen', 'true');
    // Sending opens the Themis project in a new tab; keep the test on this page.
    window.open = () => null;
  });
  await page.route('**/api/v1/layouts', route => json(route, { data: [LAYOUT] }));
  await page.route(`**/api/v1/layouts/${LAYOUT_ID}`, route =>
    json(route, { data: { ...LAYOUT, placedItems: [], refImagePlacements: [] } }));
  await page.route(`**/api/v1/bom/generation/${LAYOUT_ID}`, route => json(route, { data: READY_GENERATION }));
  await page.route(`**/api/v1/bom/send-to-themis/${LAYOUT_ID}`, route =>
    json(route, { data: { projectUrl: `${MOCK_THEMIS_URL}/projects/${THEMIS_PROJECT_ID}`, needsFilamentProfiles: false } }));
}

/** Load the mocked layout into the workspace, then open its BOM page. */
async function openLayoutBom(page: Page): Promise<void> {
  await page.goto('/');
  const savedConfigsTab = page.locator('.nav-tab', { hasText: 'Saved Configs' });
  await savedConfigsTab.click();
  const configs = new SavedConfigsPage(page);
  await configs.waitForLoaded();
  await configs.editButton(LAYOUT.name).click();
  await expect(page.locator('.canvas-breadcrumb-current')).toContainText(LAYOUT.name);
  await new BOMPage(page).goToBOM();
}

test.describe('BOM integrations (mocked Themis/Laminus)', () => {
  test.beforeEach(async ({ page }) => {
    await mockLayoutWithGeneration(page);
  });

  test('without integrations configured, Generate is disabled and Send to Themis is hidden', async ({ page }) => {
    await mockIntegrations(page, {});
    await openLayoutBom(page);

    const panel = page.locator('.bom-generation-panel');
    await expect(panel.getByRole('button', { name: 'Regenerate' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Send to Themis' })).toHaveCount(0);
  });

  test('with Laminus configured, Generate is enabled', async ({ page }) => {
    await mockIntegrations(page, { laminusUrl: MOCK_LAMINUS_URL });
    await openLayoutBom(page);

    await expect(page.locator('.bom-generation-panel').getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  test('with Themis configured, Send to Themis links to the new project', async ({ page }) => {
    await mockIntegrations(page, { themisUrl: MOCK_THEMIS_URL, laminusUrl: MOCK_LAMINUS_URL });
    await openLayoutBom(page);

    const panel = page.locator('.bom-generation-panel');
    await panel.getByRole('button', { name: 'Send to Themis' }).click();

    await expect(panel.getByRole('link', { name: /Open in Themis/ }))
      .toHaveAttribute('href', `${MOCK_THEMIS_URL}/projects/${THEMIS_PROJECT_ID}`);
  });
});

test.describe('BOM integrations (live Themis/Laminus)', () => {
  const live = liveIntegrationUrls();
  test.skip(
    !live.themisUrl && !live.laminusUrl,
    'Needs a working instance — set E2E_THEMIS_URL and/or E2E_LAMINUS_URL (as reachable from the Ordinus server)',
  );

  let restoreSettings: (() => Promise<void>) | undefined;

  test.beforeEach(async ({ request }) => {
    restoreSettings = await configureIntegrations(request, live);
  });

  test.afterEach(async () => {
    await restoreSettings?.();
  });

  test('the server reaches each configured instance', async ({ request }) => {
    const health = await (await request.get('/api/v1/settings/health')).json() as Record<string, string>;
    if (live.themisUrl) expect(health.themis).toBe('up');
    if (live.laminusUrl) expect(health.laminus).toBe('up');
  });
});
