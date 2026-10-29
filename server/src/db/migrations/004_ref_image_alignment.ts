import type { Client } from '@libsql/client';

export const version = 4;
export const name = 'ref_image_alignment';

export async function up(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE reference_images ADD COLUMN corners TEXT`);
  await client.execute(`ALTER TABLE reference_images ADD COLUMN warped_file_path TEXT`);
}

export async function down(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE reference_images DROP COLUMN warped_file_path`);
  await client.execute(`ALTER TABLE reference_images DROP COLUMN corners`);
}
