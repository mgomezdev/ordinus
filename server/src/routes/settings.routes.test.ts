import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

import settingsRoutes from './settings.routes.js';
import { setSetting } from '../services/settings.service.js';

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');

const app = express();
app.use(express.json());
app.use('/api/v1', settingsRoutes);

const LAMINUS_URL = 'http://laminus.test';

beforeAll(async () => {
  await runMigrations(testClient);
});

describe('GET /api/v1/settings/health', () => {
  const fetchMock = vi.fn();

  beforeEach(async () => {
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await setSetting('themis_url', '');
    await setSetting('laminus_url', LAMINUS_URL);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks Laminus via the /api/v1/health endpoint', async () => {
    const res = await request(app).get('/api/v1/settings/health');

    expect(res.body.laminus).toBe('up');
    expect(fetchMock).toHaveBeenCalledWith(`${LAMINUS_URL}/api/v1/health`, expect.anything());
  });

  it('never calls legacy unversioned Laminus routes', async () => {
    await request(app).get('/api/v1/settings/health');

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.every(u => u.startsWith(`${LAMINUS_URL}/api/v1/`))).toBe(true);
  });

  it('reports laminus down when the health check fails', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    const res = await request(app).get('/api/v1/settings/health');

    expect(res.body.laminus).toBe('down');
  });
});
