import type { Client } from '@libsql/client';

export const version = 2;
export const name = 'settings_table';

export async function up(client: Client): Promise<void> {
  await client.execute(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`);
  await client.execute({ sql: "INSERT OR IGNORE INTO settings (key, value) VALUES ('themis_url', '')", args: [] });
  await client.execute({ sql: "INSERT OR IGNORE INTO settings (key, value) VALUES ('laminus_url', '')", args: [] });
}

export async function down(client: Client): Promise<void> {
  await client.execute(`DROP TABLE IF EXISTS settings`);
}
