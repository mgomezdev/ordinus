import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildCustomBinParams } from '@gridfinity/shared';
import { computeParamHash } from '../src/utils/generationParams.js';
import { buildGenerateParams } from '../src/services/bomGeneration.service.js';

const { root } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), 'ordinus-guest-models-')) };
});
vi.mock('../src/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/config.js')>('../src/config.js');
  return { config: { ...actual.config, IMAGE_DIR: `${root}/images`, USER_STL_IMAGE_DIR: `${root}/uploads`, GENERATED_STL_DIR: `${root}/generated` } };
});
vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');
  const client = createClient({ url: ':memory:' });
  return { client, authClient: client, db: drizzle(client, { schema }) };
});
vi.mock('../src/logger.js', () => ({ logger: pino({ level: 'silent' }) }));
vi.mock('../src/services/layoutThumbnail.service.js', () => ({ generate: vi.fn(), deleteThumbnail: vi.fn() }));
vi.mock('../src/services/generationPipeline.service.js', async () => {
  const { EventEmitter } = await import('node:events');
  return { generationPipeline: Object.assign(new EventEmitter(), { enqueue: vi.fn(async () => 'pending'), getStatus: vi.fn(async () => 'pending') }) };
});
const { client } = await import('../src/db/connection.js');
const { createApp } = await import('../src/app.js');
const { authenticateTestAdmin, default: owner } = await import('./adminRequest.js');
const { generationPipeline } = await import('../src/services/generationPipeline.service.js');
const app = createApp();
function file(relative: string, contents = 'model-image') {
  const full = join(root, relative); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, contents);
}
beforeAll(async () => {
  await authenticateTestAdmin(app);
  await client.execute("INSERT OR IGNORE INTO libraries (id, name, base_model_path) VALUES ('bins_standard', 'Standard', '/test/model.scad')");
  await client.execute("INSERT OR IGNORE INTO libraries (id, name, base_model_path) VALUES ('test-static', 'Static', NULL)");
  await client.execute("INSERT INTO library_items (library_id, id, name, width_units, height_units, image_path, perspective_image_path) VALUES ('test-static', 'tray', 'Tray', 2, 1, 'models/tray.png', 'models/tray-perspective.png')");
  file('images/models/tray.png'); file('images/models/tray-perspective-90.png');
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
async function fixture(itemId = 'test-static:tray', rotation = 90) {
  const created = await owner(app).post('/api/v1/layouts').send({ name: 'Model drawer', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168, placedItems: [{ itemId, x: 0, y: 0, width: 2, height: 4, rotation }] });
  expect(created.status).toBe(201);
  const layoutId = Number(created.body.data.id);
  const binId = Number(created.body.data.placedItems[0].id);
  const issued = await owner(app).post(`/api/v1/layouts/${layoutId}/guest-links`).send({ expiresInHours: 24 });
  expect(issued.status).toBe(201);
  const link = issued.body as { id: string; secret: string };
  const joined = await request(app).post(`/api/v1/guest/${link.id}/join`).set('X-Ordinus-Request', '1').send({ secret: link.secret });
  return { layoutId, binId, base: `/api/v1/guest/${link.id}`, cookie: String(joined.headers['set-cookie'][0]).split(';')[0] };
}
describe('scoped guest model previews', () => {
  it('serves the correct static top and rotated perspective, without exposing paths or other placements', async () => {
    const a = await fixture(); const b = await fixture();
    const models = await request(app).get(`${a.base}/models`).set('Cookie', a.cookie);
    expect(models.status).toBe(200);
    expect(models.body.bins).toEqual([{ id: a.binId, topUrl: `${a.base}/bins/${a.binId}/top`, perspectiveUrl: `${a.base}/bins/${a.binId}/perspective`, topRotation: 90, status: 'ready' }]);
    expect(JSON.stringify(models.body)).not.toMatch(/tray\.png|test-static|filePath|paramHash/);
    for (const view of ['top', 'perspective']) {
      const response = await request(app).get(`${a.base}/bins/${a.binId}/${view}`).set('Cookie', a.cookie);
      expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
      expect((await request(app).get(`${a.base}/bins/${b.binId}/${view}`).set('Cookie', a.cookie)).status).toBe(404);
      expect((await request(app).get(`${a.base}/bins/${a.binId}/${view}`)).status).toBe(410);
    }
    expect((await request(app).get(`${a.base}/bins/${a.binId}/bin.stl`).set('Cookie', a.cookie)).status).toBe(400);
    await owner(app).delete(`/api/v1/layouts/${a.layoutId}/guest-links/${a.base.split('/').at(-1)}`);
    expect((await request(app).get(`${a.base}/bins/${a.binId}/top`).set('Cookie', a.cookie)).status).toBe(410);
    expect((await request(app).get(`${a.base}/models`).set('Cookie', a.cookie)).status).toBe(410);
  });
  it('uses exactly the saved custom parameters, never an unrelated library/default image', async () => {
    const a = await fixture();
    const spec = { width: 2, depth: 1, height: 3, overrides: { lip_style: 'none' } };
    const hash = computeParamHash(buildCustomBinParams(spec));
    await client.execute({ sql: 'UPDATE placed_items SET custom_spec = ? WHERE id = ?', args: [JSON.stringify(spec), a.binId] });
    await owner(app).post(`/api/v1/layouts/${a.layoutId}/guest-links`).send({ expiresInHours: 1 });
    expect(generationPipeline.enqueue).toHaveBeenCalledWith(hash, buildCustomBinParams(spec), '/test/model.scad');
    let models = await request(app).get(`${a.base}/models`).set('Cookie', a.cookie);
    expect(models.body.bins[0]).toMatchObject({ topUrl: null, perspectiveUrl: null, status: 'pending' });
    file(`generated/custom/${hash}/ortho.png`); file(`generated/custom/${hash}/perspective_90.png`);
    models = await request(app).get(`${a.base}/models`).set('Cookie', a.cookie);
    expect(models.body.bins[0]).toMatchObject({ status: 'ready', topRotation: 90 });
    expect((await request(app).get(`${a.base}/bins/${a.binId}/perspective`).set('Cookie', a.cookie)).status).toBe(200);
    const before = vi.mocked(generationPipeline.enqueue).mock.calls.length;
    await request(app).get(`${a.base}/models`).set('Cookie', a.cookie);
    expect(vi.mocked(generationPipeline.enqueue).mock.calls).toHaveLength(before);
  });
  it('serves only the placed upload images and rejects database path traversal', async () => {
    const a = await fixture();
    await client.execute("INSERT INTO user_stl_uploads (id, name, original_filename, file_path, image_url, persp_image_urls, status) VALUES ('part', 'Client part', 'part.stl', 'part.stl', 'part.png', '[\"part-p0.png\",\"part-p90.png\",\"part-p180.png\",\"part-p270.png\"]', 'ready')");
    await client.execute({ sql: "UPDATE placed_items SET library_id = 'user-stl', item_id = 'part' WHERE id = ?", args: [a.binId] });
    file('uploads/global/part.png'); file('uploads/global/part-p90.png');
    expect((await request(app).get(`${a.base}/bins/${a.binId}/top`).set('Cookie', a.cookie)).status).toBe(200);
    expect((await request(app).get(`${a.base}/bins/${a.binId}/perspective`).set('Cookie', a.cookie)).status).toBe(200);
    await client.execute("UPDATE user_stl_uploads SET image_url = '../../secret.png' WHERE id = 'part'");
    file('secret.png');
    expect((await request(app).get(`${a.base}/bins/${a.binId}/top`).set('Cookie', a.cookie)).status).toBe(404);
  });
  it('resolves generated library defaults and saved overrides to different images', async () => {
    const customization = { wallPatternEnabled: false, wallPattern: 'grid' as const, lipStyle: 'normal' as const, fingerSlide: 'none' as const, wallCutout: { front: false, back: false, left: false, right: false }, height: 4 };
    const params = buildGenerateParams({ widthUnits: 2, heightUnits: 1, customization, parameters: { wall_thickness: 1.2 }, baseModelPath: '/test/parametric.scad', qty: 1, filename: 'bin.stl' });
    const hash = computeParamHash(params);
    await client.execute("INSERT INTO libraries (id, name, base_model_path, parameters) VALUES ('test-parametric', 'Parametric', '/test/parametric.scad', '{\"wall_thickness\":1.2}')");
    await client.execute({ sql: "INSERT INTO library_items (library_id, id, name, width_units, height_units, param_hash) VALUES ('test-parametric', 'tray', 'Tray', 2, 1, ?)", args: [hash] });
    file(`generated/library/${hash}/ortho.png`, 'default-top'); file(`generated/library/${hash}/perspective_90.png`);
    const a = await fixture('test-parametric:tray');
    const top = `${a.base}/bins/${a.binId}/top`;
    expect((await request(app).get(top).set('Cookie', a.cookie)).body.toString()).toBe('default-top');
    const changed = { ...customization, height: 6 };
    await client.execute({ sql: 'UPDATE placed_items SET customization = ? WHERE id = ?', args: [JSON.stringify(changed), a.binId] });
    expect((await request(app).get(top).set('Cookie', a.cookie)).status).toBe(404);
    const changedParams = buildGenerateParams({ widthUnits: 2, heightUnits: 1, customization: changed, parameters: { wall_thickness: 1.2 }, baseModelPath: '/test/parametric.scad', qty: 1, filename: 'bin.stl' });
    const changedHash = computeParamHash(changedParams);
    await owner(app).post(`/api/v1/layouts/${a.layoutId}/guest-links`).send({ expiresInHours: 1 });
    expect(generationPipeline.enqueue).toHaveBeenCalledWith(changedHash, changedParams, '/test/parametric.scad');
    file(`generated/custom/${changedHash}/ortho.png`, 'customized-top');
    expect((await request(app).get(top).set('Cookie', a.cookie)).body.toString()).toBe('customized-top');
  });
});
