import { beforeAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client'); const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js'); const client = createClient({ url: ':memory:' });
  return { client, authClient: client, db: drizzle(client, { schema }) };
});
vi.mock('../src/logger.js', () => ({ logger: pino({ level: 'silent' }) }));
vi.mock('../src/services/layoutThumbnail.service.js', () => ({ generate: vi.fn(), deleteThumbnail: vi.fn() }));
const { client } = await import('../src/db/connection.js');
const { createApp } = await import('../src/app.js');
const { authenticateTestAdmin, default: owner } = await import('./adminRequest.js');
const app = createApp();
beforeAll(async () => {
  await authenticateTestAdmin(app);
  await client.execute("INSERT INTO libraries (id, name) VALUES ('live-test', 'Approved bins')");
  await client.execute("INSERT INTO library_items (library_id, id, name, width_units, height_units) VALUES ('live-test', 'small', 'Small bin', 1, 1)");
});
async function fixture(edit = true) {
  const data = { name: 'Live drawer', description: 'Private notes', gridX: 4, gridY: 4, gridResolution: 2, widthMm: 168, depthMm: 168,
    placedItems: [{ itemId: 'live-test:small', x: 0, y: 0, width: 2, height: 2, rotation: 0 }] };
  const created = await owner(app).post('/api/v1/layouts').send(data);
  expect(created.status).toBe(201); const layoutId = Number(created.body.data.id);
  const issued = await owner(app).post(`/api/v1/layouts/${layoutId}/guest-links`).send({ expiresInHours: 24, ...(edit ? { allowEdit: true, libraryId: 'live-test' } : {}) });
  expect(issued.status).toBe(201);
  const joined = await request(app).post(`/api/v1/guest/${issued.body.id}/join`).set('X-Ordinus-Request', '1').send({ secret: issued.body.secret, displayName: 'Alex' });
  expect(joined.status).toBe(204);
  const cookie = String(joined.headers['set-cookie'][0]).split(';')[0];
  const base = `/api/v1/guest/${issued.body.id}`; const host = `/api/v1/layouts/${layoutId}/live`;
  const snapshot = () => request(app).get(`${base}/live/snapshot`).set('Cookie', cookie);
  const command = (body: unknown) => request(app).post(`${base}/live/commands`).set('Cookie', cookie).set('X-Ordinus-Request', '1').send(body);
  return { data, layoutId, linkId: issued.body.id as string, cookie, base, host, snapshot, command };
}
describe('live collaboration', () => {
  it('shares a scoped editable snapshot and preserves bin identity across accepted owner and guest changes', async () => {
    const f = await fixture(); const initial = await f.snapshot(); expect(initial.status).toBe(200);
    expect(JSON.stringify(initial.body)).not.toMatch(/Private notes|customerId|base_model_path|file_path/);
    expect(initial.body.catalog).toHaveLength(1);
    const bin = initial.body.bins[0]; const revision = initial.body.revision as number;
    expect((await f.command({ commandId: randomUUID(), baseRevision: revision, change: { type: 'move', stableId: bin.stableId, x: 2, y: 0 } })).status).toBe(200);
    const second = (await owner(app).get(`${f.host}/snapshot`)).body;
    expect(second.bins[0].stableId).toBe(bin.stableId); expect(second.layout.bins[0].x).toBe(2);
    expect((await owner(app).post(`${f.host}/commands`).send({ commandId: randomUUID(), baseRevision: second.revision, change: { type: 'rotate', stableId: bin.stableId, direction: 'cw' } })).status).toBe(200);
    expect((await f.snapshot()).body.layout.bins[0].rotation).toBe(90);
  });
  it('rejects simultaneous stale edits and persists command deduplication', async () => {
    const f = await fixture(); const s = (await f.snapshot()).body;
    const a = { commandId: randomUUID(), baseRevision: s.revision, change: { type: 'move', stableId: s.bins[0].stableId, x: 2, y: 2 } };
    const b = { ...a, commandId: randomUUID(), change: { ...a.change, x: 4 } };
    const results = await Promise.all([f.command(a), f.command(b)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = results[0].status === 200 ? a : b;
    const retry = await f.command(winner); expect(retry.status).toBe(200); expect(retry.body.duplicate).toBe(true);
    expect((await f.snapshot()).body.revision).toBe(s.revision + 1);
    expect((await f.command({ ...winner, change: { ...winner.change, y: 4 } })).status).toBe(409);
    expect((await client.execute({ sql: 'SELECT * FROM live_commands WHERE layout_id = ?', args: [f.layoutId] })).rows).toHaveLength(1);
  });
  it('limits additions to the frozen approved catalog and validates overlap, bounds, and drawer shrink', async () => {
    const f = await fixture(); let s = (await f.snapshot()).body;
    const send = (change: unknown) => f.command({ commandId: randomUUID(), baseRevision: s.revision, change });
    expect((await send({ type: 'add', catalogKey: randomUUID(), x: 2, y: 0 })).status).toBe(403);
    expect((await send({ type: 'add', catalogKey: s.catalog[0].key, x: 0, y: 0 })).status).toBe(400);
    expect((await send({ type: 'move', stableId: s.bins[0].stableId, x: 7, y: 0 })).status).toBe(400);
    expect((await send({ type: 'add', catalogKey: s.catalog[0].key, x: 6, y: 0 })).status).toBe(200);
    s = (await f.snapshot()).body;
    expect((await send({ type: 'drawer', widthMm: 84, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none' })).status).toBe(400);
    expect((await send({ type: 'rename', name: 'Hacked' })).status).toBe(400);
    expect((await send({ type: 'customize', stableId: s.bins[0].stableId, height: 4, lipStyle: 'none', wallPatternEnabled: false })).status).toBe(400);
    expect((await request(app).put(`/api/v1/layouts/${f.layoutId}`).set('Cookie', f.cookie).set('X-Ordinus-Request', '1').send(f.data)).status).toBe(401);
  });
  it('protects every full save after collaboration starts, including after access closes', async () => {
    const f = await fixture(); const s = (await f.snapshot()).body;
    expect((await owner(app).put(`/api/v1/layouts/${f.layoutId}`).send(f.data)).status).toBe(409);
    expect((await owner(app).put(`/api/v1/layouts/${f.layoutId}`).send({ ...f.data, baseRevision: 0 })).status).toBe(409);
    expect((await owner(app).put(`/api/v1/layouts/${f.layoutId}`).send({ ...f.data, baseRevision: s.revision })).status).toBe(200);
    await owner(app).delete(`/api/v1/layouts/${f.layoutId}/guest-links/${f.linkId}`);
    expect((await f.snapshot()).status).toBe(410);
    expect((await owner(app).put(`/api/v1/layouts/${f.layoutId}`).send(f.data)).status).toBe(409);
    expect((await client.execute({ sql: 'SELECT snapshot FROM live_backups WHERE layout_id = ?', args: [f.layoutId] })).rows).toHaveLength(1);
  });
  it('never commits a command after revocation, and never upgrades a read-only invitation', async () => {
    const f = await fixture(); const s = (await f.snapshot()).body;
    await owner(app).delete(`/api/v1/layouts/${f.layoutId}/guest-links/${f.linkId}`);
    expect((await f.command({ commandId: randomUUID(), baseRevision: s.revision, change: { type: 'remove', stableId: s.bins[0].stableId } })).status).toBe(410);
    const readOnly = await fixture(false);
    expect((await readOnly.snapshot()).status).toBe(403);
    expect((await readOnly.command({ commandId: randomUUID(), baseRevision: 0, change: { type: 'remove', stableId: s.bins[0].stableId } })).status).toBe(403);
  });
  it('delivers committed changes over SSE and closes a guest stream on revocation', async () => {
    const f = await fixture(); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}${f.base}/live/events`, { headers: { Cookie: f.cookie }, signal: controller.signal });
      expect(response.status).toBe(200); const reader = response.body!.getReader(); const decoder = new TextDecoder();
      let text = ''; while (!text.includes('event: ready')) text += decoder.decode((await reader.read()).value);
      const s = (await f.snapshot()).body; expect(s.participants).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Alex', role: 'guest' })]));
      await f.command({ commandId: randomUUID(), baseRevision: s.revision, change: { type: 'move', stableId: s.bins[0].stableId, x: 2, y: 0 } });
      let changed = ''; while (!changed.includes('event: changed')) changed += decoder.decode((await reader.read()).value);
      await owner(app).delete(`/api/v1/layouts/${f.layoutId}/guest-links/${f.linkId}`);
      let closed = ''; for (;;) { const chunk = await reader.read(); if (chunk.done) break; closed += decoder.decode(chunk.value); }
      expect(closed).toContain('event: closed');
    } finally { clearTimeout(timeout); controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('serializes a closure race and never accepts a following write', async () => {
    const f = await fixture(); const s = (await f.snapshot()).body;
    const change = { commandId: randomUUID(), baseRevision: s.revision, change: { type: 'move', stableId: s.bins[0].stableId, x: 2, y: 0 } };
    const results = await Promise.all([f.command(change), owner(app).delete(`/api/v1/layouts/${f.layoutId}/guest-links/${f.linkId}`)]);
    expect([200, 410]).toContain(results[0].status); expect(results[1].status).toBe(204);
    const revision = Number((await client.execute({ sql: 'SELECT revision FROM layouts WHERE id=?', args: [f.layoutId] })).rows[0].revision);
    expect((await f.command({ ...change, commandId: randomUUID(), baseRevision: revision })).status).toBe(410);
    expect(Number((await client.execute({ sql: 'SELECT revision FROM layouts WHERE id=?', args: [f.layoutId] })).rows[0].revision)).toBe(revision);
  });
  it('expires guest streams and terminates owner streams on sign out', async () => {
    const f = await fixture(); const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      await client.execute({ sql: 'UPDATE guest_sessions SET expires_at=? WHERE link_id=?', args: [Date.now() + 500, f.linkId] });
      const guest = await fetch(`http://127.0.0.1:${port}${f.base}/live/events`, { headers: { Cookie: f.cookie }, signal: controller.signal });
      expect(guest.status).toBe(200); const reader = guest.body!.getReader(); let text = '';
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; text += new TextDecoder().decode(chunk.value); }
      expect(text).toContain('event: closed');
      const login = await request(app).post('/api/v1/auth/login').set('X-Ordinus-Request', '1').send({ username: 'admin', password: 'isolated-unit-test-admin-123!' });
      const cookie = String(login.headers['set-cookie'][0]).split(';')[0];
      const ownerStream = await fetch(`http://127.0.0.1:${port}${f.host}/events`, { headers: { Cookie: cookie }, signal: controller.signal });
      const ownerReader = ownerStream.body!.getReader();
      await request(app).post('/api/v1/auth/logout').set('X-Ordinus-Request', '1').set('Cookie', cookie);
      for (;;) { if ((await ownerReader.read()).done) break; }
    } finally { clearTimeout(timeout); controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
