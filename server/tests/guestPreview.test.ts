import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { rmSync } from 'node:fs';

const { imageDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const imageDir = mkdtempSync(join(tmpdir(), 'ordinus-guest-images-'));
  mkdirSync(join(imageDir, 'ref-lib'));
  writeFileSync(join(imageDir, 'ref-lib', 'photo.webp'), 'test-image');
  return { imageDir };
});
vi.mock('../src/config.js', async () => {
  const actual = await vi.importActual<typeof import('../src/config.js')>('../src/config.js');
  return { config: { ...actual.config, IMAGE_DIR: imageDir } };
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

const { client } = await import('../src/db/connection.js');
const { createApp } = await import('../src/app.js');
const { authenticateTestAdmin, default: adminRequest } = await import('./adminRequest.js');
const app = createApp();
beforeAll(async () => { await authenticateTestAdmin(app); });
afterAll(() => rmSync(imageDir, { recursive: true, force: true }));

async function layout(name = 'Kitchen drawer'): Promise<number> {
  const response = await adminRequest(app).post('/api/v1/layouts').send({ name, description: 'Private operator notes', gridX: 4, gridY: 3, widthMm: 168, depthMm: 126, placedItems: [{ itemId: 'bins_standard:bin-1x1', x: 0, y: 0, width: 2, height: 2, rotation: 0 }] });
  expect(response.status).toBe(201);
  return response.body.data.id as number;
}
async function invite(layoutId: number) {
  const response = await adminRequest(app).post(`/api/v1/layouts/${layoutId}/guest-links`).send({ expiresInHours: 24 });
  expect(response.status).toBe(201);
  return response.body as { id: string; secret: string; expiresAt: string; revokedAt: null };
}
async function join(link: { id: string; secret: string }): Promise<string> {
  const response = await request(app).post(`/api/v1/guest/${link.id}/join`).set('X-Ordinus-Request', '1').send({ secret: link.secret });
  expect(response.status).toBe(204);
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(response.headers['set-cookie'][0]).toContain(`Path=/api/v1/guest/${link.id}`);
  return (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

describe('scoped read-only guest previews', () => {
  it('requires an owner to create links and stores only the invitation hash', async () => {
    const id = await layout();
    expect((await request(app).post(`/api/v1/layouts/${id}/guest-links`).set('X-Ordinus-Request', '1').send({ expiresInHours: 24 })).status).toBe(401);
    const link = await invite(id);
    const stored = (await client.execute({ sql: 'SELECT token_hash FROM guest_links WHERE id = ?', args: [link.id] })).rows[0];
    expect(stored.token_hash).not.toBe(link.secret);
    const list = await adminRequest(app).get(`/api/v1/layouts/${id}/guest-links`);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toMatch(/secret|token_hash/);
    expect((await request(app).get(`/api/v1/guest/${link.id}/view`)).status).toBe(410);
    expect((await request(app).post(`/api/v1/guest/${link.id}/join`).set('X-Ordinus-Request', '1').send({ secret: 'wrong' })).status).toBe(410);
  });
  it('exposes only the chosen layout projection and cannot grant admin or mutation access', async () => {
    const id = await layout('Selected drawer');
    const other = await layout('Unshared private drawer');
    const a = await invite(id);
    const b = await invite(other);
    const cookie = await join(a);
    const view = await request(app).get(`/api/v1/guest/${a.id}/view?layoutId=${other}`).set('Cookie', cookie);
    expect(view.status).toBe(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.body.layout.name).toBe('Selected drawer');
    expect(view.body.layout.bins).toHaveLength(1);
    expect(JSON.stringify(view.body)).not.toMatch(/Private operator notes|Unshared private drawer|customerId|customerName|userId|filePath|libraryId|customSpec/);
    expect((await request(app).get(`/api/v1/guest/${b.id}/view`).set('Cookie', cookie)).status).toBe(410);
    for (const path of ['customers', 'settings', 'layouts', 'libraries', 'generation/events']) {
      expect((await request(app).get(`/api/v1/${path}`).set('Cookie', cookie)).status).toBe(401);
    }
    expect((await request(app).put(`/api/v1/layouts/${id}`).set('Cookie', cookie).set('X-Ordinus-Request', '1').send({ name: 'Overwritten' })).status).toBe(401);
    expect((await request(app).post(`/api/v1/guest/${a.id}/view`).set('Cookie', cookie).set('X-Ordinus-Request', '1').send({ name: 'Overwritten' })).status).toBe(405);
    expect((await adminRequest(app).get(`/api/v1/layouts/${id}`)).body.data.name).toBe('Selected drawer');
  });
  it('scopes reference images by placement, hides paths, and revokes open guest credentials and new joins', async () => {
    const a = await layout();
    const b = await layout('Another drawer');
    const image = await client.execute("INSERT INTO ref_images (name, file_path, file_size) VALUES ('Photo', 'ref-lib/photo.webp', 10) RETURNING id");
    const imageId = image.rows[0].id;
    const placements = await client.batch([a, b].map(id => ({ sql: "INSERT INTO reference_images (layout_id, ref_image_id, name, file_path) VALUES (?, ?, 'Drawer photo', '') RETURNING id", args: [id, imageId] })), 'write');
    const allowed = Number(placements[0].rows[0].id);
    const denied = Number(placements[1].rows[0].id);
    const link = await invite(a);
    const cookie = await join(link);
    const asset = `/api/v1/guest/${link.id}/assets/${allowed}`;
    const view = await request(app).get(`/api/v1/guest/${link.id}/view`).set('Cookie', cookie);
    expect(view.body.layout.referenceImages[0].url).toBe(asset);
    expect(JSON.stringify(view.body)).not.toContain('ref-lib/photo.webp');
    expect((await request(app).get(asset).set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get(`/api/v1/guest/${link.id}/assets/${denied}`).set('Cookie', cookie)).status).toBe(404);
    expect((await request(app).get('/api/v1/images/ref-lib/photo.webp').set('Cookie', cookie)).status).toBe(401);
    expect((await adminRequest(app).delete(`/api/v1/layouts/${b}/guest-links/${link.id}`)).status).toBe(404);
    expect((await adminRequest(app).delete(`/api/v1/layouts/${a}/guest-links/${link.id}`)).status).toBe(204);
    for (const path of ['view', 'status', `assets/${allowed}`]) expect((await request(app).get(`/api/v1/guest/${link.id}/${path}`).set('Cookie', cookie)).status).toBe(410);
    expect((await request(app).post(`/api/v1/guest/${link.id}/join`).set('X-Ordinus-Request', '1').send({ secret: link.secret })).status).toBe(410);
  });
  it('expires links, keeps separate invitations independent, and permits leaving without closing a link', async () => {
    const id = await layout();
    const first = await invite(id);
    const second = await invite(id);
    const one = await join(first);
    const two = await join(second);
    expect((await request(app).post(`/api/v1/guest/${first.id}/leave`).set('Cookie', one).set('X-Ordinus-Request', '1')).status).toBe(204);
    expect((await request(app).get(`/api/v1/guest/${first.id}/view`).set('Cookie', one)).status).toBe(410);
    await join(first);
    await client.execute({ sql: 'UPDATE guest_links SET expires_at = 0 WHERE id = ?', args: [first.id] });
    expect((await request(app).post(`/api/v1/guest/${first.id}/join`).set('X-Ordinus-Request', '1').send({ secret: first.secret })).status).toBe(410);
    expect((await request(app).get(`/api/v1/guest/${second.id}/view`).set('Cookie', two)).status).toBe(200);
    await adminRequest(app).delete(`/api/v1/layouts/${id}`);
    expect((await request(app).get(`/api/v1/guest/${second.id}/view`).set('Cookie', two)).status).toBe(410);
  });
  it('validates expiry choices and rejects cross-origin invitation redemption', async () => {
    const id = await layout();
    expect((await adminRequest(app).post(`/api/v1/layouts/${id}/guest-links`).send({ expiresInHours: 9999 })).status).toBe(400);
    const link = await invite(id);
    expect((await request(app).post(`/api/v1/guest/${link.id}/join`).set('Origin', 'https://attacker.example').send({ secret: link.secret })).status).toBe(403);
    expect((await request(app).post(`/api/v1/guest/${link.id}/join`).set('X-Ordinus-Request', '1').send({ secret: link.secret, layoutId: id + 1 })).status).toBe(400);
  });
});
