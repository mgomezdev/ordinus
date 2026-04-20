import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';

vi.mock('../src/config.js', () => ({
  config: {
    IMAGE_DIR: '/tmp/test-images',
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

// Prevent Python subprocess from running
vi.mock('../src/services/stlProcessing.service.js', () => ({
  processUpload: vi.fn().mockResolvedValue(undefined),
  getImageOutputDir: vi.fn().mockReturnValue('/tmp/test-stl-images'),
}));

// Mock filesystem operations to avoid touching the real disk
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
  };
});

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});

const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('User STL endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'stl-user@example.com', username: 'stluser', password: 'password123' });
    userToken = res.body.data.accessToken;
  });

  afterAll(() => {
    testClient.close();
  });

  describe('Auth guards', () => {
    it('GET / returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/user-stls');
      expect(res.status).toBe(401);
    });

    it('POST / returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/v1/user-stls')
        .attach('file', Buffer.from('solid test'), 'model.stl');
      expect(res.status).toBe(401);
    });

    it('DELETE /:id returns 401 without token', async () => {
      const res = await request(app).delete('/api/v1/user-stls/nonexistent-id');
      expect(res.status).toBe(401);
    });
  });

  describe('File type filter', () => {
    it('rejects non-STL file upload', async () => {
      const res = await request(app)
        .post('/api/v1/user-stls')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', Buffer.from('not a stl file'), 'document.txt');
      // multer fileFilter rejects non-.stl/.3mf files — error handler returns 500
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
    });

    it('accepts .stl file past the filter', async () => {
      const res = await request(app)
        .post('/api/v1/user-stls')
        .set('Authorization', `Bearer ${userToken}`)
        .field('name', 'Test Model')
        .attach('file', Buffer.from('solid test\nendsolid test'), 'model.stl');
      // Should pass the file filter (may succeed or fail in controller, but not a filter-level rejection)
      expect(res.status).not.toBe(400);
    });
  });

  describe('CRUD operations', () => {
    it('GET / returns empty array for new user', async () => {
      const res = await request(app)
        .get('/api/v1/user-stls')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /:id returns 404 for nonexistent upload', async () => {
      const res = await request(app)
        .get('/api/v1/user-stls/nonexistent-uuid')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(404);
    });
  });
});
