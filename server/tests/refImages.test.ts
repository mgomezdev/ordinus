import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import request, { authenticateTestAdmin } from './adminRequest.js';
import pino from 'pino';
import sharp from 'sharp';

const { imageDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('node:path') as typeof import('node:path');
  return { imageDir: mkdtempSync(pathJoin(tmpdir(), 'ref-images-test-')) };
});

vi.mock('../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config.js')>();
  return { config: { ...actual.config, IMAGE_DIR: imageDir, DB_PATH: ':memory:', NODE_ENV: 'test' } };
});

vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client, authClient: client };
});

vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

const { createApp } = await import('../src/app.js');
const { client } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

let app: ReturnType<typeof createApp>;
let png: Buffer;

async function upload(filename: string): Promise<{ id: number; imageUrl: string }> {
  const res = await request(app).post('/api/v1/ref-images').attach('image', png, filename);
  expect(res.status).toBe(201);
  return res.body.data;
}

beforeAll(async () => {
  await runMigrations(client);
  png = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 120, b: 200 } },
  }).png().toBuffer();
  app = createApp();
    await authenticateTestAdmin(app);
});

afterAll(() => {
  // sharp's file cache keeps handles open, which blocks deletion on Windows
  sharp.cache(false);
  rmSync(imageDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('ref images API', () => {
  it('uploads, lists, renames and deletes an image', async () => {
    const img = await upload('drawer.png');
    expect(existsSync(join(imageDir, img.imageUrl))).toBe(true);

    const list = await request(app).get('/api/v1/ref-images');
    expect(list.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: img.id, name: 'drawer.png', isGlobal: true }),
    ]));

    const renamed = await request(app).patch(`/api/v1/ref-images/${img.id}`).send({ name: 'Top drawer' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Top drawer');

    expect((await request(app).delete(`/api/v1/ref-images/${img.id}`)).status).toBe(204);
    expect(existsSync(join(imageDir, img.imageUrl))).toBe(false);
    expect((await request(app).delete(`/api/v1/ref-images/${img.id}`)).status).toBe(404);
  });

  it('scopes customer-associated images to that customer', async () => {
    const shared = await upload('shared.png');
    const privateImg = await upload('private.png');
    const cust = await client.execute(
      `INSERT INTO customers (name, created_at, updated_at) VALUES ('Owner', '', '') RETURNING id`,
    );
    const ownerId = Number(cust.rows[0].id);
    const other = await client.execute(
      `INSERT INTO customers (name, created_at, updated_at) VALUES ('Other', '', '') RETURNING id`,
    );
    const otherId = Number(other.rows[0].id);
    await request(app).post(`/api/v1/customers/${ownerId}/ref-images/${privateImg.id}`);

    const idsFor = async (query: string) =>
      ((await request(app).get(`/api/v1/ref-images${query}`)).body.data as Array<{ id: number }>).map(i => i.id);

    expect(await idsFor(`?customerId=${ownerId}`)).toEqual(expect.arrayContaining([shared.id, privateImg.id]));
    const otherIds = await idsFor(`?customerId=${otherId}`);
    expect(otherIds).toContain(shared.id);
    expect(otherIds).not.toContain(privateImg.id);
    expect(await idsFor('')).toEqual(expect.arrayContaining([shared.id, privateImg.id]));
  });

  it('rejects an upload without a file', async () => {
    const res = await request(app).post('/api/v1/ref-images');
    expect(res.status).toBe(400);
  });

  it('validates rename input', async () => {
    const img = await upload('rename.png');
    expect((await request(app).patch(`/api/v1/ref-images/${img.id}`).send({ name: '' })).status).toBe(400);
    expect((await request(app).patch('/api/v1/ref-images/abc').send({ name: 'x' })).status).toBe(400);
    expect((await request(app).patch('/api/v1/ref-images/999999').send({ name: 'x' })).status).toBe(404);
  });
});
