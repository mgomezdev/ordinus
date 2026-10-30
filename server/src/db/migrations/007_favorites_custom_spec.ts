import type { Client } from '@libsql/client';

export const version = 7;
export const name = 'favorites_custom_spec';

export async function up(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE favorites ADD COLUMN custom_spec TEXT`);
}

export async function down(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE favorites DROP COLUMN custom_spec`);
}
