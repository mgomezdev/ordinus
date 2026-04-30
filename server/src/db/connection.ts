import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { config } from '../config.js';

const dbUrl = config.DB_PATH === ':memory:' ? ':memory:' : `file:${config.DB_PATH}`;
const client = createClient({
  url: dbUrl,
});

export const db = drizzle(client, { schema });
export { client };
