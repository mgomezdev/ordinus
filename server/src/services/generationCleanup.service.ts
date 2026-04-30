import fs from 'fs/promises';
import path from 'path';
import { logger } from '../logger.js';
import { config } from '../config.js';

const CLEANUP_TTL_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function runCustomCleanup(generatedDir: string, ttlDays: number): Promise<void> {
  const customDir = path.join(generatedDir, 'custom');
  let entries: string[];
  try {
    entries = await fs.readdir(customDir);
  } catch {
    return; // dir doesn't exist yet
  }

  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;

  for (const hash of entries) {
    const dir = path.join(customDir, hash);
    try {
      let accessedAt: number;
      try {
        const stat = await fs.stat(path.join(dir, '.accessed'));
        accessedAt = stat.mtimeMs;
      } catch {
        const stat = await fs.stat(dir);
        accessedAt = stat.mtimeMs;
      }

      if (accessedAt < cutoff) {
        await fs.rm(dir, { recursive: true, force: true });
        logger.info({ hash }, 'Cleaned up stale custom generation');
      }
    } catch (err) {
      logger.warn({ hash, err }, 'Failed to check or clean custom generation dir');
    }
  }
}

export function startCleanup(): void {
  setInterval(() => {
    runCustomCleanup(config.GENERATED_STL_DIR, CLEANUP_TTL_DAYS).catch((err) => {
      logger.error({ err }, 'Generation cleanup failed');
    });
  }, CLEANUP_INTERVAL_MS);
}
