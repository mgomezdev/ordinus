import { chromium, expect } from '@playwright/test';
import type { FullConfig } from '@playwright/test';
import { E2E_CUSTOMERS, SAMPLE_LAYOUT } from './seed.js';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const project = config.projects[0];
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: project.use.baseURL, extraHTTPHeaders: { 'X-Ordinus-Request': '1' } });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByLabel('Password', { exact: true }).fill(process.env.ORDINUS_E2E_ADMIN_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await context.storageState({ path: project.use.storageState as string });
    const api = context.request;
    const existing = await (await api.get('/api/v1/customers')).json() as { data: { name: string }[] };
    for (const customer of E2E_CUSTOMERS) {
      if (!existing.data.some(c => c.name === customer.name)) expect((await api.post('/api/v1/customers', { data: customer })).ok()).toBe(true);
    }
    const layouts = await (await api.get('/api/v1/layouts')).json() as { data: { name: string }[] };
    if (!layouts.data.some(l => l.name === SAMPLE_LAYOUT.name)) {
      const libs = await (await api.get('/api/v1/libraries')).json() as { data: { id: string }[] };
      const libraryId = libs.data[0]?.id;
      if (!libraryId) throw new Error('Test server has no seeded libraries');
      const items = await (await api.get(`/api/v1/libraries/${libraryId}/items`)).json() as { data: { id: string; widthUnits: number; heightUnits: number }[] };
      const item = items.data[0];
      if (!item) throw new Error('Test library has no items');
      const response = await api.post('/api/v1/layouts', { data: { ...SAMPLE_LAYOUT, placedItems: [{ itemId: `${libraryId}:${item.id}`, x: 0, y: 0, width: item.widthUnits, height: item.heightUnits, rotation: 0 }] } });
      expect(response.ok()).toBe(true);
    }
  } finally { await browser.close(); }
}
