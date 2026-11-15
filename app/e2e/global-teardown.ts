import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export default async function globalTeardown(): Promise<void> {
  // Exact generated credential files only. Never remove the running test DB/assets.
  for (const name of ['admin.json', 'admin-password']) {
    await rm(fileURLToPath(new URL(`./.auth/${name}`, import.meta.url)), { force: true });
  }
}
