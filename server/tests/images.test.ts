import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rmSync } from 'node:fs';
import request, { authenticateTestAdmin } from './adminRequest.js';
import pino from 'pino';

// vi.hoisted runs before vi.mock factories and before ESM imports are initialized.
// Use require() inside the callback so node:fs/os/path are available.
const { imageDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'images-test-'));
  mkdirSync(join(dir, 'testlib'), { recursive: true });
  writeFileSync(join(dir, 'testlib', 'test.png'), Buffer.from('fake-png-content'));
  return { imageDir: dir };
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
  return { db, client, authClient: client };
});

vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

const { createApp } = await import('../src/app.js');

describe('GET /api/v1/images/:libraryId/:filename', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    app = createApp();
    await authenticateTestAdmin(app);
  });

  afterAll(() => {
    rmSync(imageDir, { recursive: true, force: true });
  });

  it('serves an existing image with cache headers', async () => {
    const res = await request(app).get('/api/v1/images/testlib/test.png');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 404 for a file that does not exist', async () => {
    const res = await request(app).get('/api/v1/images/testlib/missing.png');
    expect(res.status).toBe(404);
  });

  it('rejects path traversal in libraryId', async () => {
    const res = await request(app).get('/api/v1/images/..%2Fetc/passwd');
    expect(res.status).toBe(400);
  });

  it('rejects path traversal in filename', async () => {
    const res = await request(app).get('/api/v1/images/testlib/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
  });

  it('rejects null bytes in path components', async () => {
    const res = await request(app).get('/api/v1/images/testlib%00evil/test.png');
    expect(res.status).toBe(400);
  });
});
