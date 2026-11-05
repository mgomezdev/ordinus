import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';

vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

vi.mock('../src/services/layoutThumbnail.service.js', () => ({
  generate: vi.fn().mockResolvedValue(undefined),
  deleteThumbnail: vi.fn().mockResolvedValue(undefined),
}));

const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

let app: ReturnType<typeof createApp>;

const layoutBody = {
  name: 'Kitchen drawer',
  gridX: 4,
  gridY: 3,
  widthMm: 168,
  depthMm: 126,
  placedItems: [
    { itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 2, height: 2, rotation: 0 },
  ],
};

async function createLayout(overrides: Record<string, unknown> = {}): Promise<number> {
  const res = await request(app).post('/api/v1/layouts').send({ ...layoutBody, ...overrides });
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

beforeAll(async () => {
  await runMigrations(testClient);
  app = createApp();
});

describe('layouts API', () => {
  it('round-trips create → get → update → meta → clone → delete', async () => {
    const id = await createLayout();

    const loaded = await request(app).get(`/api/v1/layouts/${id}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.data).toMatchObject({ name: 'Kitchen drawer', gridX: 4, gridY: 3 });
    expect(loaded.body.data.placedItems).toHaveLength(1);

    const updated = await request(app).put(`/api/v1/layouts/${id}`).send({
      ...layoutBody,
      name: 'Bigger drawer',
      placedItems: [
        { itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 2, height: 2, rotation: 0 },
        { itemId: 'bins_standard:bin-1x1', x: 2, y: 0, width: 2, height: 2, rotation: 90 },
      ],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.placedItems).toHaveLength(2);

    const meta = await request(app).patch(`/api/v1/layouts/${id}`).send({ description: 'notes' });
    expect(meta.status).toBe(200);
    expect(meta.body.data).toMatchObject({ name: 'Bigger drawer', description: 'notes' });

    const clone = await request(app).post(`/api/v1/layouts/${id}/clone`);
    expect(clone.status).toBe(201);
    expect(clone.body.data.name).toBe('Copy of Bigger drawer');

    expect((await request(app).delete(`/api/v1/layouts/${id}`)).status).toBe(204);
    expect((await request(app).get(`/api/v1/layouts/${id}`)).status).toBe(404);
  });

  it('lists layouts with pagination metadata', async () => {
    await createLayout({ name: 'list-a' });
    await createLayout({ name: 'list-b' });
    const res = await request(app).get('/api/v1/layouts?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.nextCursor).toEqual(expect.any(String));
  });

  it.each([
    ['missing name', { ...layoutBody, name: undefined }],
    ['bad rotation', { ...layoutBody, placedItems: [{ ...layoutBody.placedItems[0], rotation: 45 }] }],
    ['negative position', { ...layoutBody, placedItems: [{ ...layoutBody.placedItems[0], x: -1 }] }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).post('/api/v1/layouts').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-numeric id', async () => {
    expect((await request(app).get('/api/v1/layouts/abc')).status).toBe(400);
  });
});

