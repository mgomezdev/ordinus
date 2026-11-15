import type { Client } from '@libsql/client';

export const version = 12;
export const name = 'guest_previews';
export async function up(client: Client): Promise<void> {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS guest_links (
      id TEXT PRIMARY KEY, layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS idx_guest_links_layout ON guest_links(layout_id)',
    `CREATE TABLE IF NOT EXISTS guest_sessions (
      token_hash TEXT PRIMARY KEY, link_id TEXT NOT NULL REFERENCES guest_links(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_guest_sessions_link ON guest_sessions(link_id)',
  ], 'write');
}
export async function down(client: Client): Promise<void> {
  await client.batch(['DROP TABLE guest_sessions', 'DROP TABLE guest_links'], 'write');
}
