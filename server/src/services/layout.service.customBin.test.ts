import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('../db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');
import { createLayout, getLayoutById, cloneLayout } from './layout.service.js';

beforeAll(async () => {
  await runMigrations(testClient);
});

const spec = { width: 2.5, depth: 1.5, height: 3.5, overrides: { magnet_diameter: 6.5 } };
const layoutData = {
  name: 'Half units', gridX: 6, gridY: 6, widthMm: 252, depthMm: 252,
  placedItems: [{ itemId: 'custom:custom-abc', x: 0.5, y: 1.5, width: 2.5, height: 1.5, rotation: 0, customSpec: spec }],
};

describe('layout service — custom bins', () => {
  it('round-trips half-unit geometry and customSpec', async () => {
    const created = await createLayout(layoutData);
    const loaded = await getLayoutById(created.id);
    expect(loaded.placedItems[0]).toMatchObject({
      libraryId: 'custom', itemId: 'custom-abc', x: 0.5, y: 1.5, width: 2.5, height: 1.5, customSpec: spec,
    });
  });

  it('keeps customSpec when a layout is duplicated', async () => {
    const created = await createLayout(layoutData);
    const copy = await cloneLayout(created.id);
    expect(copy.placedItems[0]).toMatchObject({ x: 0.5, width: 2.5, customSpec: spec });
  });
});
