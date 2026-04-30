import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

vi.mock('../src/config.js', () => ({
  config: {
    IMAGE_DIR: '/tmp/test-images',
    USER_STL_DIR: '/tmp/test-user-stls',
    USER_STL_IMAGE_DIR: '/tmp/test-stl-images',
    PORT: 3001, NODE_ENV: 'test', DB_PATH: ':memory:',
    LOG_LEVEL: 'silent', CORS_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret', JWT_REFRESH_SECRET: 'test-refresh-secret',
    MAX_STL_WORKERS: 1, PYTHON_SCRIPT_DIR: '/tmp/scripts',
  },
}));

// Mock sync fs used by userStls.routes.ts at module load
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, mkdirSync: vi.fn() };
});

// Mock async fs used by adminUserStls.controller.ts
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' })),
  };
});

vi.mock('../src/services/stlProcessing.service.js', () => ({
  processUpload: vi.fn().mockResolvedValue(undefined),
  getImageOutputDir: vi.fn().mockReturnValue('/tmp/test-stl-images'),
}));

const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Admin User STL endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'admin-stl-user@example.com', username: 'admstluser', password: 'password123' });
    userToken = res1.body.data.accessToken;

    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'admin-stl-admin@example.com', username: 'admstladmin', password: 'password123' });
    await testClient.execute(`UPDATE users SET role='admin' WHERE email='admin-stl-admin@example.com'`);
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin-stl-admin@example.com', password: 'password123' });
    adminToken = res2.body.data.accessToken;
  });

  afterAll(() => { testClient.close(); });

  describe('Auth + admin guards', () => {
    it('GET /admin/user-stls returns 401 without token', async () => {
      expect((await request(app).get('/api/v1/admin/user-stls')).status).toBe(401);
    });

    it('GET /admin/user-stls returns 403 for regular user', async () => {
      expect(
        (await request(app)
          .get('/api/v1/admin/user-stls')
          .set('Authorization', `Bearer ${userToken}`)).status
      ).toBe(403);
    });

    it('POST /admin/user-stls/:id/promote returns 401 without token', async () => {
      expect((await request(app).post('/api/v1/admin/user-stls/fake-id/promote')).status).toBe(401);
    });
  });

  describe('Admin operations', () => {
    it('GET /admin/user-stls returns empty array for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/user-stls')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /admin/user-stls/:id/promote returns 404 for nonexistent id', async () => {
      const res = await request(app)
        .post('/api/v1/admin/user-stls/nonexistent-id/promote')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
