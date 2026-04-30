import { randomBytes } from 'node:crypto';
import type { Client } from '@libsql/client';
import type { Logger } from 'pino';

/**
 * Seeds default user accounts (admin + test).
 * Does NOT delete existing users — caller decides whether to wipe first.
 *
 * Admin password is read from ADMIN_INITIAL_PASSWORD env var.
 * If not set and NODE_ENV=production, a random password is generated and logged once.
 * If not set in dev/test, falls back to 'admin' for convenience.
 */
export async function seedDefaultUsers(client: Client, logger: Logger): Promise<void> {
  const argon2 = await import('argon2');

  const isProduction = process.env.NODE_ENV === 'production';
  let adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? '';

  if (!adminPassword) {
    if (isProduction) {
      adminPassword = randomBytes(16).toString('hex');
      logger.warn(
        { adminPassword },
        'ADMIN_INITIAL_PASSWORD not set — generated random admin password. Save this now, it will not be shown again.',
      );
    } else {
      adminPassword = 'admin';
    }
  }

  const adminPasswordHash = await argon2.default.hash(adminPassword, { type: argon2.default.argon2id });
  const testPasswordHash = await argon2.default.hash('test123', { type: argon2.default.argon2id });

  await client.execute({
    sql: `INSERT INTO users (email, username, password_hash, role, failed_login_attempts, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
    args: ['admin@gridfinity.local', 'admin', adminPasswordHash, 'admin'],
  });

  await client.execute({
    sql: `INSERT INTO users (email, username, password_hash, role, failed_login_attempts, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
    args: ['test@gridfinity.local', 'test', testPasswordHash, 'user'],
  });

  logger.info('Created default accounts: admin@gridfinity.local, test@gridfinity.local');
}
