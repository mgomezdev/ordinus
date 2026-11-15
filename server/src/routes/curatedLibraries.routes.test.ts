import { beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  return { client: createClient({ url: ':memory:' }) };
});
import router from './curatedLibraries.routes.js';
import { client } from '../db/connection.js';
import { runMigrations } from '../db/migrate.js';
import { errorHandler } from '../middleware/errorHandler.js';

const app = express();
app.use(express.json());
app.use('/curated-libraries', router);
app.use(errorHandler);
const library = { id: 'kitchen', name: 'Kitchen', description: 'Silverware', entries: [
  { id: 'tray', name: 'Tray', kind: 'fixed', sourceId: 'bins:tray', width: 3, depth: 2 },
  { id: 'cup', name: 'Cup', kind: 'parametric', generator: 'basic-cup', width: { min: 0.5, max: 20, step: 0.5 }, depth: { fixed: 2 }, defaults: { height: 4 }, groups: [] },
] };

beforeAll(async () => {
  await runMigrations(client);
  await client.execute("INSERT INTO libraries (id, name) VALUES ('bins', 'Bins')");
  await client.execute("INSERT INTO library_items (library_id, id, name, width_units, height_units) VALUES ('bins', 'tray', 'Tray', 3, 2)");
});

describe('curated library persistence', () => {
  it('creates, reads, edits, reorders, and deletes a collection without copying model assets', async () => {
    expect((await request(app).post('/curated-libraries').send(library)).status).toBe(201);
    expect((await request(app).post('/curated-libraries').send(library)).status).toBe(409);
    expect((await request(app).get('/curated-libraries')).body.data).toEqual([library]);
    const edited = { ...library, name: 'Cutlery', entries: [...library.entries].reverse() };
    expect((await request(app).put('/curated-libraries/kitchen').send(edited)).status).toBe(200);
    expect((await request(app).get('/curated-libraries')).body.data).toEqual([edited]);
    expect((await client.execute('SELECT * FROM library_items')).rows).toHaveLength(1);
    expect((await request(app).delete('/curated-libraries/kitchen')).status).toBe(204);
    expect((await request(app).get('/curated-libraries')).body.data).toEqual([]);
    expect((await request(app).put('/curated-libraries/kitchen').send(edited)).status).toBe(404);
  });
  it('rejects missing/inactive sources, stale footprints, invalid presets and mismatched ids', async () => {
    for (const entry of [
      { ...library.entries[0], sourceId: 'missing:tray' },
      { ...library.entries[0], width: 4 },
      { ...library.entries[1], defaults: { height: -1 } },
    ]) expect((await request(app).post('/curated-libraries').send({ ...library, entries: [entry] })).status).toBe(400);
    expect((await request(app).post('/curated-libraries').send({ name: 'bad' })).status).toBe(400);
    expect((await request(app).put('/curated-libraries/other').send(library)).status).toBe(400);
    await client.execute("UPDATE library_items SET is_active = 0");
    expect((await request(app).post('/curated-libraries').send(library)).status).toBe(400);
  });
  it('accepts ready uploaded bins with a known footprint and rejects pending uploads', async () => {
    await client.execute("INSERT INTO user_stl_uploads (id, name, original_filename, file_path, grid_x, grid_y, status) VALUES ('upload', 'Uploaded tray', 'tray.stl', 'tray.stl', 3, 2, 'ready')");
    const uploaded = { ...library, id: 'uploaded', entries: [{ ...library.entries[0], sourceId: 'user-stl:upload' }] };
    expect((await request(app).post('/curated-libraries').send(uploaded)).status).toBe(201);
    await client.execute("UPDATE user_stl_uploads SET status = 'processing'");
    expect((await request(app).put('/curated-libraries/uploaded').send(uploaded)).status).toBe(400);
  });
});
