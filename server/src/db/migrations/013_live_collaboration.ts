import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
export const version = 13;
export const name = 'live_collaboration';
export async function up(client: Client): Promise<void> {
  await client.batch([
    'ALTER TABLE layouts ADD COLUMN revision INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE layouts ADD COLUMN live_guarded INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE placed_items ADD COLUMN stable_id TEXT',
    'ALTER TABLE placed_items ADD COLUMN source_snapshot TEXT',
    'ALTER TABLE guest_links ADD COLUMN allow_edit INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE guest_links ADD COLUMN catalog TEXT',
    "ALTER TABLE guest_sessions ADD COLUMN display_name TEXT NOT NULL DEFAULT 'Client'",
    `CREATE TABLE live_commands (command_id TEXT NOT NULL, layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
      actor TEXT NOT NULL, payload_hash TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(layout_id, command_id))`,
    `CREATE TABLE live_backups (layout_id INTEGER PRIMARY KEY REFERENCES layouts(id) ON DELETE CASCADE,
      snapshot TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  ], 'write');
  const rows = await client.execute('SELECT id FROM placed_items');
  for (const row of rows.rows) await client.execute({ sql: 'UPDATE placed_items SET stable_id = ? WHERE id = ?', args: [randomUUID(), row.id] });
  await client.execute('CREATE UNIQUE INDEX idx_placed_stable ON placed_items(stable_id)');
}
export async function down(client: Client): Promise<void> {
  await client.batch(['DROP TABLE live_commands', 'DROP TABLE live_backups', 'DROP INDEX idx_placed_stable',
    'ALTER TABLE placed_items DROP COLUMN stable_id', 'ALTER TABLE placed_items DROP COLUMN source_snapshot', 'ALTER TABLE layouts DROP COLUMN revision', 'ALTER TABLE layouts DROP COLUMN live_guarded',
    'ALTER TABLE guest_links DROP COLUMN allow_edit', 'ALTER TABLE guest_links DROP COLUMN catalog', 'ALTER TABLE guest_sessions DROP COLUMN display_name'], 'write');
}
