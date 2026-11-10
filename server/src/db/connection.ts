import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { config } from '../config.js';

const dbUrl = config.DB_PATH === ':memory:' ? ':memory:' : `file:${config.DB_PATH}`;
const client = createClient({
  url: dbUrl,
});

export const db = drizzle(client, { schema });
// A separate connection prevents an in-flight layout BEGIN/ROLLBACK from
// accidentally rolling back a successfully acknowledged login/reset.
export const authClient = config.DB_PATH === ':memory:' ? client : createClient({ url: dbUrl });
// Live transactions must not absorb an unrelated library/upload write on the
// ordinary API connection while awaiting authorization or validation.
export const liveClient = config.DB_PATH === ':memory:' ? client : createClient({ url: dbUrl });
if (config.DB_PATH !== ':memory:') await client.execute('PRAGMA journal_mode = WAL');
for (const connection of new Set([client, authClient, liveClient])) {
  await connection.execute('PRAGMA foreign_keys = ON');
  await connection.execute('PRAGMA busy_timeout = 5000');
}
export { client };
