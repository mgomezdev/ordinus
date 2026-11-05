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

const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

const PART_ID = 'part-abc';
let app: ReturnType<typeof createApp>;
let refImageId: number;

async function createCustomer(name: string): Promise<number> {
  const res = await request(app).post('/api/v1/customers').send({ name });
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

beforeAll(async () => {
  await runMigrations(testClient);
  await testClient.execute({
    sql: `INSERT INTO user_stl_uploads (id, name, original_filename, file_path, status, persp_image_urls)
          VALUES (?, 'Part', 'part.stl', '/tmp/part.stl', 'ready', ?)`,
    args: [PART_ID, JSON.stringify(['/a.png', '/b.png'])],
  });
  const ref = await testClient.execute(
    `INSERT INTO ref_images (name, file_path, file_size, created_at) VALUES ('drawer', 'ref/drawer.png', 42, '') RETURNING id`,
  );
  refImageId = Number(ref.rows[0].id);
  app = createApp();
});

describe('customers API', () => {
  it('creates, lists (sorted by name), renames and deletes a customer', async () => {
    const zed = await createCustomer('Zed');
    const amy = await createCustomer('Amy');

    const list = await request(app).get('/api/v1/customers');
    const names = (list.body.data as Array<{ name: string }>).map(c => c.name);
    expect(names.indexOf('Amy')).toBeLessThan(names.indexOf('Zed'));

    const renamed = await request(app).put(`/api/v1/customers/${amy}`).send({ name: 'Amelia' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe('Amelia');

    expect((await request(app).delete(`/api/v1/customers/${zed}`)).status).toBe(204);
    expect((await request(app).delete(`/api/v1/customers/${zed}`)).status).toBe(404);
  });

  it.each([
    ['empty name', { name: '' }],
    ['missing name', {}],
    ['name too long', { name: 'x'.repeat(201) }],
  ])('rejects %s', async (_label, body) => {
    const res = await request(app).post('/api/v1/customers').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-numeric id', async () => {
    const res = await request(app).put('/api/v1/customers/abc').send({ name: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when renaming an unknown customer', async () => {
    const res = await request(app).put('/api/v1/customers/999999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  describe('parts', () => {
    it('associates idempotently, lists, and dissociates', async () => {
      const id = await createCustomer('Parts Co');
      expect((await request(app).post(`/api/v1/customers/${id}/parts/${PART_ID}`)).status).toBe(204);
      expect((await request(app).post(`/api/v1/customers/${id}/parts/${PART_ID}`)).status).toBe(204);

      const parts = await request(app).get(`/api/v1/customers/${id}/parts`);
      expect(parts.body.data).toEqual([
        expect.objectContaining({ id: PART_ID, perspImageUrls: ['/a.png', '/b.png'], status: 'ready' }),
      ]);

      expect((await request(app).delete(`/api/v1/customers/${id}/parts/${PART_ID}`)).status).toBe(204);
      expect((await request(app).get(`/api/v1/customers/${id}/parts`)).body.data).toEqual([]);
    });

    it('returns 404 for unknown part or customer', async () => {
      const id = await createCustomer('Missing Parts');
      expect((await request(app).post(`/api/v1/customers/${id}/parts/nope`)).status).toBe(404);
      expect((await request(app).post(`/api/v1/customers/999999/parts/${PART_ID}`)).status).toBe(404);
      expect((await request(app).get('/api/v1/customers/999999/parts')).status).toBe(404);
    });
  });

  describe('ref images', () => {
    it('associates idempotently, lists, and dissociates', async () => {
      const id = await createCustomer('Refs Co');
      expect((await request(app).post(`/api/v1/customers/${id}/ref-images/${refImageId}`)).status).toBe(204);
      expect((await request(app).post(`/api/v1/customers/${id}/ref-images/${refImageId}`)).status).toBe(204);

      const refs = await request(app).get(`/api/v1/customers/${id}/ref-images`);
      expect(refs.body.data).toEqual([
        expect.objectContaining({ id: refImageId, isGlobal: false, imageUrl: 'ref/drawer.png', fileSize: 42 }),
      ]);

      expect((await request(app).delete(`/api/v1/customers/${id}/ref-images/${refImageId}`)).status).toBe(204);
      expect((await request(app).get(`/api/v1/customers/${id}/ref-images`)).body.data).toEqual([]);
    });

    it('validates ids and existence', async () => {
      const id = await createCustomer('Bad Refs');
      expect((await request(app).post(`/api/v1/customers/${id}/ref-images/abc`)).status).toBe(400);
      expect((await request(app).post(`/api/v1/customers/${id}/ref-images/999999`)).status).toBe(404);
      expect((await request(app).get('/api/v1/customers/999999/ref-images')).status).toBe(404);
    });

    it('drops associations when the customer is deleted', async () => {
      const id = await createCustomer('Cascade Co');
      await request(app).post(`/api/v1/customers/${id}/ref-images/${refImageId}`);
      await request(app).delete(`/api/v1/customers/${id}`);
      const rows = await testClient.execute({
        sql: 'SELECT COUNT(*) AS n FROM customer_ref_images WHERE customer_id = ?',
        args: [id],
      });
      expect(Number(rows.rows[0].n)).toBe(0);
    });
  });
});
