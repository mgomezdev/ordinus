import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';

// Mock the connection module to use in-memory DB
vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');

  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });

  return { db, client };
});

// Mock the logger with a real pino instance (silent) so pino-http works
vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

// Import after mocks are set up
const { createApp } = await import('../src/app.js');
const { client: mockedClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Health endpoints', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runMigrations(mockedClient);
    app = createApp();
  });

  afterAll(() => {
    mockedClient.close();
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.version).toBe('1.0.0');
      expect(typeof res.body.data.uptime).toBe('number');
    });

    it('includes X-Request-Id header', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('returns 200 with db connected', async () => {
      const res = await request(app).get('/api/v1/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.db).toBe('connected');
    });
  });
});
