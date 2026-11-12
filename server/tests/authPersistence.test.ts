import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import pino from 'pino';

const { directory, dbPath } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { tmpdir } = require('node:os') as typeof import('node:os');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { join } = require('node:path') as typeof import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'ordinus-auth-persistence-'));
  return { directory, dbPath: join(directory, 'test.db') };
});
vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  return { client: createClient({ url: `file:${dbPath}` }), authClient: createClient({ url: `file:${dbPath}` }) };
});
vi.mock('../src/logger.js', () => ({ logger: pino({ level: 'silent' }) }));
const { client, authClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { authService, provisionAdmin } = await import('../src/services/auth.service.js');
beforeAll(async () => { await runMigrations(client); await provisionAdmin('original-admin-password-123!'); });
afterAll(async () => {
  client.close(); authClient.close();
  // The native Windows driver retains file handles until this worker exits.
  // Leave that OS-temporary fixture to normal temp cleanup on Windows.
  if (process.platform !== 'win32') await rm(directory, { recursive: true, force: true });
});

it('an acknowledged reset cannot be undone by a different connection rolling back its layout transaction', async () => {
  const reset = await authService.issueReset();
  const oldSession = await authService.login('admin', 'original-admin-password-123!');
  await client.execute('BEGIN');
  try { await authService.resetPassword(reset.requestId, reset.code, 'replacement-admin-password-123!'); }
  finally { await client.execute('ROLLBACK'); }
  expect(await authService.session(oldSession)).toBeNull();
  await expect(authService.login('admin', 'replacement-admin-password-123!')).resolves.toBeTruthy();
  await expect(authService.resetPassword(reset.requestId, reset.code, 'another-admin-password-123!')).rejects.toThrow('invalid or expired');
});
