import type { Client } from '@libsql/client';

export const version = 11;
export const name = 'admin_auth';
export async function up(client: Client): Promise<void> {
  await client.batch([
    `CREATE TABLE admin_account (id INTEGER PRIMARY KEY CHECK (id = 1), password_hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, version INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE TABLE admin_reset_codes (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, version INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)`,
  ], 'write');
}
export async function down(client: Client): Promise<void> {
  await client.batch(['DROP TABLE admin_reset_codes', 'DROP TABLE admin_sessions', 'DROP TABLE admin_account'], 'write');
}
