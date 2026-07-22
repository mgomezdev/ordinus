import type { Client } from '@libsql/client';
import * as m001 from './migrations/001_baseline.js';
import * as m002 from './migrations/002_settings.js';

interface Migration {
  version: number;
  name: string;
  up: (client: Client) => Promise<void>;
  down: (client: Client) => Promise<void>;
}

const MIGRATIONS: Migration[] = [m001, m002].sort((a, b) => a.version - b.version);

async function ensureTable(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function appliedVersions(client: Client): Promise<Set<number>> {
  const r = await client.execute(`SELECT version FROM schema_migrations ORDER BY version`);
  return new Set(r.rows.map((row) => row['version'] as number));
}

export async function runMigrations(client: Client): Promise<void> {
  await ensureTable(client);
  const applied = await appliedVersions(client);
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    console.log(`Applying migration v${m.version}: ${m.name}`);
    await m.up(client);
    await client.execute({
      sql: `INSERT INTO schema_migrations (version, name) VALUES (?, ?)`,
      args: [m.version, m.name],
    });
  }
}

export async function rollbackLast(client: Client): Promise<void> {
  await ensureTable(client);
  const r = await client.execute(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`);
  if (!r.rows.length) {
    console.log('Nothing to roll back.');
    return;
  }
  const version = r.rows[0]['version'] as number;
  const m = MIGRATIONS.find((x) => x.version === version);
  if (!m) throw new Error(`Migration v${version} not found in MIGRATIONS array`);
  console.log(`Rolling back v${version}: ${m.name}`);
  await m.down(client);
  await client.execute({ sql: `DELETE FROM schema_migrations WHERE version = ?`, args: [version] });
}
