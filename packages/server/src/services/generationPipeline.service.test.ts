import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { GenerationPipelineService } from './generationPipeline.service.js';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
const mockSpawn = vi.mocked(spawn);

function makeSpawnSuccess() {
  const child = {
    on: (ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') setTimeout(() => fn(0), 0);
    },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  };
  mockSpawn.mockReturnValueOnce(child as never);
  return child;
}

function makeSpawnFail(stderr = 'openscad error') {
  const child = {
    on: (ev: string, fn: (...args: unknown[]) => void) => {
      if (ev === 'close') setTimeout(() => fn(1), 0);
    },
    stdout: { on: vi.fn() },
    stderr: {
      on: (ev: string, fn: (buf: Buffer) => void) => {
        if (ev === 'data') fn(Buffer.from(stderr));
      },
    },
  };
  mockSpawn.mockReturnValueOnce(child as never);
  return child;
}

let tmpDir: string;
let svc: GenerationPipelineService;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gen-test-'));
  await fs.mkdir(path.join(tmpDir, 'library'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'custom'), { recursive: true });
  svc = new GenerationPipelineService(tmpDir, '/fake/generator', '/fake/libbuilder');
  vi.clearAllMocks();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('getStatus', () => {
  it('returns not-found when no dir exists', async () => {
    expect(await svc.getStatus('abc123')).toBe('not-found');
  });

  it('returns complete when library/hash/ortho.png exists', async () => {
    const dir = path.join(tmpDir, 'library', 'abc123');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'ortho.png'), 'x');
    expect(await svc.getStatus('abc123')).toBe('complete');
  });

  it('returns failed when error.txt exists', async () => {
    const dir = path.join(tmpDir, 'custom', 'abc123');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'error.txt'), 'boom');
    expect(await svc.getStatus('abc123')).toBe('failed');
  });

  it('returns pending when dir exists but ortho.png absent', async () => {
    const dir = path.join(tmpDir, 'custom', 'abc123');
    await fs.mkdir(dir, { recursive: true });
    expect(await svc.getStatus('abc123')).toBe('pending');
  });
});

describe('enqueue', () => {
  it('returns pending and emits generation:complete on success', async () => {
    // spawn is called 6 times (1 STL + 5 images); all succeed
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();

    const events: string[] = [];
    svc.on('generation:complete', ({ hash }: { hash: string }) => events.push(hash));

    const status = await svc.enqueue('hash1', { width: [2, 0] }, '/fake/base.scad');
    expect(status).toBe('pending');

    // Wait for async job to complete
    await new Promise(r => setTimeout(r, 500));
    expect(events).toContain('hash1');
  });

  it('emits generation:failed and writes error.txt on spawn failure', async () => {
    makeSpawnFail('openscad crashed');
    // Only first spawn fails; remaining calls don't matter
    mockSpawn.mockReturnValue({ on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } } as never);

    const errors: string[] = [];
    svc.on('generation:failed', ({ hash }: { hash: string }) => errors.push(hash));

    await svc.enqueue('hash2', { width: [2, 0] }, '/fake/base.scad');
    await new Promise(r => setTimeout(r, 50));

    expect(errors).toContain('hash2');
    const errContent = await fs.readFile(path.join(tmpDir, 'custom', 'hash2', 'error.txt'), 'utf-8');
    expect(errContent).toContain('openscad crashed');
  });

  it('deduplicates concurrent enqueue calls for same hash', async () => {
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();

    const p1 = svc.enqueue('hash3', { width: [2, 0] }, '/fake/base.scad');
    const p2 = svc.enqueue('hash3', { width: [2, 0] }, '/fake/base.scad');
    await Promise.all([p1, p2]);
    await new Promise(r => setTimeout(r, 500));

    // spawn should only have been called once (6 calls for 1 job, not 12 for 2)
    expect(mockSpawn).toHaveBeenCalledTimes(6);
  });

  it('returns complete immediately if already done', async () => {
    const dir = path.join(tmpDir, 'library', 'done-hash');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'ortho.png'), 'x');

    const status = await svc.enqueue('done-hash', { width: [2, 0] }, '/fake/base.scad');
    expect(status).toBe('complete');
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

describe('seed', () => {
  it('generates into library/ subdir', async () => {
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();
    makeSpawnSuccess();

    const events: string[] = [];
    svc.on('generation:complete', ({ hash }: { hash: string }) => events.push(hash));

    await svc.seed('lib-hash', { width: [2, 0] }, '/fake/base.scad');
    await new Promise(r => setTimeout(r, 500));

    expect(events).toContain('lib-hash');
    // Dir should be under library/, not custom/
    await expect(fs.access(path.join(tmpDir, 'library', 'lib-hash'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tmpDir, 'custom', 'lib-hash'))).rejects.toThrow();
  });
});
