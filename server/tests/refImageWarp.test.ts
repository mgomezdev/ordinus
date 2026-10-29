import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import pino from 'pino';
import sharp from 'sharp';

const { imageDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join: pathJoin } = require('node:path') as typeof import('node:path');
  return { imageDir: mkdtempSync(pathJoin(tmpdir(), 'ref-warp-test-')) };
});

vi.mock('../src/config.js', () => ({
  config: {
    IMAGE_DIR: imageDir,
    USER_STL_DIR: '/tmp/test-user-stls',
    USER_STL_IMAGE_DIR: '/tmp/test-stl-images',
    PORT: 3001,
    NODE_ENV: 'test',
    DB_PATH: ':memory:',
    LOG_LEVEL: 'silent',
    CORS_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    MAX_STL_WORKERS: 1,
    PYTHON_SCRIPT_DIR: '/tmp/test-scripts',
  },
}));

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

const { createApp } = await import('../src/app.js');
const { client } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

afterAll(() => {
  rmSync(imageDir, { recursive: true, force: true });
});

const NEAR_RECT = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.11 },
  { x: 0.89, y: 0.9 },
  { x: 0.11, y: 0.89 },
];

const TRAPEZOID = [
  { x: 0.3, y: 0.2 },
  { x: 0.7, y: 0.2 },
  { x: 0.9, y: 0.8 },
  { x: 0.1, y: 0.8 },
];

describe('POST /api/v1/ref-images/:id/warp', () => {
  let app: ReturnType<typeof createApp>;
  let refImageId: number;

  beforeAll(async () => {
    await runMigrations(client);
    mkdirSync(join(imageDir, 'ref-lib'), { recursive: true });
    const png = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 200, g: 120, b: 40 } },
    }).png().toBuffer();
    writeFileSync(join(imageDir, 'ref-lib', 'drawer.png'), png);
    const inserted = await client.execute({
      sql: "INSERT INTO ref_images (name, file_path, file_size, created_at) VALUES ('drawer.png', 'ref-lib/drawer.png', ?, '') RETURNING id",
      args: [png.length],
    });
    refImageId = Number(inserted.rows[0].id);
    app = createApp();
  });

  it.each([
    ['near-rectangular', NEAR_RECT],
    ['trapezoid', TRAPEZOID],
  ])('warps a %s quad and returns an overflowing placement', async (_label, corners) => {
    const res = await request(app)
      .post(`/api/v1/ref-images/${refImageId}/warp`)
      .send({ corners, aspectRatio: 4 / 3 });

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.warpedImageUrl).toMatch(/^ref-warp\/[0-9a-f-]+\.webp$/);
    expect(existsSync(join(imageDir, data.warpedImageUrl))).toBe(true);
    // The grid (0–100%) is always inside the warped image's extent
    expect(data.x).toBeLessThanOrEqual(0);
    expect(data.y).toBeLessThanOrEqual(0);
    expect(data.x + data.width).toBeGreaterThanOrEqual(100);
    expect(data.y + data.height).toBeGreaterThanOrEqual(100);

    const meta = await sharp(join(imageDir, data.warpedImageUrl)).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it('does not modify the original image', async () => {
    const before = await sharp(join(imageDir, 'ref-lib', 'drawer.png')).metadata();
    await request(app).post(`/api/v1/ref-images/${refImageId}/warp`).send({ corners: TRAPEZOID, aspectRatio: 1 });
    const after = await sharp(join(imageDir, 'ref-lib', 'drawer.png')).metadata();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  it('rejects a quad with corner angles outside 50°–135°', async () => {
    const res = await request(app)
      .post(`/api/v1/ref-images/${refImageId}/warp`)
      .send({
        corners: [{ x: 0.4, y: 0.6 }, { x: 0.6, y: 0.6 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        aspectRatio: 1,
      });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/50°/);
  });

  it('rejects malformed corners', async () => {
    const res = await request(app)
      .post(`/api/v1/ref-images/${refImageId}/warp`)
      .send({ corners: [{ x: 0, y: 0 }], aspectRatio: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown image', async () => {
    const res = await request(app)
      .post('/api/v1/ref-images/99999/warp')
      .send({ corners: NEAR_RECT, aspectRatio: 1 });
    expect(res.status).toBe(404);
  });
});

describe('layouts persist alignment data', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp();
  });

  it('saves and reloads corners and the warped image alongside the original', async () => {
    const refRows = await client.execute('SELECT id FROM ref_images LIMIT 1');
    const refImageId = Number(refRows.rows[0].id);
    const warp = await request(app)
      .post(`/api/v1/ref-images/${refImageId}/warp`)
      .send({ corners: TRAPEZOID, aspectRatio: 1 });
    expect(warp.status).toBe(200);

    const created = await request(app).post('/api/v1/layouts').send({
      name: 'Aligned', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
      placedItems: [],
      refImagePlacements: [{
        refImageId, name: 'drawer.png',
        x: warp.body.data.x, y: warp.body.data.y,
        width: warp.body.data.width, height: warp.body.data.height,
        opacity: 0.5, scale: 1, isLocked: true, rotation: 0,
        corners: TRAPEZOID, warpedImageUrl: warp.body.data.warpedImageUrl,
      }],
    });
    expect(created.status).toBe(201);

    const loaded = await request(app).get(`/api/v1/layouts/${created.body.data.id}`);
    expect(loaded.status).toBe(200);
    const [placement] = loaded.body.data.refImagePlacements;
    expect(placement.corners).toEqual(TRAPEZOID);
    expect(placement.warpedImageUrl).toBe(warp.body.data.warpedImageUrl);
    expect(placement.imageUrl).toBe('ref-lib/drawer.png');
    expect(placement.x).toBeCloseTo(warp.body.data.x, 6);
  });

  it('rejects a warped image path outside the warp directory', async () => {
    const refRows = await client.execute('SELECT id FROM ref_images LIMIT 1');
    const res = await request(app).post('/api/v1/layouts').send({
      name: 'Bad', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
      placedItems: [],
      refImagePlacements: [{
        refImageId: Number(refRows.rows[0].id), name: 'x',
        x: 0, y: 0, width: 100, height: 100,
        opacity: 0.5, scale: 1, isLocked: true, rotation: 0,
        corners: NEAR_RECT, warpedImageUrl: '../../etc/passwd',
      }],
    });
    expect(res.status).toBe(400);
  });
});
