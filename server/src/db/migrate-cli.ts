import { createClient } from '@libsql/client';
import { config } from '../config.js';
import { runMigrations, rollbackLast } from './migrate.js';

const client = createClient({ url: `file:${config.DB_PATH}` });
const cmd = process.argv[2];

async function main() {
  if (cmd === 'up') {
    await runMigrations(client);
    console.log('Migrations applied.');
  } else if (cmd === 'down') {
    await rollbackLast(client);
  } else {
    console.error('Usage: db:migrate | db:rollback');
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
