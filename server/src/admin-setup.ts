import { client, authClient } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { provisionAdmin } from './services/auth.service.js';

// Password comes from stdin, never command-line arguments or logs.
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > 1024) throw new Error('Password input is too long');
  }
  await runMigrations(client);
  await provisionAdmin(input.replace(/\r?\n$/, ''));
  console.log('Admin provisioned. Sign in as admin.');
} catch (err) {
  console.error(err instanceof Error ? err.message : 'Admin setup failed');
  process.exitCode = 1;
} finally { client.close(); if (authClient !== client) authClient.close(); }
