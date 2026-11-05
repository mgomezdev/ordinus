import type { Client } from '@libsql/client';

export const version = 9;
export const name = 'drop_shared_projects';

// The share-link API was removed; nothing reads or writes this table.
export async function up(client: Client): Promise<void> {
  await client.execute(`DROP INDEX IF EXISTS idx_shared_projects_slug`);
  await client.execute(`DROP TABLE IF EXISTS shared_projects`);
}

export async function down(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS shared_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
      slug TEXT NOT NULL UNIQUE,
      created_by INTEGER,
      expires_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_shared_projects_slug ON shared_projects(slug)`);
}
