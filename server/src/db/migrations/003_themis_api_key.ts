import type { Client } from '@libsql/client';

export const version = 3;
export const name = 'themis_api_key';

export async function up(client: Client): Promise<void> {
  await client.execute({ sql: "INSERT OR IGNORE INTO settings (key, value) VALUES ('themis_api_key', '')", args: [] });
}

export async function down(client: Client): Promise<void> {
  await client.execute({ sql: "DELETE FROM settings WHERE key = 'themis_api_key'", args: [] });
}
