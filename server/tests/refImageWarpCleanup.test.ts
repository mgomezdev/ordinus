import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rmSync, mkdirSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
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
  return { imageDir: mkdtempSync(pathJoin(tmpdir(), 'ref-warp-cleanup-test-')) };
});

vi.mock('../src/config.js', () => ({
  config: {
    IMAGE_DIR: imageDir,
    THUMBNAIL_DIR: `${imageDir}/thumbnails`,
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

const { cleanupOrphanedWarps } = await import('../src/services/refImageWarp.service.js');

afterAll(() => {
  rmSync(imageDir, { recursive: true, force: true });
});

const TRAPEZOID = [
  { x: 0.3, y: 0.2 },
  { x: 0.7, y: 0.2 },
  { x: 0.9, y: 0.8 },
  { x: 0.1, y: 0.8 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

let app: ReturnType<typeof createApp>;
let refImageId: number;

beforeAll(async () => {
  await runMigrations(client);
  mkdirSync(join(imageDir, 'ref-lib'), { recursive: true });
  const png = await sharp({
    create: { width: 120, height: 90, channels: 3, background: { r: 90, g: 120, b: 40 } },
  }).png().toBuffer();
  writeFileSync(join(imageDir, 'ref-lib', 'drawer.png'), png);
  const inserted = await client.execute({
    sql: "INSERT INTO ref_images (name, file_path, file_size, created_at) VALUES ('drawer.png', 'ref-lib/drawer.png', ?, '') RETURNING id",
    args: [png.length],
  });
  refImageId = Number(inserted.rows[0].id);
  app = createApp();
});

async function warp(): Promise<string> {
  const res = await request(app)
    .post(`/api/v1/ref-images/${refImageId}/warp`)
    .send({ corners: TRAPEZOID, aspectRatio: 1 });
  expect(res.status).toBe(200);
  return res.body.data.warpedImageUrl as string;
}

function warpExists(path: string): boolean {
  return existsSync(join(imageDir, path));
}

function layoutBody(warpedImageUrl: string | null) {
  return {
    name: 'Cleanup', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168,
    placedItems: [],
    refImagePlacements: [{
      refImageId, name: 'drawer.png',
      x: -10, y: -10, width: 120, height: 120,
      opacity: 0.5, scale: 1, isLocked: true, rotation: 0,
      corners: warpedImageUrl ? TRAPEZOID : null,
      warpedImageUrl,
    }],
  };
}

async function saveLayout(warpedImageUrl: string | null): Promise<number> {
  const res = await request(app).post('/api/v1/layouts').send(layoutBody(warpedImageUrl));
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

function filenameOf(path: string): string {
  return path.split('/')[1];
}

describe('DELETE /api/v1/ref-images/warps/:filename', () => {
  it('deletes a warp that no saved layout references (re-align / unalign before saving)', async () => {
    const path = await warp();
    const res = await request(app).delete(`/api/v1/ref-images/warps/${filenameOf(path)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    expect(warpExists(path)).toBe(false);
  });

  it('keeps a warp still referenced by a saved layout', async () => {
    const path = await warp();
    await saveLayout(path);
    const res = await request(app).delete(`/api/v1/ref-images/warps/${filenameOf(path)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(false);
    expect(warpExists(path)).toBe(true);
  });

  it('is idempotent for a file that is already gone', async () => {
    const res = await request(app).delete('/api/v1/ref-images/warps/00000000-0000-0000-0000-000000000000.webp');
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(false);
  });

  it.each([
    'drawer.png',
    '..%2Fref-lib%2Fdrawer.png',
    'not-a-uuid.webp',
  ])('rejects filename %s', async (filename) => {
    const res = await request(app).delete(`/api/v1/ref-images/warps/${filename}`);
    expect(res.status).toBe(400);
    expect(existsSync(join(imageDir, 'ref-lib', 'drawer.png'))).toBe(true);
  });
});

describe('layout saves release warps they no longer use', () => {
  it('deletes the old warp when an update re-aligns the image', async () => {
    const oldPath = await warp();
    const layoutId = await saveLayout(oldPath);
    const newPath = await warp();

    const res = await request(app).put(`/api/v1/layouts/${layoutId}`).send(layoutBody(newPath));
    expect(res.status).toBe(200);
    expect(warpExists(oldPath)).toBe(false);
    expect(warpExists(newPath)).toBe(true);
  });

  it('deletes the warp when an update unaligns the image', async () => {
    const path = await warp();
    const layoutId = await saveLayout(path);

    const res = await request(app).put(`/api/v1/layouts/${layoutId}`).send(layoutBody(null));
    expect(res.status).toBe(200);
    expect(warpExists(path)).toBe(false);
  });

  it('keeps a warp shared with a duplicated layout', async () => {
    const path = await warp();
    const layoutId = await saveLayout(path);
    const clone = await request(app).post(`/api/v1/layouts/${layoutId}/clone`).send({});
    expect(clone.status).toBe(201);

    await request(app).put(`/api/v1/layouts/${layoutId}`).send(layoutBody(null));
    expect(warpExists(path)).toBe(true);

    await request(app).delete(`/api/v1/layouts/${clone.body.data.id}`);
    expect(warpExists(path)).toBe(false);
  });

  it('deletes a layout\'s warps when the layout is deleted', async () => {
    const path = await warp();
    const layoutId = await saveLayout(path);
    const res = await request(app).delete(`/api/v1/layouts/${layoutId}`);
    expect(res.status).toBe(204);
    expect(warpExists(path)).toBe(false);
  });
});

describe('cleanupOrphanedWarps', () => {
  function age(path: string, ms: number) {
    const when = new Date(Date.now() - ms);
    utimesSync(join(imageDir, path), when, when);
  }

  it('removes only unreferenced warps older than the grace period', async () => {
    const abandoned = await warp();
    age(abandoned, 8 * DAY_MS);
    const recentUnsaved = await warp();
    age(recentUnsaved, DAY_MS);
    const savedOld = await warp();
    await saveLayout(savedOld);
    age(savedOld, 30 * DAY_MS);

    const removed = await cleanupOrphanedWarps(7 * DAY_MS);

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(warpExists(abandoned)).toBe(false);
    expect(warpExists(recentUnsaved)).toBe(true);
    expect(warpExists(savedOld)).toBe(true);
  });

  it('ignores files that are not warps', async () => {
    const stray = join(imageDir, 'ref-warp', 'notes.txt');
    writeFileSync(stray, 'keep me');
    age('ref-warp/notes.txt', 30 * DAY_MS);
    await cleanupOrphanedWarps(7 * DAY_MS);
    expect(existsSync(stray)).toBe(true);
  });
});
