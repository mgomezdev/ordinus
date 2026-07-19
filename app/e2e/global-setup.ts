import { rm, mkdir } from 'fs/promises';
import { E2E_CUSTOMERS, SAMPLE_LAYOUT } from './seed.js';

const TEST_IMAGE_DIR = '/tmp/gridfinity-e2e-images';
const SERVER_URL = process.env.ORDINUS_URL ?? 'http://localhost:3001';

export default async function globalSetup(): Promise<void> {
  await rm(TEST_IMAGE_DIR, { recursive: true, force: true });
  await mkdir(TEST_IMAGE_DIR, { recursive: true });
  await seedTestData();
}

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${SERVER_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function seedTestData(): Promise<void> {
  // Seed known customers so E2E tests have stable entities to reference.
  const existingResp = await fetch(`${SERVER_URL}/api/v1/customers`);
  if (!existingResp.ok) return; // server not ready — skip seed gracefully
  const existing: { data: { name: string }[] } = await existingResp.json();
  const existingNames = new Set(existing.data.map((c) => c.name));

  for (const customer of E2E_CUSTOMERS) {
    if (!existingNames.has(customer.name)) {
      await post('/customers', customer);
    }
  }

  // Seed one sample layout using the first available library item.
  // The server auto-seeds library data on boot, so this is always available.
  const libsResp = await fetch(`${SERVER_URL}/api/v1/libraries`);
  if (!libsResp.ok) return;
  const libs: { data: { id: string }[] } = await libsResp.json();
  if (!libs.data.length) return;

  const libraryId = libs.data[0].id;
  const itemsResp = await fetch(`${SERVER_URL}/api/v1/libraries/${libraryId}/items`);
  if (!itemsResp.ok) return;
  const items: { data: { id: string; widthUnits: number; heightUnits: number }[] } =
    await itemsResp.json();
  if (!items.data.length) return;

  const item = items.data[0];

  // Only create the layout if it doesn't exist yet (idempotent across test runs
  // where the server persists between suites without a restart).
  const layoutsResp = await fetch(`${SERVER_URL}/api/v1/layouts`);
  if (!layoutsResp.ok) return;
  const layouts: { data: { name: string }[] } = await layoutsResp.json();
  const layoutNames = new Set(layouts.data.map((l) => l.name));

  if (!layoutNames.has(SAMPLE_LAYOUT.name)) {
    await post('/layouts', {
      ...SAMPLE_LAYOUT,
      placedItems: [
        {
          libraryId,
          itemId: item.id,
          x: 0,
          y: 0,
          width: item.widthUnits,
          height: item.heightUnits,
          rotation: 0,
          quantity: 1,
        },
      ],
    });
  }
}
