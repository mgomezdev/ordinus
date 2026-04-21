# On-Demand STL Generation & Live Customization Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user changes bin customizations the server generates a new STL + 5 images on demand, serves them via a cached `generated/library/` and `generated/custom/` directory structure, pushes completion status over SSE, and shows a spinner (or red ✕ on failure) on the placed item while generation runs.

**Architecture:** A `GenerationPipelineService` (EventEmitter) manages generation jobs with in-memory deduplication and filesystem-as-state (`ortho.png` = done, `error.txt` = failed). Library items with a `baseModel` are generated at server-start into `generated/library/{hash}/`; user customizations go into `generated/custom/{hash}/` and are cleaned up by a 24-hour setInterval after 30 days of inactivity. The frontend subscribes to one SSE connection, maps hash → status, and shows the generated image URL once complete.

**Tech Stack:** Node.js crypto (sha256), Express SSE, EventEmitter, Python subprocesses (`generate_bin.py`, `stl_to_png.py`), Vitest, React EventSource API.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `packages/server/src/utils/generationParams.ts` | `computeParamHash` |
| Create | `packages/server/src/utils/generationParams.test.ts` | Tests for hash utility |
| Create | `packages/server/src/services/generationPipeline.service.ts` | Core generation + EventEmitter |
| Create | `packages/server/src/services/generationPipeline.service.test.ts` | Tests |
| Create | `packages/server/src/services/generationCleanup.service.ts` | 24h cleanup setInterval |
| Create | `packages/server/src/services/generationCleanup.service.test.ts` | Tests |
| Create | `packages/server/src/routes/generation.routes.ts` | REST + SSE endpoints |
| Create | `packages/server/src/routes/generation.routes.test.ts` | Route tests |
| Modify | `packages/server/src/config.ts` | Add `LIBRARY_BUILDER_DIR` |
| Modify | `packages/server/src/db/migrate.ts` | Add `param_hash` column |
| Modify | `packages/server/src/db/schema.ts` | Add `paramHash` field |
| Modify | `packages/server/src/db/reseedLibraries.ts` | Generate library assets on seed |
| Modify | `packages/server/src/app.ts` | Register generation routes |
| Modify | `packages/server/src/index.ts` | Create dirs, start cleanup |
| Modify | `packages/server/src/services/bomGeneration.service.ts` | Reuse cached STL in 3MF |
| Create | `packages/app/src/api/generation.api.ts` | `requestGeneration` API call |
| Create | `packages/app/src/hooks/useGenerationEvents.ts` | SSE subscription hook |
| Create | `packages/app/src/hooks/useGenerationEvents.test.ts` | Hook tests |
| Create | `packages/app/src/hooks/useGenerationState.ts` | Generation status state |
| Create | `packages/app/src/hooks/useGenerationState.test.ts` | State hook tests |
| Modify | `packages/app/src/contexts/WorkspaceContext.tsx` | Expose generation state + request fn |
| Modify | `packages/app/src/components/PlacedItemOverlay.tsx` | Auth gate + spinner/error UI |
| Modify | `packages/app/src/components/PlacedItemOverlay.test.tsx` | Updated tests |
| Modify | `packages/app/src/components/LibraryItemCard.tsx` | Spinner for `paramHash` items |
| Modify | `packages/app/src/types/gridfinity.ts` | Add `paramHash` to `LibraryItem` |
| Modify | `packages/app/src/api/adapters/api.adapter.ts` | Map `paramHash` from API response |

---

## Task 1: DB Migration — Add `param_hash` and `parameters`

**Files:**
- Modify: `packages/server/src/db/migrate.ts`
- Modify: `packages/server/src/db/schema.ts`

- [ ] **Step 1: Add migrations in `migrate.ts`**

At the end of `runMigrations`, after the `stl_file` migration block (around line 318), add:

```typescript
// Add param_hash to library_items if missing
try {
  await client.execute(`ALTER TABLE library_items ADD COLUMN param_hash TEXT;`);
} catch {
  // Column already exists — ignore
}

// Add parameters JSON to libraries if missing (stores index.json parameters for generation)
try {
  await client.execute(`ALTER TABLE libraries ADD COLUMN parameters TEXT;`);
} catch {
  // Column already exists — ignore
}
```

- [ ] **Step 2: Add fields to schema**

In `packages/server/src/db/schema.ts`, in the `libraryItems` table definition, after `stlFile`:

```typescript
stlFile: text('stl_file'),
paramHash: text('param_hash'),
```

In the `libraries` table definition, after `baseModelPath`:

```typescript
baseModelPath: text('base_model_path'),
parameters: text('parameters'),
```

- [ ] **Step 3: Run unit tests to verify migration runs cleanly**

```bash
npx vitest run packages/server/src/services/bomGeneration.service.test.ts
```

Expected: all existing tests pass (migration runs in beforeAll).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/migrate.ts packages/server/src/db/schema.ts
git commit -m "feat(db): add param_hash column to library_items"
```

---

## Task 2: `computeParamHash` Utility

**Files:**
- Create: `packages/server/src/utils/generationParams.ts`
- Create: `packages/server/src/utils/generationParams.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/utils/generationParams.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeParamHash } from './generationParams.js';

describe('computeParamHash', () => {
  it('returns a 64-char hex sha256', () => {
    expect(computeParamHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent — same result for keys in any order', () => {
    const h1 = computeParamHash({ b: 2, a: 1 });
    const h2 = computeParamHash({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different values', () => {
    expect(computeParamHash({ a: 1 })).not.toBe(computeParamHash({ a: 2 }));
  });

  it('is stable across calls with identical input', () => {
    const params = { width: [2, 0], height: [4, 0], lip_style: 'normal' };
    expect(computeParamHash(params)).toBe(computeParamHash(params));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/server/src/utils/generationParams.test.ts
```

Expected: FAIL — `computeParamHash` not found.

- [ ] **Step 3: Implement `generationParams.ts`**

Create `packages/server/src/utils/generationParams.ts`:

```typescript
import { createHash } from 'crypto';

export function computeParamHash(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(params).sort((a, b) => a[0].localeCompare(b[0]))
    )
  );
  return createHash('sha256').update(canonical).digest('hex');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/server/src/utils/generationParams.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/utils/generationParams.ts packages/server/src/utils/generationParams.test.ts
git commit -m "feat(server): add computeParamHash utility"
```

---

## Task 3: Config + Directory Setup

**Files:**
- Modify: `packages/server/src/config.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add `LIBRARY_BUILDER_DIR` to config schema**

In `packages/server/src/config.ts`, in the `envSchema` object, after `GENERATED_STL_DIR`:

```typescript
LIBRARY_BUILDER_DIR: z.string().default('../../tools/library-builder'),
```

- [ ] **Step 2: Create generated subdirs in `index.ts`**

In `packages/server/src/index.ts`, in the `main()` function after the existing `fs.mkdir` calls (around line 18):

```typescript
await fs.mkdir(path.join(config.GENERATED_STL_DIR, 'library'), { recursive: true });
await fs.mkdir(path.join(config.GENERATED_STL_DIR, 'custom'), { recursive: true });
```

Add `import path from 'path';` at the top of index.ts if not already present.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/config.ts packages/server/src/index.ts
git commit -m "feat(server): add LIBRARY_BUILDER_DIR config and generated subdirs on startup"
```

---

## Task 4: `GenerationPipelineService`

**Files:**
- Create: `packages/server/src/services/generationPipeline.service.ts`
- Create: `packages/server/src/services/generationPipeline.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/services/generationPipeline.service.test.ts`:

```typescript
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
  const events: Record<string, ((...args: unknown[]) => void)[]> = {};
  const child = {
    on: (ev: string, fn: (...args: unknown[]) => void) => { (events[ev] ??= []).push(fn); },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  };
  mockSpawn.mockReturnValue(child as never);
  // Resolve close with code 0 asynchronously
  setTimeout(() => events['close']?.[0]?.(0), 0);
  return child;
}

function makeSpawnFail(stderr = 'openscad error') {
  const events: Record<string, ((...args: unknown[]) => void)[]> = {};
  const child = {
    on: (ev: string, fn: (...args: unknown[]) => void) => { (events[ev] ??= []).push(fn); },
    stdout: { on: vi.fn() },
    stderr: {
      on: (ev: string, fn: (buf: Buffer) => void) => {
        if (ev === 'data') fn(Buffer.from(stderr));
      },
    },
  };
  mockSpawn.mockReturnValue(child as never);
  setTimeout(() => events['close']?.[0]?.(1), 0);
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
    await new Promise(r => setTimeout(r, 50));
    expect(events).toContain('hash1');
    expect(await svc.getStatus('hash1')).toBe('complete');
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
    await new Promise(r => setTimeout(r, 50));

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

    await svc.seed('lib-hash', { width: [2, 0] }, '/fake/base.scad');
    await new Promise(r => setTimeout(r, 50));

    // Dir should be under library/, not custom/
    await expect(fs.access(path.join(tmpDir, 'library', 'lib-hash'))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/server/src/services/generationPipeline.service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `GenerationPipelineService`**

Create `packages/server/src/services/generationPipeline.service.ts`:

```typescript
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

export type GenerationStatus = 'pending' | 'complete' | 'failed' | 'not-found';

function runPython(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(PYTHON_CMD, args);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args[0]} exited ${code}: ${stderr.trim()}`));
    });
    child.on('error', reject);
  });
}

export class GenerationPipelineService extends EventEmitter {
  private readonly jobs = new Map<string, Promise<void>>();

  constructor(
    private readonly generatedDir: string,
    private readonly generatorDir: string,
    private readonly libraryBuilderDir: string,
  ) {
    super();
  }

  async getStatus(hash: string): Promise<GenerationStatus> {
    if (this.jobs.has(hash)) return 'pending';
    for (const subdir of ['library', 'custom'] as const) {
      const dir = path.join(this.generatedDir, subdir, hash);
      try {
        await fs.access(path.join(dir, 'ortho.png'));
        return 'complete';
      } catch { /* not here */ }
      try {
        await fs.access(path.join(dir, 'error.txt'));
        return 'failed';
      } catch { /* not here */ }
      try {
        await fs.access(dir);
        return 'pending';
      } catch { /* not here */ }
    }
    return 'not-found';
  }

  /** Enqueue a user customization into custom/. Returns immediately with status. */
  async enqueue(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
  ): Promise<GenerationStatus> {
    const current = await this.getStatus(hash);
    if (current === 'complete' || current === 'failed') return current;
    if (this.jobs.has(hash)) return 'pending';
    this.startJob(hash, params, baseModelPath, 'custom');
    return 'pending';
  }

  /** Seed a library item into library/. Returns immediately. */
  async seed(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
  ): Promise<void> {
    const current = await this.getStatus(hash);
    if (current === 'complete' || current === 'failed') return;
    if (this.jobs.has(hash)) return;
    this.startJob(hash, params, baseModelPath, 'library');
  }

  private startJob(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
    subdir: 'library' | 'custom',
  ): void {
    const job = this.runJob(hash, params, baseModelPath, subdir).finally(() => {
      this.jobs.delete(hash);
    });
    this.jobs.set(hash, job);
  }

  private async runJob(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
    subdir: 'library' | 'custom',
  ): Promise<void> {
    const dir = path.join(this.generatedDir, subdir, hash);
    await fs.mkdir(dir, { recursive: true });

    const paramsFile = path.join(dir, 'params.json');
    const stlFile = path.join(dir, 'bin.stl');
    const generateScript = path.join(this.generatorDir, 'generate_bin.py');
    const stlToPngScript = path.join(this.libraryBuilderDir, 'stl_to_png.py');

    try {
      await fs.writeFile(paramsFile, JSON.stringify(params));
      await runPython([generateScript, paramsFile, '--output', stlFile, '--model', baseModelPath]);

      await runPython([stlToPngScript, stlFile, '--orthographic', '-o', path.join(dir, 'ortho.png')]);
      for (const rotation of [0, 90, 180, 270]) {
        await runPython([
          stlToPngScript, stlFile,
          '-p', '--rotate', String(rotation),
          '-o', path.join(dir, `perspective_${rotation}.png`),
        ]);
      }

      this.emit('generation:complete', { hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await fs.writeFile(path.join(dir, 'error.txt'), msg).catch(() => {});
      this.emit('generation:failed', { hash, error: msg });
    }
  }
}

export const generationPipeline = new GenerationPipelineService(
  config.GENERATED_STL_DIR,
  config.GRIDFINITY_GENERATOR_DIR,
  config.LIBRARY_BUILDER_DIR,
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/server/src/services/generationPipeline.service.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/generationPipeline.service.ts packages/server/src/services/generationPipeline.service.test.ts
git commit -m "feat(server): add GenerationPipelineService with job dedup and SSE events"
```

---

## Task 5: `GenerationCleanupService`

**Files:**
- Create: `packages/server/src/services/generationCleanup.service.ts`
- Create: `packages/server/src/services/generationCleanup.service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/services/generationCleanup.service.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/server/src/services/generationCleanup.service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement cleanup service**

Create `packages/server/src/services/generationCleanup.service.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/server/src/services/generationCleanup.service.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/generationCleanup.service.ts packages/server/src/services/generationCleanup.service.test.ts
git commit -m "feat(server): add GenerationCleanupService for stale custom renders"
```

---

## Task 6: Generation Routes

**Files:**
- Create: `packages/server/src/routes/generation.routes.ts`
- Create: `packages/server/src/routes/generation.routes.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/routes/generation.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

vi.mock('../services/generationPipeline.service.js', () => ({
  generationPipeline: {
    enqueue: vi.fn().mockResolvedValue('pending'),
    getStatus: vi.fn().mockResolvedValue('not-found'),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import generationRoutes from './generation.routes.js';
import { generationPipeline } from '../services/generationPipeline.service.js';
const mockPipeline = vi.mocked(generationPipeline);

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');

beforeAll(async () => {
  await runMigrations(testClient);
  // Seed library + item
  const now = new Date().toISOString();
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO libraries (id, name, version, is_active, sort_order, created_at, updated_at, base_model_path)
          VALUES (?, ?, '1.0.0', 1, 0, ?, ?, ?)`,
    args: ['test-lib', 'Test Library', now, now, '/fake/base.scad'],
  });
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO library_items (library_id, id, name, width_units, height_units, color, is_active, sort_order, created_at, updated_at)
          VALUES (?, ?, 'Item', 2, 3, '#000', 1, 0, ?, ?)`,
    args: ['test-lib', 'item-1', now, now],
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/generation', generationRoutes);
  return app;
}

describe('POST /generation/generate', () => {
  it('returns 400 for missing body fields', async () => {
    const app = makeApp();
    const res = await request(app).post('/generation/generate').send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown library item', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/generation/generate')
      .send({ libraryId: 'no-lib', itemId: 'no-item' });
    expect(res.status).toBe(404);
  });

  it('enqueues and returns hash + pending status', async () => {
    const app = makeApp();
    mockPipeline.enqueue.mockResolvedValue('pending');
    const res = await request(app)
      .post('/generation/generate')
      .send({ libraryId: 'test-lib', itemId: 'item-1' });
    expect(res.status).toBe(200);
    expect(res.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.status).toBe('pending');
  });

  it('returns complete immediately if already cached', async () => {
    const app = makeApp();
    mockPipeline.enqueue.mockResolvedValue('complete');
    const res = await request(app)
      .post('/generation/generate')
      .send({ libraryId: 'test-lib', itemId: 'item-1' });
    expect(res.body.status).toBe('complete');
  });
});

describe('GET /generation/status/:hash', () => {
  it('returns status from pipeline', async () => {
    const app = makeApp();
    mockPipeline.getStatus.mockResolvedValue('complete');
    const res = await request(app).get('/generation/status/abc123');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hash: 'abc123', status: 'complete' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/server/src/routes/generation.routes.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement generation routes**

Create `packages/server/src/routes/generation.routes.ts`:

```typescript
import { Router } from 'express';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { normalize } from 'node:path';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../db/connection.js';
import { libraryItems, libraries } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { computeParamHash } from '../utils/generationParams.js';
import { buildGenerateParams } from '../services/bomGeneration.service.js';
import { generationPipeline } from '../services/generationPipeline.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

const VALID_IMAGE_FILENAMES = new Set([
  'ortho.png',
  'perspective_0.png',
  'perspective_90.png',
  'perspective_180.png',
  'perspective_270.png',
]);

// POST /generation/generate — enqueue for a library item + optional customization
router.post('/generate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { libraryId, itemId, customization } = req.body as {
      libraryId?: string;
      itemId?: string;
      customization?: Record<string, unknown>;
    };

    if (!libraryId || !itemId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'libraryId and itemId are required');
    }

    // Look up item + library (including stored parameters JSON)
    const itemRows = await db
      .select({
        widthUnits: libraryItems.widthUnits,
        heightUnits: libraryItems.heightUnits,
      })
      .from(libraryItems)
      .where(and(eq(libraryItems.libraryId, libraryId), eq(libraryItems.id, itemId)))
      .limit(1);

    if (!itemRows.length) {
      throw new AppError(ErrorCodes.NOT_FOUND, `Item ${libraryId}/${itemId} not found`);
    }

    const libRows = await db
      .select({ baseModelPath: libraries.baseModelPath, parameters: libraries.parameters })
      .from(libraries)
      .where(eq(libraries.id, libraryId))
      .limit(1);

    const baseModelPath = libRows[0]?.baseModelPath;
    if (!baseModelPath) {
      throw new AppError(ErrorCodes.NOT_FOUND, `Library ${libraryId} has no base model`);
    }

    const libraryParameters = libRows[0]?.parameters
      ? (JSON.parse(libRows[0].parameters) as Record<string, unknown>)
      : {};

    const { widthUnits, heightUnits } = itemRows[0];

    const params = buildGenerateParams({
      widthUnits,
      heightUnits,
      customization: customization as never ?? {
        wallPattern: 'none', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4,
      },
      qty: 1,
      filename: 'bin.stl',
      baseModelPath,
      parameters: Object.keys(libraryParameters).length > 0 ? libraryParameters : undefined,
    });

    const hash = computeParamHash(params as Record<string, unknown>);
    const status = await generationPipeline.enqueue(hash, params as Record<string, unknown>, baseModelPath);

    res.json({ hash, status });
  } catch (err) {
    next(err);
  }
});

// GET /generation/status/:hash
router.get('/status/:hash', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hash } = req.params;
    const status = await generationPipeline.getStatus(hash);
    res.json({ hash, status });
  } catch (err) {
    next(err);
  }
});

// GET /generation/image/:hash/:filename — serve image, touch .accessed for custom
router.get('/image/:hash/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hash, filename } = req.params;

    if (
      !VALID_IMAGE_FILENAMES.has(filename) ||
      hash.includes('..') || hash.includes('/') || hash.includes('\\')
    ) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid path');
    }

    const generatedDir = config.GENERATED_STL_DIR;

    for (const subdir of ['library', 'custom'] as const) {
      const dir = path.join(generatedDir, subdir, hash);
      const filePath = path.join(dir, filename);
      const normalizedBase = normalize(path.join(generatedDir, subdir));
      if (!normalize(filePath).startsWith(normalizedBase)) continue;

      if (existsSync(filePath)) {
        if (subdir === 'custom') {
          const accessedFile = path.join(dir, '.accessed');
          fs.writeFile(accessedFile, '').catch(() => {});
        }
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.sendFile(filePath);
        return;
      }
    }

    throw new AppError(ErrorCodes.NOT_FOUND, 'Image not found');
  } catch (err) {
    next(err);
  }
});

// GET /generation/stl/:hash — serve STL
router.get('/stl/:hash', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { hash } = req.params;
    if (hash.includes('..') || hash.includes('/') || hash.includes('\\')) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid hash');
    }

    const generatedDir = config.GENERATED_STL_DIR;
    for (const subdir of ['library', 'custom'] as const) {
      const filePath = path.join(generatedDir, subdir, hash, 'bin.stl');
      if (existsSync(filePath)) {
        res.sendFile(filePath);
        return;
      }
    }

    throw new AppError(ErrorCodes.NOT_FOUND, 'STL not found');
  } catch (err) {
    next(err);
  }
});

// GET /generation/events — SSE stream
router.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const onComplete = (d: { hash: string }) => send({ type: 'generation:complete', hash: d.hash });
  const onFailed = (d: { hash: string; error: string }) =>
    send({ type: 'generation:failed', hash: d.hash, error: d.error });

  generationPipeline.on('generation:complete', onComplete);
  generationPipeline.on('generation:failed', onFailed);

  req.on('close', () => {
    generationPipeline.off('generation:complete', onComplete);
    generationPipeline.off('generation:failed', onFailed);
  });

  logger.debug('SSE client connected for generation events');
});

export default router;
```

- [ ] **Step 4: Register routes in `app.ts`**

In `packages/server/src/app.ts`, add the import after existing route imports:

```typescript
import generationRoutes from './routes/generation.routes.js';
```

Add the route registration after the images route (before the rate limiter) for SSE, but register the full router after rate limiter. Actually, add it with other routes:

```typescript
app.use('/api/v1/generation', generationRoutes);
```

Place this after `app.use('/api/v1/bom', bomRoutes);`.

Also add `// SSE endpoint bypasses rate limiter for long-lived connections` comment and mount the events route separately before the rate limiter:

Actually for simplicity, just add the single line:
```typescript
app.use('/api/v1/generation', generationRoutes);
```
after the `app.use('/api/v1/bom', bomRoutes);` line. The rate limiter won't drop SSE connections — it counts requests, not connection duration.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run packages/server/src/routes/generation.routes.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/routes/generation.routes.ts packages/server/src/routes/generation.routes.test.ts packages/server/src/app.ts
git commit -m "feat(server): add generation REST endpoints and SSE stream"
```

---

## Task 7: Library Seeding with Generation

**Files:**
- Modify: `packages/server/src/db/reseedLibraries.ts`
- Modify: `packages/server/src/index.ts`

The key changes to `reseedLibraries.ts`:
1. Import `generationPipeline` and `computeParamHash`
2. Update the local `LibraryIndex` type — `customizableFields` is now `CustomizableFieldDef[]`
3. After inserting each item with `baseModel` and no `stlFile`: compute hash, call `generationPipeline.seed()`, store `param_hash` in DB
4. After all items inserted: delete `generated/library/{hash}` dirs not in any current `param_hash`

- [ ] **Step 1: Update the library INSERT to store `parameters` JSON**

In `reseedLibraries.ts`, find the `INSERT INTO libraries` statement (the one with `base_model_path`) and add `parameters` to it:

```typescript
await client.execute({
  sql: `INSERT INTO libraries (id, name, description, version, is_active, sort_order, created_at, updated_at, base_model_path, parameters)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  args: [
    lib.id, lib.name, null, libIndex.version, libIdx, now, now, baseModelPath,
    libIndex.parameters ? JSON.stringify(libIndex.parameters) : null,
  ],
});
```

- [ ] **Step 1b: Update local `LibraryIndex` type in `reseedLibraries.ts`**

Replace the existing `LibraryIndex` interface (lines 34–40 of `reseedLibraries.ts`):

```typescript
export interface LibraryIndex {
  version: string;
  baseModel?: string;
  customizableFields?: Array<
    | { field: string; label: string; options: string[] }
    | { field: 'height'; label: string; min: number; max: number }
  >;
  parameters?: Record<string, unknown>;
  items: LibraryItemJson[];
}
```

- [ ] **Step 2: Add imports to `reseedLibraries.ts`**

Add at the top, after existing imports:

```typescript
import { computeParamHash } from '../utils/generationParams.js';
import { buildGenerateParams } from '../services/bomGeneration.service.js';
import { generationPipeline } from '../services/generationPipeline.service.js';
import { config } from '../config.js';
```

- [ ] **Step 3: Add param_hash to the item INSERT and enqueue generation**

In `reseedLibraries.ts`, in the item insertion block (after the `stlFilePath` variable is determined, around line 208), replace the INSERT statement:

```typescript
// Compute param_hash and enqueue generation for baseModel items without a static STL
let paramHash: string | null = null;
if (baseModelPath && !item.stlFile) {
  const itemParams = libIndex.parameters ?? {};
  const generateParams = buildGenerateParams({
    widthUnits: item.widthUnits,
    heightUnits: item.heightUnits,
    customization: { wallPattern: 'none', lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4 },
    qty: 1,
    filename: 'bin.stl',
    baseModelPath,
    parameters: Object.keys(itemParams).length > 0 ? (itemParams as Record<string, unknown>) : undefined,
  });
  paramHash = computeParamHash(generateParams as Record<string, unknown>);
  // Fire-and-forget: enqueue into library/ subdir
  void generationPipeline.seed(paramHash, generateParams as Record<string, unknown>, baseModelPath);
}
```

Update the INSERT SQL to include `param_hash`:

```typescript
await client.execute({
  sql: `INSERT INTO library_items (library_id, id, name, width_units, height_units, color, image_path, perspective_image_path, is_active, sort_order, created_at, updated_at, stl_file, param_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  args: [lib.id, item.id, item.name, item.widthUnits, item.heightUnits, item.color, imagePath, perspectiveImagePath, itemIdx, now, now, stlFilePath, paramHash],
});
```

- [ ] **Step 4: Add seed-time cleanup of stale library hashes**

At the end of `reseedLibraryData`, before the final log summary, add:

```typescript
// Seed-time cleanup: delete library/{hash} dirs not referenced by any current library item
const hashRows = await client.execute(`SELECT DISTINCT param_hash FROM library_items WHERE param_hash IS NOT NULL`);
const currentHashes = new Set(hashRows.rows.map(r => r.param_hash as string));

const libraryGenDir = resolve(config.GENERATED_STL_DIR, 'library');
if (existsSync(libraryGenDir)) {
  const { readdir, rm: rmDir } = await import('node:fs/promises');
  const entries = await readdir(libraryGenDir).catch(() => [] as string[]);
  for (const hash of entries) {
    if (!currentHashes.has(hash)) {
      await rmDir(resolve(libraryGenDir, hash), { recursive: true, force: true });
      logger.info({ hash }, 'Removed stale library generation dir');
    }
  }
}
```

Add `existsSync` to the existing import from `node:fs` at the top of the file (it's already imported there).

- [ ] **Step 5: Start cleanup in `index.ts`**

In `packages/server/src/index.ts`, add import:

```typescript
import { startCleanup } from './services/generationCleanup.service.js';
```

Add this call after `reseedLibraryData`:

```typescript
startCleanup();
logger.info('Generation cleanup service started');
```

- [ ] **Step 6: Run full server test suite**

```bash
npx vitest run packages/server
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/db/reseedLibraries.ts packages/server/src/index.ts
git commit -m "feat(server): generate library assets on seed, cleanup stale library dirs"
```

---

## Task 8: 3MF Export — Reuse Cached STL

**Files:**
- Modify: `packages/server/src/services/bomGeneration.service.ts`

When generating a 3MF, for any `UniqueConfig` item, check `generated/library/{hash}` and `generated/custom/{hash}` for an existing `bin.stl` before regenerating.

- [ ] **Step 1: Import dependencies in `bomGeneration.service.ts`**

Add at the top (after existing imports):

```typescript
import { computeParamHash } from '../utils/generationParams.js';
```

- [ ] **Step 2: Modify `runGenerationPipeline` to check cache before generating**

In `runGenerationPipeline`, replace the "Generate parametric STLs" loop (around lines 228–236):

```typescript
// Step 2: Generate or reuse parametric STLs
for (const cfg of uniqueConfigs) {
  const stlPath = path.join(outDir, cfg.filename);

  // Check if already generated in library/ or custom/
  const params = buildGenerateParams(cfg);
  const hash = computeParamHash(params as Record<string, unknown>);

  let cachedStl: string | null = null;
  for (const subdir of ['library', 'custom'] as const) {
    const candidate = path.join(config.GENERATED_STL_DIR, subdir, hash, 'bin.stl');
    try {
      await fs.access(candidate);
      cachedStl = candidate;
      break;
    } catch { /* not cached */ }
  }

  if (cachedStl) {
    await fs.copyFile(cachedStl, stlPath);
    logger.info({ stlPath, hash }, 'Reused cached STL for 3MF');
  } else {
    const paramsPath = path.join(outDir, `params_${cfg.filename.replace('.stl', '')}.json`);
    await fs.writeFile(paramsPath, JSON.stringify(params));
    await runPython([generateBinScript, paramsPath, '--output', stlPath, '--model', cfg.baseModelPath]);
    logger.info({ stlPath }, 'Generated STL for 3MF');
  }
}
```

- [ ] **Step 3: Run bomGeneration tests**

```bash
npx vitest run packages/server/src/services/bomGeneration.service.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/bomGeneration.service.ts
git commit -m "feat(server): reuse cached generated STL in 3MF export"
```

---

## Task 9: Frontend — Generation API Client + `useGenerationEvents` Hook

**Files:**
- Create: `packages/app/src/api/generation.api.ts`
- Create: `packages/app/src/hooks/useGenerationEvents.ts`
- Create: `packages/app/src/hooks/useGenerationEvents.test.ts`
- Modify: `packages/app/src/types/gridfinity.ts`

- [ ] **Step 1: Add `paramHash` to `LibraryItem` type**

In `packages/app/src/types/gridfinity.ts`, add to the `LibraryItem` interface (after `parameters`):

```typescript
paramHash?: string;
```

- [ ] **Step 2: Map `paramHash` in `ApiAdapter`**

In `packages/app/src/api/adapters/api.adapter.ts`, in `getLibraryItems`, add to the map:

```typescript
paramHash: (item.paramHash as string | undefined) ?? undefined,
```

- [ ] **Step 3: Write failing test for `useGenerationEvents`**

Create `packages/app/src/hooks/useGenerationEvents.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGenerationEvents } from './useGenerationEvents';

class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  url: string;
  static instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  close = vi.fn();

  fire(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('useGenerationEvents', () => {
  it('opens EventSource at the correct URL', () => {
    renderHook(() => useGenerationEvents('http://localhost:3001/api/v1', vi.fn()));
    expect(MockEventSource.instances[0].url).toBe('http://localhost:3001/api/v1/generation/events');
  });

  it('calls onEvent when a message arrives', () => {
    const onEvent = vi.fn();
    renderHook(() => useGenerationEvents('http://localhost:3001/api/v1', onEvent));
    MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'abc' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'generation:complete', hash: 'abc' });
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() =>
      useGenerationEvents('http://localhost:3001/api/v1', vi.fn())
    );
    unmount();
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  it('ignores malformed messages', () => {
    const onEvent = vi.fn();
    renderHook(() => useGenerationEvents('http://localhost:3001/api/v1', onEvent));
    MockEventSource.instances[0].onmessage?.({ data: 'not-json' } as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx vitest run packages/app/src/hooks/useGenerationEvents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `useGenerationEvents`**

Create `packages/app/src/hooks/useGenerationEvents.ts`:

```typescript
import { useEffect } from 'react';

export interface GenerationEvent {
  type: 'generation:complete' | 'generation:failed';
  hash: string;
  error?: string;
}

export function useGenerationEvents(
  apiBase: string,
  onEvent: (event: GenerationEvent) => void,
): void {
  useEffect(() => {
    const es = new EventSource(`${apiBase}/generation/events`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as GenerationEvent;
        onEvent(data);
      } catch { /* ignore malformed */ }
    };
    return () => es.close();
  }, [apiBase]); // onEvent intentionally not in deps — callers must stabilize with useCallback
}
```

- [ ] **Step 6: Create generation API client**

Create `packages/app/src/api/generation.api.ts`:

```typescript
import { apiFetch, API_BASE_URL } from './apiClient';
import type { BinCustomization } from '../types/gridfinity';

export interface GenerateResponse {
  hash: string;
  status: 'pending' | 'complete' | 'failed';
}

export async function requestGenerationApi(
  libraryId: string,
  itemId: string,
  customization: BinCustomization | undefined,
  accessToken: string,
): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>(
    '/generation/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryId, itemId, customization }),
    },
    accessToken,
  );
}

export function generatedImageUrl(hash: string, filename: string): string {
  return `${API_BASE_URL}/generation/image/${hash}/${filename}`;
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx vitest run packages/app/src/hooks/useGenerationEvents.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/api/generation.api.ts packages/app/src/hooks/useGenerationEvents.ts packages/app/src/hooks/useGenerationEvents.test.ts packages/app/src/types/gridfinity.ts packages/app/src/api/adapters/api.adapter.ts
git commit -m "feat(app): add generation API client, useGenerationEvents SSE hook, paramHash type"
```

---

## Task 10: Frontend — `useGenerationState` Hook + WorkspaceContext

**Files:**
- Create: `packages/app/src/hooks/useGenerationState.ts`
- Create: `packages/app/src/hooks/useGenerationState.test.ts`
- Modify: `packages/app/src/contexts/WorkspaceContext.tsx`

- [ ] **Step 1: Write failing tests for `useGenerationState`**

Create `packages/app/src/hooks/useGenerationState.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGenerationState } from './useGenerationState';

// Stub EventSource so useGenerationEvents doesn't fail
class MockEventSource {
  onmessage: ((e: MessageEvent) => void) | null = null;
  static instances: MockEventSource[] = [];
  constructor() { MockEventSource.instances.push(this); }
  close = vi.fn();
  fire(data: object) { this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent); }
}
beforeEach(() => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('useGenerationState', () => {
  it('initially has no entries', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    expect(result.current.getEntry('abc')).toBeUndefined();
  });

  it('trackHash registers hash as pending', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    expect(result.current.getEntry('abc123')?.status).toBe('pending');
  });

  it('SSE complete event updates status to complete', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    act(() => MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'abc123' }));
    expect(result.current.getEntry('abc123')?.status).toBe('complete');
  });

  it('SSE failed event updates status to failed', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => result.current.trackHash('abc123'));
    act(() => MockEventSource.instances[0].fire({ type: 'generation:failed', hash: 'abc123', error: 'boom' }));
    expect(result.current.getEntry('abc123')?.status).toBe('failed');
  });

  it('SSE event for unknown hash is ignored', () => {
    const { result } = renderHook(() => useGenerationState('http://localhost:3001/api/v1'));
    act(() => MockEventSource.instances[0].fire({ type: 'generation:complete', hash: 'unknown' }));
    expect(result.current.getEntry('unknown')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/app/src/hooks/useGenerationState.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useGenerationState`**

Create `packages/app/src/hooks/useGenerationState.ts`:

```typescript
import { useState, useCallback } from 'react';
import { useGenerationEvents } from './useGenerationEvents';
import type { GenerationEvent } from './useGenerationEvents';

export type GenerationStatus = 'pending' | 'complete' | 'failed';

export interface GenerationEntry {
  status: GenerationStatus;
  hash: string;
}

export interface UseGenerationStateReturn {
  getEntry(hash: string): GenerationEntry | undefined;
  trackHash(hash: string): void;
}

export function useGenerationState(apiBase: string): UseGenerationStateReturn {
  const [entries, setEntries] = useState<Map<string, GenerationEntry>>(new Map());

  const onEvent = useCallback((event: GenerationEvent) => {
    setEntries((prev) => {
      if (!prev.has(event.hash)) return prev;
      const next = new Map(prev);
      next.set(event.hash, {
        hash: event.hash,
        status: event.type === 'generation:complete' ? 'complete' : 'failed',
      });
      return next;
    });
  }, []);

  useGenerationEvents(apiBase, onEvent);

  const trackHash = useCallback((hash: string) => {
    setEntries((prev) => {
      if (prev.has(hash)) return prev;
      const next = new Map(prev);
      next.set(hash, { hash, status: 'pending' });
      return next;
    });
  }, []);

  const getEntry = useCallback(
    (hash: string) => entries.get(hash),
    [entries],
  );

  return { getEntry, trackHash };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/app/src/hooks/useGenerationState.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Expose generation state in WorkspaceContext**

In `packages/app/src/contexts/WorkspaceContext.tsx`:

Add imports at the top:
```typescript
import { useGenerationState } from '../hooks/useGenerationState';
import type { GenerationEntry } from '../hooks/useGenerationState';
import { requestGenerationApi, generatedImageUrl } from '../api/generation.api';
import { API_BASE_URL } from '../api/apiClient';
```

Add to the `WorkspaceContextValue` interface (after existing fields):
```typescript
getGenerationEntry: (hash: string) => GenerationEntry | undefined;
trackGeneration: (instanceId: string, libraryId: string, itemId: string, customization: BinCustomization | undefined) => void;
generatedImageUrl: (hash: string, filename: string) => string;
```

In the `WorkspaceProvider` function body, after the existing hook calls, add:
```typescript
const { getEntry: getGenerationEntry, trackHash } = useGenerationState(API_BASE_URL);

const trackGeneration = useCallback(
  async (instanceId: string, libraryId: string, itemId: string, customization: BinCustomization | undefined) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const { hash, status } = await requestGenerationApi(libraryId, itemId, customization, token);
      trackHash(hash);
      if (status === 'complete' || status === 'failed') {
        // already done — trackHash still records it with the final status via a follow-up SSE
        // but since SSE won't re-fire for past events, set directly
        trackHash(hash); // no-op if already set; caller can call getGenerationEntry(hash) to get status
      }
    } catch {
      // non-critical — UI will just not show spinner
    }
  },
  [getAccessToken, trackHash],
);
```

Add `instanceId → hash` mapping so the overlay can look up by instanceId. Add to WorkspaceContext value:
```typescript
instanceGenerationHash: Map<string, string>;
recordInstanceHash: (instanceId: string, hash: string) => void;
```

And in the provider body:
```typescript
const [instanceGenerationHash, setInstanceGenerationHash] = useState<Map<string, string>>(new Map());
const recordInstanceHash = useCallback((instanceId: string, hash: string) => {
  setInstanceGenerationHash(prev => { const m = new Map(prev); m.set(instanceId, hash); return m; });
}, []);
```

Update `trackGeneration` to call `recordInstanceHash(instanceId, hash)` after getting the hash.

Expose all in the context value object.

- [ ] **Step 6: Run the full app unit test suite**

```bash
npx vitest run packages/app
```

Expected: all tests pass (WorkspaceContext tests may need updating if they snapshot context shape — update them to include the new fields).

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/hooks/useGenerationState.ts packages/app/src/hooks/useGenerationState.test.ts packages/app/src/contexts/WorkspaceContext.tsx
git commit -m "feat(app): add useGenerationState hook and generation tracking in WorkspaceContext"
```

---

## Task 11: Frontend — `PlacedItemOverlay` Auth Gate + Spinner/Error

**Files:**
- Modify: `packages/app/src/components/PlacedItemOverlay.tsx`
- Modify: `packages/app/src/components/PlacedItemOverlay.test.tsx`

- [ ] **Step 1: Add auth gate to gear button in `PlacedItemOverlay`**

In `PlacedItemOverlay.tsx`, add these imports:
```typescript
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
```

At the top of the `PlacedItemOverlay` component body, add:
```typescript
const { isAuthenticated } = useAuth();
const [, setSearchParams] = useSearchParams();
```

Find the handler that opens the customization popover (the gear button `onClick`). It currently calls `computePopoverPos()` and sets `showPopover`. Wrap it with an auth check:

```typescript
const handleGearClick = useCallback((e: React.MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
  if (!isAuthenticated) {
    setSearchParams({ authRequired: '1' }, { replace: true });
    return;
  }
  computePopoverPos();
  setShowPopover(true);
}, [isAuthenticated, setSearchParams, computePopoverPos]);
```

Replace the existing inline `onClick` on the gear button with `onClick={handleGearClick}`.

- [ ] **Step 2: Add generation state props to `PlacedItemOverlayProps`**

Add to the props interface:
```typescript
generationEntry?: { hash: string; status: 'pending' | 'complete' | 'failed' };
onCustomizationChangeWithGeneration?: (instanceId: string, customization: BinCustomization) => void;
```

- [ ] **Step 3: Wire customization change to trigger generation**

Find the existing `onCustomizationChange` call site in the component. Update `BinCustomizationPanel`'s `onChange` to also call `onCustomizationChangeWithGeneration`:

```typescript
onChange={(c) => {
  onCustomizationChange?.(item.instanceId, c);
  onCustomizationChangeWithGeneration?.(item.instanceId, c);
  setShowPopover(false);
}}
```

- [ ] **Step 4: Replace image display with generation-aware logic**

Find the existing `imageSrc` computation and `shouldShowImage` usage. Replace the image rendering section with:

```typescript
const isGenerating = generationEntry?.status === 'pending';
const generationFailed = generationEntry?.status === 'failed';

const effectiveImageSrc = (() => {
  if (generationEntry?.status === 'complete') {
    const filename = imageViewMode === 'perspective'
      ? `perspective_${item.rotation}.png`
      : 'ortho.png';
    return generatedImageUrl(generationEntry.hash, filename);
  }
  return imageSrc;
})();
```

In the JSX, replace the image rendering with:

```tsx
{isGenerating && (
  <div className="generation-spinner" aria-label="Generating preview" role="status">
    <div className="spinner" />
  </div>
)}
{generationFailed && (
  <div className="generation-error" aria-label="Generation failed" role="status">✕</div>
)}
{!isGenerating && !generationFailed && shouldShowImage && effectiveImageSrc && (
  <img
    src={effectiveImageSrc}
    alt={libraryItem?.name ?? ''}
    style={getImageStyle()}
    onLoad={handleImageLoad}
    onError={handleImageError}
    draggable={false}
  />
)}
{!isGenerating && !generationFailed && !shouldShowImage && (
  <div className="item-color-block" style={{ backgroundColor: color }} />
)}
```

- [ ] **Step 5: Update `PlacedItemOverlay.test.tsx` for new props and auth gate**

In `packages/app/src/components/PlacedItemOverlay.test.tsx`:

Add a mock for `AuthContext`:
```typescript
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));
```

Add tests for generation states:
```typescript
it('shows spinner when generationEntry is pending', () => {
  render(
    <PlacedItemOverlay
      {...defaultProps}
      generationEntry={{ hash: 'abc', status: 'pending' }}
    />
  );
  expect(screen.getByRole('status', { name: /generating/i })).toBeInTheDocument();
});

it('shows error icon when generationEntry is failed', () => {
  render(
    <PlacedItemOverlay
      {...defaultProps}
      generationEntry={{ hash: 'abc', status: 'failed' }}
    />
  );
  expect(screen.getByRole('status', { name: /generation failed/i })).toBeInTheDocument();
});

it('sets authRequired=1 search param when unauthenticated user clicks gear', async () => {
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false } as never);
  // Wrap in MemoryRouter so useSearchParams works
  render(
    <MemoryRouter>
      <PlacedItemOverlay {...defaultProps} />
    </MemoryRouter>
  );
  const gear = screen.getByRole('button', { name: /customize/i });
  await userEvent.click(gear);
  // Customization panel should NOT open
  expect(screen.queryByText(/Wall Pattern/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run overlay tests**

```bash
npx vitest run packages/app/src/components/PlacedItemOverlay.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Wire generation to GridPreview**

In `packages/app/src/components/GridPreview.tsx` (or wherever `PlacedItemOverlay` is rendered), pass the new props. Find where `onCustomizationChange` is passed and add `onCustomizationChangeWithGeneration` and `generationEntry`.

Consult `WorkspaceContext` for `trackGeneration`, `instanceGenerationHash`, and `getGenerationEntry`. Pass them down.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/components/PlacedItemOverlay.tsx packages/app/src/components/PlacedItemOverlay.test.tsx
git commit -m "feat(app): PlacedItemOverlay — auth gate, spinner, and error state for generation"
```

---

## Task 12: Frontend — `LibraryItemCard` Generated Image Support

**Files:**
- Modify: `packages/app/src/components/LibraryItemCard.tsx`

Library items with `paramHash` (no static `imageUrl`) should attempt to load the generated image URL. The browser's natural image loading — if the image 404s, `useImageLoadState` will flag `imageError = true`, which shows no image. Once SSE fires `generation:complete`, the parent component re-renders (via `useGenerationState`) and `shouldShowImage` becomes true when the image loads.

- [ ] **Step 1: Update `LibraryItemCard` to use generated URL if `paramHash` present**

In `packages/app/src/components/LibraryItemCard.tsx`:

Add import:
```typescript
import { generatedImageUrl } from '../api/generation.api';
import { useGenerationState } from '../hooks/useGenerationState';
import { API_BASE_URL } from '../api/apiClient';
```

Inside the component, before `useImageLoadState`:
```typescript
const { getEntry, trackHash } = useGenerationState(API_BASE_URL);

// Register paramHash items so SSE events update this card
useEffect(() => {
  if (item.paramHash) trackHash(item.paramHash);
}, [item.paramHash, trackHash]);

const generationEntry = item.paramHash ? getEntry(item.paramHash) : undefined;

const effectiveImageUrl = (() => {
  if (item.imageUrl) return item.imageUrl;
  if (item.paramHash && generationEntry?.status === 'complete') {
    return generatedImageUrl(item.paramHash, 'ortho.png');
  }
  if (item.paramHash) {
    // Try loading speculatively — may already be done from prior server start
    return generatedImageUrl(item.paramHash, 'ortho.png');
  }
  return undefined;
})();
```

Update `useImageLoadState` call:
```typescript
const { imageError, shouldShowImage, handleImageLoad, handleImageError } =
  useImageLoadState(effectiveImageUrl);
```

Show spinner if paramHash exists but image hasn't loaded yet:
```typescript
const isGenerating = !!(item.paramHash && !shouldShowImage && !imageError);
```

In the JSX, before the image element, add:
```tsx
{isGenerating && (
  <div className="generation-spinner" aria-label="Generating" role="status">
    <div className="spinner" />
  </div>
)}
```

- [ ] **Step 2: Run all app tests**

```bash
npx vitest run packages/app
```

Expected: all pass. Fix any snapshot or prop changes in card tests.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/LibraryItemCard.tsx
git commit -m "feat(app): LibraryItemCard shows spinner while generated image is pending"
```

---

## Task 13: Final Wiring + Full Test Run

- [ ] **Step 1: Run the full test suite**

```bash
npm run test:run
```

Expected: all 1211+ tests pass.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Start dev server and manually verify**

```bash
npm run dev
```

In the browser:
1. Open the app, place a bin from the library
2. Click the gear icon without logging in — verify auth modal opens
3. Log in, click the gear icon — customization panel opens
4. Change a customization — panel dismisses, spinner appears on placed item
5. Wait for SSE complete event — generated image appears
6. Check the library panel — items with `paramHash` show a spinner while generating, then resolve

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: on-demand STL generation with live customization preview"
```
