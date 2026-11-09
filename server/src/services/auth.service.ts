import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { authClient as client } from '../db/connection.js';
import { logger } from '../logger.js';
import { config } from '../config.js';

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, SCRYPT_OPTIONS, (err, key) => err ? reject(err) : resolve(key)));
}
export const SESSION_LIFETIME = 12 * 60 * 60 * 1000;
export const RESET_LIFETIME = 10 * 60 * 1000;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const activeStreams = new Map<string, Set<() => void>>();
export function hashToken(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 256) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Password must contain 12 to 256 characters');
}
async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [, salt, hex] = encoded.split(':');
  const expected = Buffer.from(hex, 'hex');
  const actual = await deriveKey(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function closeStreams(tokenHash?: string): void {
  for (const [hash, callbacks] of activeStreams) {
    if (tokenHash && hash !== tokenHash) continue;
    for (const close of [...callbacks]) close();
    activeStreams.delete(hash);
  }
}

/** Private provisioning only. Never called from a public HTTP endpoint. */
export async function provisionAdmin(password: string): Promise<void> {
  const existing = await client.execute('SELECT id FROM admin_account');
  if (existing.rows.length) throw new Error('Admin already provisioned');
  const encoded = await hashPassword(password);
  const result = await client.execute({ sql: 'INSERT OR IGNORE INTO admin_account (id, password_hash) VALUES (1, ?)', args: [encoded] });
  if (!result.rowsAffected) throw new Error('Admin already provisioned');
}

export const authService = {
  async login(username: string, password: string): Promise<string> {
    const result = await client.execute('SELECT password_hash, version FROM admin_account WHERE id = 1');
    const account = result.rows[0];
    // Always perform the same expensive derivation, including before private setup.
    const encoded = account ? String(account.password_hash) : `scrypt:${'0'.repeat(32)}:${'0'.repeat(128)}`;
    const verified = await verifyPassword(password, encoded);
    if (!account || !verified || username !== 'admin') throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Invalid username or password');
    const token = randomBytes(32).toString('base64url');
    const inserted = await client.execute({
      sql: 'INSERT INTO admin_sessions (token_hash, version, expires_at) SELECT ?, version, ? FROM admin_account WHERE id = 1 AND version = ?',
      args: [hashToken(token), Date.now() + SESSION_LIFETIME, account.version],
    });
    if (!inserted.rowsAffected) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Please sign in again');
    await client.execute({ sql: 'DELETE FROM admin_sessions WHERE expires_at <= ?', args: [Date.now()] });
    return token;
  },
  async session(token: string): Promise<{ tokenHash: string; expiresAt: number } | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const tokenHash = hashToken(token);
    const result = await client.execute({
      sql: 'SELECT s.expires_at FROM admin_sessions s JOIN admin_account a ON a.id = 1 AND s.version = a.version WHERE s.token_hash = ? AND s.expires_at > ?',
      args: [tokenHash, Date.now()],
    });
    return result.rows.length ? { tokenHash, expiresAt: Number(result.rows[0].expires_at) } : null;
  },
  async logout(token: string): Promise<void> {
    const hash = hashToken(token);
    await client.execute({ sql: 'DELETE FROM admin_sessions WHERE token_hash = ?', args: [hash] });
    closeStreams(hash);
  },
  trackStream(tokenHash: string, close: () => void): () => void {
    const callbacks = activeStreams.get(tokenHash) ?? new Set();
    callbacks.add(close);
    activeStreams.set(tokenHash, callbacks);
    return () => { callbacks.delete(close); if (!callbacks.size) activeStreams.delete(tokenHash); };
  },
  async issueReset(): Promise<{ requestId: string; code: string }> {
    const requestId = randomBytes(12).toString('hex');
    const code = randomBytes(24).toString('base64url');
    const expiresAt = Date.now() + RESET_LIFETIME;
    await client.execute({ sql: 'DELETE FROM admin_reset_codes WHERE expires_at <= ?', args: [Date.now()] });
    const inserted = await client.execute({
      sql: 'INSERT INTO admin_reset_codes (id, code_hash, version, expires_at) SELECT ?, ?, version, ? FROM admin_account WHERE id = 1',
      args: [requestId, hashToken(code), expiresAt],
    });
    if (inserted.rowsAffected) {
      try {
        // Explicitly requested recovery delivery channel; never echo this in HTTP.
        const emit = ['fatal', 'error'].includes(config.LOG_LEVEL) ? logger.fatal.bind(logger) : logger.warn.bind(logger);
        emit({ event: 'admin_password_reset_code', requestId, resetCode: code, expiresAt: new Date(expiresAt).toISOString() }, 'Admin password reset code (one use, expires in 10 minutes)');
      } catch (err) {
        await client.execute({ sql: 'DELETE FROM admin_reset_codes WHERE id = ?', args: [requestId] });
        throw err;
      }
    }
    return { requestId, code };
  },
  async resetPassword(requestId: string, code: string, password: string): Promise<void> {
    validatePassword(password);
    const invalid = () => new AppError(ErrorCodes.VALIDATION_ERROR, 'Code invalid or expired. Request a new code.');
    const candidate = await client.execute({
      sql: 'UPDATE admin_reset_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < 5 AND expires_at > ? AND version = (SELECT version FROM admin_account WHERE id = 1) RETURNING code_hash',
      args: [requestId, Date.now()],
    });
    if (!candidate.rows.length || !timingSafeEqual(Buffer.from(String(candidate.rows[0].code_hash), 'hex'), Buffer.from(hashToken(code), 'hex'))) throw invalid();
    const encoded = await hashPassword(password);
    // One SQL write changes the password AND invalidates all codes/sessions by
    // credential version. Concurrent redemption can succeed only once.
    const changed = await client.execute({
      sql: `UPDATE admin_account SET password_hash = ?, version = version + 1 WHERE id = 1 AND EXISTS (
        SELECT 1 FROM admin_reset_codes r WHERE r.id = ? AND r.code_hash = ? AND r.attempts <= 5 AND r.expires_at > ? AND r.version = admin_account.version
      )`,
      args: [encoded, requestId, hashToken(code), Date.now()],
    });
    if (!changed.rowsAffected) throw invalid();
    closeStreams();
    logger.info({ event: 'admin_password_reset_complete' }, 'Admin password reset; owner sessions revoked');
  },
};
