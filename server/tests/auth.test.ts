import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');
  const client = createClient({ url: ':memory:' });
  return { client, authClient: client, db: drizzle(client, { schema }) };
});
vi.mock('../src/logger.js', () => ({ logger: pino({ level: 'silent' }) }));

const { client } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const { provisionAdmin, authService } = await import('../src/services/auth.service.js');
const { logger } = await import('../src/logger.js');
const password = 'test-admin-password-123!';
const origin = 'http://localhost:5173';
const app = createApp();

async function login(secret = password) {
  return request(app).post('/api/v1/auth/login').set('Origin', origin).send({ username: 'admin', password: secret });
}
function cookie(response: request.Response): string {
  return (response.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

beforeAll(async () => { await runMigrations(client); });
beforeEach(async () => {
  await client.batch(['DELETE FROM admin_sessions', 'DELETE FROM admin_reset_codes', 'DELETE FROM admin_account'], 'write');
  await provisionAdmin(password);
});

describe('single administrator authentication', () => {
  it('protects all API families and private assets while keeping health public', async () => {
    for (const path of ['layouts', 'customers', 'settings', 'libraries', 'curated-libraries', 'favorites', 'images/private.jpg', 'thumbnails/private.png', 'generation/events', 'ref-images', 'user-stls', 'bom']) {
      expect((await request(app).get(`/api/v1/${path}`)).status, path).toBe(401);
    }
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
  it('uses the real login, refuses incorrect credentials, and revokes logout', async () => {
    expect((await login('incorrect')).status).toBe(401);
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
    expect((await request(app).get('/api/v1/customers').set('Cookie', cookie(response))).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/logout').set('Origin', origin).set('Cookie', cookie(response))).status).toBe(204);
    expect((await request(app).get('/api/v1/customers').set('Cookie', cookie(response))).status).toBe(401);
  });
  it('rejects cross-origin and missing-origin mutations without trusting browser role fields', async () => {
    const session = cookie(await login());
    for (const suppliedOrigin of ['https://attacker.example', 'null']) {
      expect((await request(app).post('/api/v1/customers').set('Origin', suppliedOrigin).set('Cookie', session).send({ name: 'bad' })).status).toBe(403);
    }
    expect((await request(app).post('/api/v1/customers').set('Cookie', session).send({ name: 'bad' })).status).toBe(403);
    expect((await request(app).post('/api/v1/auth/login').send({ username: 'admin', password, role: 'admin' })).status).toBe(403);
  });
  it('expires sessions and refuses a second public or private account claim', async () => {
    const session = cookie(await login());
    await client.execute('UPDATE admin_sessions SET expires_at = 0');
    expect((await request(app).get('/api/v1/auth/session').set('Cookie', session)).status).toBe(401);
    await expect(provisionAdmin('another-password-123!')).rejects.toThrow('already provisioned');
    expect((await request(app).post('/api/v1/auth/register').set('Origin', origin).send({ password })).status).toBe(401);
  });
  it('delivers reset codes only to logs; consumes once and invalidates all existing sessions', async () => {
    const first = cookie(await login());
    const second = cookie(await login());
    const log = vi.spyOn(logger, 'warn');
    const issued = await request(app).post('/api/v1/auth/reset/request').set('Origin', origin).send({});
    expect(issued.status).toBe(202);
    const event = log.mock.calls.find(args => typeof args[0] === 'object' && args[0] !== null && 'resetCode' in args[0])?.[0] as { resetCode: string; requestId: string };
    expect(event.resetCode).toBeTruthy();
    expect(JSON.stringify(issued.body)).not.toContain(event.resetCode);
    expect((await client.execute('SELECT code_hash FROM admin_reset_codes')).rows[0].code_hash).not.toBe(event.resetCode);
    expect((await request(app).get('/api/v1/customers').set('Cookie', first)).status).toBe(200);
    const payload = { requestId: issued.body.requestId, code: event.resetCode, password: 'replacement-password-123!' };
    const outcomes = await Promise.all([1, 2].map(() => request(app).post('/api/v1/auth/reset/complete').set('Origin', origin).send(payload)));
    expect(outcomes.map(r => r.status).sort()).toEqual([204, 400]);
    for (const session of [first, second]) expect((await request(app).get('/api/v1/customers').set('Cookie', session)).status).toBe(401);
    expect((await login()).status).toBe(401);
    expect((await login(payload.password)).status).toBe(200);
    log.mockRestore();
  });
  it('preserves an earlier code on a repeated request, enforces expiry and five attempts', async () => {
    const a = await authService.issueReset();
    await authService.issueReset();
    await client.execute({ sql: 'UPDATE admin_reset_codes SET expires_at = 0 WHERE id = ?', args: [a.requestId] });
    await expect(authService.resetPassword(a.requestId, a.code, password)).rejects.toThrow('invalid or expired');
    const b = await authService.issueReset();
    for (let i = 0; i < 5; i++) await expect(authService.resetPassword(b.requestId, 'wrong', password)).rejects.toThrow('invalid or expired');
    await expect(authService.resetPassword(b.requestId, b.code, password)).rejects.toThrow('invalid or expired');
    const c = await authService.issueReset();
    await authService.issueReset();
    await expect(authService.resetPassword(c.requestId, c.code, password)).resolves.toBeUndefined();
  });
  it('terminates connected event streams when the password is reset', async () => {
    const token = await authService.login('admin', password);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/generation/events`, { headers: { Cookie: `ordinus_admin=${token}` }, signal: AbortSignal.timeout(5000) });
      expect(response.status).toBe(200);
      const ended = response.body!.getReader().read();
      const reset = await authService.issueReset();
      await authService.resetPassword(reset.requestId, reset.code, password);
      expect((await ended).done).toBe(true);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it('terminates a connected stream at its session expiry', async () => {
    const token = await authService.login('admin', password);
    await client.execute({ sql: 'UPDATE admin_sessions SET expires_at = ?', args: [Date.now() + 500] });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/generation/events`, { headers: { Cookie: `ordinus_admin=${token}` }, signal: AbortSignal.timeout(5000) });
      expect(response.status).toBe(200);
      expect((await response.body!.getReader().read()).done).toBe(true);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
