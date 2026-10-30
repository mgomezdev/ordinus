import type { Client } from '@libsql/client';

export const version = 5;
export const name = 'placed_items_custom_spec';

export async function up(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE placed_items ADD COLUMN custom_spec TEXT`);
}

export async function down(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE placed_items DROP COLUMN custom_spec`);
}
