import type { Client } from '@libsql/client';

export const version = 10;
export const name = 'curated_libraries';
export async function up(client: Client): Promise<void> {
  await client.execute('CREATE TABLE IF NOT EXISTS curated_libraries (id TEXT PRIMARY KEY, definition TEXT NOT NULL)');
}
export async function down(client: Client): Promise<void> {
  await client.execute('DROP TABLE IF EXISTS curated_libraries');
}
