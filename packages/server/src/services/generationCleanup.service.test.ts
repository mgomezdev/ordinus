import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runCustomCleanup } from './generationCleanup.service.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-test-'));
  await fs.mkdir(path.join(tmpDir, 'custom'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function makeCustomDir(hash: string, accessedDaysAgo: number): Promise<void> {
  const dir = path.join(tmpDir, 'custom', hash);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'ortho.png'), 'x');
  const accessedFile = path.join(dir, '.accessed');
  await fs.writeFile(accessedFile, '');
  const past = new Date(Date.now() - accessedDaysAgo * 24 * 60 * 60 * 1000);
  await fs.utimes(accessedFile, past, past);
}

describe('runCustomCleanup', () => {
  it('deletes custom dirs whose .accessed is older than TTL days', async () => {
    await makeCustomDir('stale-hash', 31);
    await runCustomCleanup(tmpDir, 30);
    await expect(fs.access(path.join(tmpDir, 'custom', 'stale-hash'))).rejects.toThrow();
  });

  it('keeps custom dirs whose .accessed is within TTL', async () => {
    await makeCustomDir('fresh-hash', 5);
    await runCustomCleanup(tmpDir, 30);
    await expect(fs.access(path.join(tmpDir, 'custom', 'fresh-hash'))).resolves.toBeUndefined();
  });

  it('uses dir mtime as fallback when .accessed is missing', async () => {
    const dir = path.join(tmpDir, 'custom', 'no-accessed');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'ortho.png'), 'x');
    // Set dir mtime to 35 days ago
    const past = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    await fs.utimes(dir, past, past);
    await runCustomCleanup(tmpDir, 30);
    await expect(fs.access(dir)).rejects.toThrow();
  });

  it('does not touch the library/ subdir', async () => {
    const libDir = path.join(tmpDir, 'library', 'lib-hash');
    await fs.mkdir(libDir, { recursive: true });
    await fs.writeFile(path.join(libDir, 'ortho.png'), 'x');
    await runCustomCleanup(tmpDir, 30);
    await expect(fs.access(libDir)).resolves.toBeUndefined();
  });
});
