import type { APIRequestContext, Page, Route } from '@playwright/test';

/**
 * Themis and Laminus URLs are app settings (PATCH /api/v1/settings), not env.
 * Any spec that exercises a Themis or Laminus feature must set them first,
 * using one of the two helpers below.
 */
export interface IntegrationUrls {
  themisUrl?: string;
  laminusUrl?: string;
}

type ServiceStatus = 'up' | 'down' | 'unconfigured';

interface ServiceSettings {
  themis_url: string;
  themis_api_key: string;
  laminus_url: string;
}

/** Live Themis/Laminus URLs for this run, when the environment provides them. */
export function liveIntegrationUrls(): IntegrationUrls {
  return {
    themisUrl: process.env.E2E_THEMIS_URL,
    laminusUrl: process.env.E2E_LAMINUS_URL,
  };
}

/**
 * Mocked instances: make the browser see the given integrations as configured
 * and reachable, without touching the server's stored settings. Pair it with
 * page.route mocks for whichever Ordinus endpoints the test drives.
 */
export async function mockIntegrations(page: Page, urls: IntegrationUrls): Promise<void> {
  const settings: ServiceSettings = {
    themis_url: urls.themisUrl ?? '',
    themis_api_key: '',
    laminus_url: urls.laminusUrl ?? '',
  };
  const status = (url: string): ServiceStatus => (url ? 'up' : 'unconfigured');

  await page.route('**/api/v1/settings', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settings) });
  });

  await page.route('**/api/v1/settings/health', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ themis: status(settings.themis_url), laminus: status(settings.laminus_url) }),
    });
  });
}

/**
 * Working instances: store the given URLs in the server's settings so its own
 * calls reach them. Returns a function that restores the previous values;
 * call it in afterAll/afterEach so later specs see the settings unchanged.
 */
export async function configureIntegrations(
  request: APIRequestContext,
  urls: IntegrationUrls,
): Promise<() => Promise<void>> {
  const previous = await (await request.get('/api/v1/settings')).json() as ServiceSettings;

  const patch: Partial<ServiceSettings> = {};
  if (urls.themisUrl !== undefined) patch.themis_url = urls.themisUrl;
  if (urls.laminusUrl !== undefined) patch.laminus_url = urls.laminusUrl;
  await patchSettings(request, patch);

  return async () => {
    await patchSettings(request, { themis_url: previous.themis_url, laminus_url: previous.laminus_url });
  };
}

async function patchSettings(request: APIRequestContext, patch: Partial<ServiceSettings>): Promise<void> {
  const res = await request.patch('/api/v1/settings', { data: patch });
  if (!res.ok()) throw new Error(`PATCH /api/v1/settings failed with ${res.status()}`);
}
