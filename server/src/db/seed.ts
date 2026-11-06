import { createClient } from '@libsql/client';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import pino from 'pino';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';
import { reseedLibraryData } from './reseedLibraries.js';

async function seed(): Promise<void> {
  const logger = pino({ level: 'info' });

  mkdirSync(dirname(config.DB_PATH), { recursive: true });
  const client = createClient({ url: `file:${config.DB_PATH}` });

  // Run migrations
  await runMigrations(client);
  logger.info('Migrations complete');

  // Reseed library data from JSON files
  await reseedLibraryData(client, logger);

  logger.info('Seed complete!');
  client.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
