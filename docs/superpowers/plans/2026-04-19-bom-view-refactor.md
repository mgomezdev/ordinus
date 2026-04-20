# BOM View Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the order submission system, restructure `bom_generations` to link directly to layouts, and convert the "Order Summary" page to a self-service "BOM" page with Generate/Download 3MF buttons; add Mine/Users tabs to Saved Configs for admins.

**Architecture:** DB layer first (schema + migration), then server service/routes, then shared types, then frontend in bottom-up order (API clients → context → components → pages). Each layer compiles cleanly before the next begins.

**Tech Stack:** TypeScript, Express, Drizzle ORM, libsql (SQLite), React 19, TanStack Query, Vitest, React Testing Library

---

## File Map

**Create:**
- `packages/app/src/api/admin.api.ts` — admin user list + admin layout fetch
- `packages/app/src/hooks/useAdmin.ts` — useAdminUsersQuery, useAdminUserLayoutsQuery
- `packages/app/src/components/BomGenerationPanel.tsx` — Generate/Regenerate + Download 3MF UI
- `packages/app/src/components/BomGenerationPanel.test.tsx`

**Modify:**
- `packages/shared/src/types.ts` — remove LayoutStatus, ApiBomSubmission, LayoutStatusCount; update ApiLayout, ApiBomGeneration
- `packages/server/src/db/schema.ts` — remove status from layouts, remove bomSubmissions, restructure bomGenerations
- `packages/server/src/db/migrate.ts` — add migration steps
- `packages/server/src/services/bomGeneration.service.ts` — rewrite to use layoutId
- `packages/server/src/services/bomGeneration.service.test.ts` — update for layoutId
- `packages/server/src/controllers/bomGeneration.controller.ts` — rewrite for new routes
- `packages/server/src/controllers/bomGeneration.controller.test.ts` — update tests
- `packages/server/src/routes/bom.routes.ts` — new user-accessible generate/poll/download routes
- `packages/server/src/routes/admin.routes.ts` — add /admin/users, update /admin/layouts; remove deliver
- `packages/server/src/routes/layouts.routes.ts` — remove submit, withdraw routes
- `packages/server/src/services/layout.service.ts` — remove submitLayout, withdrawLayout, deliverLayout, getAdminLayouts; remove status from formatLayout
- `packages/server/src/controllers/layout.controller.ts` — remove submit, withdraw, deliver, getSubmittedCount, listAdminLayouts
- `packages/app/src/api/bomGeneration.api.ts` — update all functions to use layoutId
- `packages/app/src/api/layouts.api.ts` — remove submit, withdraw, deliver, fetchSubmittedCount, fetchAdminLayouts
- `packages/app/src/hooks/useLayouts.ts` — remove submit/withdraw/deliver/count/adminLayouts hooks
- `packages/app/src/reducers/layoutMetaReducer.ts` — remove status, submissionId
- `packages/app/src/contexts/WorkspaceContext.tsx` — remove handleSubmitLayout, isReadOnly, submittedCountQuery
- `packages/app/src/pages/OrderSummaryPage.tsx` — rename to BOM page, add BomGenerationPanel, remove AdminBomPanel + submit
- `packages/app/src/pages/SavedConfigsPage.tsx` — add Mine/Users tabs
- `packages/app/src/components/layouts/SavedConfigCard.tsx` — remove status badge, submit/withdraw buttons
- `packages/app/src/AppShell.tsx` — rename nav link, remove submit bar + admin badge + read-only banner

**Delete:**
- `packages/server/src/routes/bomGeneration.routes.ts`
- `packages/app/src/components/admin/AdminBomPanel.tsx`
- `packages/app/src/api/bom.api.ts` (or gut to empty)

---

## Task 1: Update Shared Types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Open and edit `packages/shared/src/types.ts`**

Make these changes:

a) Remove the `LayoutStatus` type (line ~216):
```typescript
// DELETE this entire line:
export type LayoutStatus = 'draft' | 'submitted' | 'delivered';
```

b) Remove `status` from `ApiLayout` (lines ~218-235):
```typescript
export interface ApiLayout {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  gridX: number;
  gridY: number;
  widthMm: number;
  depthMm: number;
  spacerHorizontal: string;
  spacerVertical: string;
  // DELETE: status: LayoutStatus;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  ownerUsername?: string;
  ownerEmail?: string;
}
```

c) Remove `ApiBomSubmission` interface entirely (lines ~389-401).

d) Update `ApiBomGeneration` — change `submissionId` to `layoutId`:
```typescript
export interface ApiBomGeneration {
  id: number;
  layoutId: number;  // was: submissionId: number
  status: BomGenerationStatus;
  fileManifest: BomGenerationManifestEntry[] | null;
  threeMfPath: string | null;
  generatedAt: string | null;
  errorMessage: string | null;
}
```

e) Remove `LayoutStatusCount` interface:
```typescript
// DELETE this entire interface:
export interface LayoutStatusCount {
  submitted: number;
}
```

- [ ] **Step 2: Build shared package to verify no TypeScript errors**

Run from repo root:
```bash
cd packages/shared && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "refactor(shared): remove submission system types, rename ApiBomGeneration.submissionId to layoutId"
```

---

## Task 2: Server DB Schema + Migration

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/src/db/migrate.ts`

- [ ] **Step 1: Update `schema.ts`**

Replace the `layouts` table definition — remove `status` field and `idx_layouts_status` index:
```typescript
export const layouts = sqliteTable('layouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  gridX: integer('grid_x').notNull(),
  gridY: integer('grid_y').notNull(),
  widthMm: real('width_mm').notNull(),
  depthMm: real('depth_mm').notNull(),
  spacerHorizontal: text('spacer_horizontal').notNull().default('none'),
  spacerVertical: text('spacer_vertical').notNull().default('none'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
}, (table) => [
  index('idx_layouts_user').on(table.userId),
]);
```

Replace `bomGenerations` table — change `submissionId` to `layoutId`, add `exportJson`:
```typescript
export const bomGenerations = sqliteTable('bom_generations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  layoutId: integer('layout_id').notNull().unique().references(() => layouts.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  exportJson: text('export_json'),
  fileManifest: text('file_manifest'),
  threeMfPath: text('three_mf_path'),
  generatedAt: text('generated_at'),
  errorMessage: text('error_message'),
});
```

Delete the `bomSubmissions` table definition entirely (lines ~189-201) and its relation exports.

Update the `bomGenerationsRelations` to reference `layouts` instead of `bomSubmissions`:
```typescript
export const bomGenerationsRelations = relations(bomGenerations, ({ one }) => ({
  layout: one(layouts, {
    fields: [bomGenerations.layoutId],
    references: [layouts.id],
  }),
}));
```

Also remove `bomSubmissionsRelations` entirely.

- [ ] **Step 2: Update `migrate.ts` — add migration steps at the end**

Append the following before the closing brace of `runMigrations`:

```typescript
  // BOM view refactor: drop status from layouts, migrate bom_generations to use layout_id
  try {
    await client.execute(`DROP INDEX IF EXISTS idx_layouts_status;`);
  } catch {}
  try {
    await client.execute(`ALTER TABLE layouts DROP COLUMN status;`);
  } catch {}

  // Migrate bom_generations from submission_id to layout_id (idempotent)
  try {
    // Probe for layout_id column — if it exists, table is already migrated
    await client.execute(`SELECT layout_id FROM bom_generations LIMIT 1;`);
  } catch {
    // layout_id doesn't exist yet — recreate the table
    try { await client.execute(`DROP TABLE IF EXISTS bom_generations;`); } catch {}
    try { await client.execute(`DROP TABLE IF EXISTS bom_submissions;`); } catch {}
    await client.execute(`
      CREATE TABLE IF NOT EXISTS bom_generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        layout_id INTEGER NOT NULL UNIQUE REFERENCES layouts(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        export_json TEXT,
        file_manifest TEXT,
        three_mf_path TEXT,
        generated_at TEXT,
        error_message TEXT
      );
    `);
  }
```

- [ ] **Step 3: Verify server TypeScript compiles**

```bash
cd packages/server && npx tsc --noEmit
```
Expected: errors only for files that reference the now-removed `status` / `submissionId` — those will be fixed in later tasks.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/migrate.ts
git commit -m "refactor(db): remove layout status, drop bom_submissions, restructure bom_generations with layout_id"
```

---

## Task 3: Server BOM Generation Service Rewrite (TDD)

**Files:**
- Modify: `packages/server/src/services/bomGeneration.service.ts`
- Modify: `packages/server/src/services/bomGeneration.service.test.ts`

- [ ] **Step 1: Update the test file first**

Replace the `beforeEach` setup in `bomGeneration.service.test.ts` to insert a layout (not a bom_submission):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { runMigrations } from '../db/migrate.js';
import type { BOMItem } from '@gridfinity/shared';
import { extractUniqueConfigs, formatBomGeneration, buildGenerateParams } from './bomGeneration.service.js';
import type { UniqueConfig } from './bomGeneration.service.js';

let client: ReturnType<typeof createClient>;

beforeEach(async () => {
  client = createClient({ url: ':memory:' });
  await runMigrations(client);
  await client.execute(
    `INSERT INTO users (id, email, username, password_hash) VALUES (1, 'a@b.com', 'admin', 'hash')`,
  );
  await client.execute(
    `INSERT INTO layouts (id, user_id, name, grid_x, grid_y, width_mm, depth_mm, created_at, updated_at)
     VALUES (1, 1, 'Test Layout', 4, 4, 168, 168, datetime('now'), datetime('now'))`,
  );
});
```

Update `formatBomGeneration` tests to check `layoutId` instead of `submissionId`:

```typescript
describe('formatBomGeneration', () => {
  it('formats a generation row correctly', () => {
    const row = {
      id: 1,
      layoutId: 1,
      status: 'ready' as const,
      fileManifest: JSON.stringify([{ filename: 'bin_2x3x8.stl', widthUnits: 2, heightUnits: 3, qty: 1 }]),
      threeMfPath: '/path/to/bom.3mf',
      generatedAt: '2024-01-01T00:00:00Z',
      errorMessage: null,
    };
    const result = formatBomGeneration(row);
    expect(result.id).toBe(1);
    expect(result.layoutId).toBe(1);
    expect(result.status).toBe('ready');
    expect(result.fileManifest).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests — confirm failures**

```bash
cd packages/server && npx vitest run src/services/bomGeneration.service.test.ts
```
Expected: failures referencing `submissionId`.

- [ ] **Step 3: Rewrite `bomGeneration.service.ts`**

Replace the DB helpers and public API functions:

```typescript
// Update the type alias:
type RawGenRow = Pick<
  typeof bomGenerations.$inferSelect,
  'id' | 'layoutId' | 'status' | 'fileManifest' | 'threeMfPath' | 'generatedAt' | 'errorMessage'
>;

export function formatBomGeneration(row: RawGenRow): ApiBomGeneration {
  return {
    id: row.id,
    layoutId: row.layoutId,
    status: row.status as ApiBomGeneration['status'],
    fileManifest: row.fileManifest ? (JSON.parse(row.fileManifest) as BomGenerationManifestEntry[]) : null,
    threeMfPath: row.threeMfPath,
    generatedAt: row.generatedAt,
    errorMessage: row.errorMessage,
  };
}

export async function getGeneration(layoutId: number): Promise<ApiBomGeneration | null> {
  const rows = await db.select().from(bomGenerations).where(eq(bomGenerations.layoutId, layoutId)).limit(1);
  return rows.length ? formatBomGeneration(rows[0]) : null;
}

export async function triggerGeneration(layoutId: number, bomItems: BOMItem[]): Promise<ApiBomGeneration> {
  const uniqueConfigs = extractUniqueConfigs(bomItems);

  const outDir = path.resolve(config.GENERATED_STL_DIR, `bom-layout-${layoutId}`);
  await fs.mkdir(outDir, { recursive: true });

  // Upsert generation record
  await db.delete(bomGenerations).where(eq(bomGenerations.layoutId, layoutId));
  const genRows = await db.insert(bomGenerations).values({
    layoutId,
    status: 'generating',
    exportJson: JSON.stringify(bomItems),
  }).returning();

  void runGenerationPipeline(layoutId, uniqueConfigs, outDir);

  return formatBomGeneration(genRows[0]);
}
```

Update `runGenerationPipeline` to use `layoutId`:
```typescript
async function runGenerationPipeline(
  layoutId: number,
  configs: UniqueConfig[],
  outDir: string,
): Promise<void> {
  // ... existing generation logic unchanged ...
  // Replace all occurrences of `submissionId` with `layoutId`
  // Change threeMfPath: path.join(outDir, `bom-${submissionId}.3mf`) → `bom-${layoutId}.3mf`
  
  // In the update queries:
  await db.update(bomGenerations)
    .set({ status: 'ready', fileManifest: JSON.stringify(manifest), threeMfPath, generatedAt: new Date().toISOString() })
    .where(eq(bomGenerations.layoutId, layoutId));
  // ... error handler similarly uses bomGenerations.layoutId
}
```

Remove the import of `bomSubmissions` from schema imports (no longer needed in this file).

- [ ] **Step 4: Run tests — confirm passing**

```bash
cd packages/server && npx vitest run src/services/bomGeneration.service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/bomGeneration.service.ts packages/server/src/services/bomGeneration.service.test.ts
git commit -m "refactor(bomGeneration.service): use layoutId instead of submissionId"
```

---

## Task 4: Server New BOM Controller + Routes (TDD)

**Files:**
- Modify: `packages/server/src/controllers/bomGeneration.controller.ts`
- Modify: `packages/server/src/controllers/bomGeneration.controller.test.ts`
- Modify: `packages/server/src/routes/bom.routes.ts`
- Delete: `packages/server/src/routes/bomGeneration.routes.ts`

- [ ] **Step 1: Write failing tests in `bomGeneration.controller.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock the service
vi.mock('../services/bomGeneration.service.js', () => ({
  triggerGeneration: vi.fn(),
  getGeneration: vi.fn(),
}));

import * as bomGenerationService from '../services/bomGeneration.service.js';
import { generateHandler, getGenerationHandler, serveFileHandler } from './bomGeneration.controller.js';

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    params: {},
    body: {},
    user: { userId: 1, role: 'user' },
    ...overrides,
  };
}

function makeRes(): Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as typeof res & Partial<Response>;
}

const next: NextFunction = vi.fn();

describe('generateHandler', () => {
  it('returns 202 with generation record on success', async () => {
    const mockGeneration = { id: 1, layoutId: 5, status: 'generating', fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null };
    vi.mocked(bomGenerationService.triggerGeneration).mockResolvedValueOnce(mockGeneration);

    const req = makeReq({ params: { layoutId: '5' }, body: { bomItems: [] }, user: { userId: 1, role: 'user' } });
    const res = makeRes();

    await generateHandler(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ data: mockGeneration });
  });

  it('calls next with error if layoutId is NaN', async () => {
    const req = makeReq({ params: { layoutId: 'bad' }, user: { userId: 1, role: 'user' } });
    const res = makeRes();
    await generateHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('getGenerationHandler', () => {
  it('returns 200 with generation record when found', async () => {
    const mockGeneration = { id: 1, layoutId: 5, status: 'ready', fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null };
    vi.mocked(bomGenerationService.getGeneration).mockResolvedValueOnce(mockGeneration);

    const req = makeReq({ params: { layoutId: '5' }, user: { userId: 1, role: 'user' } });
    const res = makeRes();

    await getGenerationHandler(req as Request, res as unknown as Response, next);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('calls next with NOT_FOUND when no generation exists', async () => {
    vi.mocked(bomGenerationService.getGeneration).mockResolvedValueOnce(null);

    const req = makeReq({ params: { layoutId: '5' }, user: { userId: 1, role: 'user' } });
    const res = makeRes();

    await getGenerationHandler(req as Request, res as unknown as Response, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — confirm failures**

```bash
cd packages/server && npx vitest run src/controllers/bomGeneration.controller.test.ts
```
Expected: FAIL

- [ ] **Step 3: Rewrite `bomGeneration.controller.ts`**

```typescript
import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, ApiBomGeneration, BOMItem } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as bomGenerationService from '../services/bomGeneration.service.js';
import { config } from '../config.js';

function parseLayoutId(req: Request): number {
  const id = parseInt(req.params.layoutId as string, 10);
  if (isNaN(id)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid layout ID');
  return id;
}

// Add this import at the top of the file:
// import { eq } from 'drizzle-orm';
// import { db } from '../db/connection.js';
// import { layouts } from '../db/schema.js';

async function assertLayoutOwnership(layoutId: number, userId: number): Promise<void> {
  const rows = await db.select({ userId: layouts.userId }).from(layouts).where(eq(layouts.id, layoutId)).limit(1);
  if (!rows.length) throw new AppError(ErrorCodes.NOT_FOUND, 'Layout not found');
  if (rows[0].userId !== userId) throw new AppError(ErrorCodes.FORBIDDEN, 'Not authorized');
}

export async function generateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const layoutId = parseLayoutId(req);
    if (!req.user) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    await assertLayoutOwnership(layoutId, req.user.userId);
    const bomItems = (req.body as { bomItems?: BOMItem[] }).bomItems ?? [];
    const generation = await bomGenerationService.triggerGeneration(layoutId, bomItems);
    const body: ApiResponse<ApiBomGeneration> = { data: generation };
    res.status(202).json(body);
  } catch (err) {
    next(err);
  }
}

export async function getGenerationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const layoutId = parseLayoutId(req);
    if (!req.user) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    await assertLayoutOwnership(layoutId, req.user.userId);
    const generation = await bomGenerationService.getGeneration(layoutId);
    if (!generation) throw new AppError(ErrorCodes.NOT_FOUND, 'No generation record for this layout');
    const body: ApiResponse<ApiBomGeneration> = { data: generation };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
}

export function serveFileHandler(req: Request, res: Response, next: NextFunction): void {
  try {
    const layoutId = parseLayoutId(req);
    if (!req.user) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    // Note: ownership check is sync-only here; assertLayoutOwnership is async.
    // Wrap the body in an async IIFE if the framework requires sync handler:
    // Call assertLayoutOwnership before serving the file (move to an async handler if needed).
    const filename = req.params.filename as string;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid filename');
    }

    const filePath = path.resolve(config.GENERATED_STL_DIR, `bom-layout-${layoutId}`, filename);
    const baseDir = path.resolve(config.GENERATED_STL_DIR);
    if (!filePath.startsWith(baseDir + path.sep)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid filename');
    }

    if (!existsSync(filePath)) throw new AppError(ErrorCodes.NOT_FOUND, 'File not found');

    const contentType = filename.endsWith('.3mf')
      ? 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'
      : filename.endsWith('.stl')
        ? 'model/stl'
        : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = createReadStream(filePath);
    stream.on('error', (err) => { next(err); });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4: Update `bom.routes.ts` with new routes**

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/bomGeneration.controller.js';

const router = Router();

router.post('/generate/:layoutId', requireAuth, ctrl.generateHandler);
router.get('/generation/:layoutId', requireAuth, ctrl.getGenerationHandler);
router.get('/generation/:layoutId/files/:filename', requireAuth, ctrl.serveFileHandler);

export default router;
```

- [ ] **Step 5: Delete `bomGeneration.routes.ts`**

```bash
rm packages/server/src/routes/bomGeneration.routes.ts
```

- [ ] **Step 6: Update server index/app to remove old bomGeneration routes registration**

Find `packages/server/src/index.ts` or `packages/server/src/app.ts` (whichever registers routes) and remove:
```typescript
// DELETE: import bomGenerationRoutes from './routes/bomGeneration.routes.js';
// DELETE: app.use('/api/v1', bomGenerationRoutes);
```

Verify `bom.routes.ts` is still registered under `/api/v1/bom`.

- [ ] **Step 7: Run tests — confirm passing**

```bash
cd packages/server && npx vitest run src/controllers/bomGeneration.controller.test.ts
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/controllers/bomGeneration.controller.ts \
        packages/server/src/controllers/bomGeneration.controller.test.ts \
        packages/server/src/routes/bom.routes.ts
git rm packages/server/src/routes/bomGeneration.routes.ts
git commit -m "refactor(bom): new user-accessible generate/poll/download routes via layoutId"
```

---

## Task 5: Server Admin Routes — Users + User-Filtered Layouts (TDD)

**Files:**
- Modify: `packages/server/src/routes/admin.routes.ts`
- Modify: `packages/server/src/controllers/layout.controller.ts` (add two admin handlers)
- Modify: `packages/server/src/services/layout.service.ts` (add getUsers, user-filtered layout query)

- [ ] **Step 1: Write failing tests**

Add to `packages/server/src/controllers/layout.controller.test.ts` (or create a new file `admin.controller.test.ts`):

```typescript
describe('getAdminUsers', () => {
  it('returns 200 with user list for admin', async () => {
    // Setup: insert two users
    // Call getAdminUsers with admin req.user
    // Assert: response is 200 with { data: [{ id, username }, ...] }
  });
});

describe('listAdminUserLayouts', () => {
  it('returns 200 with layouts for the given userId', async () => {
    // Setup: insert layouts for userId=2
    // Call listAdminUserLayouts with ?userId=2
    // Assert: response is 200 with array of layouts
  });

  it('returns 400 if userId query param is missing', async () => {
    // Call without userId param
    // Assert: next called with error
  });
});
```

(Use the existing test pattern from `layout.controller.test.ts`: in-memory libsql + `runMigrations`.)

- [ ] **Step 2: Run tests — confirm failures**

```bash
cd packages/server && npx vitest run src/controllers/layout.controller.test.ts
```
Expected: FAIL (functions don't exist yet)

- [ ] **Step 3: Add `getUsers` to layout service**

In `packages/server/src/services/layout.service.ts`, add:

```typescript
import { users } from '../db/schema.js'; // already imported

export async function getUsers(): Promise<Array<{ id: number; username: string }>> {
  const rows = await db.select({ id: users.id, username: users.username }).from(users).orderBy(users.username);
  return rows;
}
```

- [ ] **Step 4: Add admin handlers to `layout.controller.ts`**

```typescript
export async function getAdminUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userList = await layoutService.getUsers();
    res.status(200).json({ data: userList });
  } catch (err) {
    next(err);
  }
}

export async function listAdminUserLayouts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userIdStr = req.query.userId as string | undefined;
    if (!userIdStr) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'userId query param required');
    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId)) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid userId');

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limitStr = typeof req.query.limit === 'string' ? req.query.limit : '20';
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100);

    const result = await layoutService.getLayoutsByUser(userId, cursor, limit);
    const body: ApiListResponse<ApiLayout> = {
      data: result.data,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 5: Update `admin.routes.ts`**

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import * as layoutController from '../controllers/layout.controller.js';

const router = Router();

router.get('/admin/users', requireAuth, requireAdmin, layoutController.getAdminUsers);
router.get('/admin/layouts', requireAuth, requireAdmin, layoutController.listAdminUserLayouts);

export default router;
```

(Remove `/admin/layouts/count` and `/admin/layouts/:id/deliver` routes — covered in Task 6.)

- [ ] **Step 6: Run tests — confirm passing**

```bash
cd packages/server && npx vitest run src/controllers/layout.controller.test.ts
```
Expected: PASS (new tests pass, no regressions)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/admin.routes.ts \
        packages/server/src/controllers/layout.controller.ts \
        packages/server/src/services/layout.service.ts
git commit -m "feat(admin): add GET /admin/users and GET /admin/layouts?userId=X routes"
```

---

## Task 6: Server Layout Service + Routes Cleanup

**Files:**
- Modify: `packages/server/src/services/layout.service.ts`
- Modify: `packages/server/src/controllers/layout.controller.ts`
- Modify: `packages/server/src/routes/layouts.routes.ts`
- Modify: `packages/server/src/services/bom.service.ts` (delete or gut)
- Modify: `packages/server/src/controllers/bom.controller.ts` (delete)
- Modify: `packages/server/src/routes/bom.routes.ts` (already updated in Task 4)

- [ ] **Step 1: Remove `status` from `layout.service.ts`**

In `formatLayout`, remove the `status` field:
```typescript
function formatLayout(row: typeof layouts.$inferSelect, ownerUsername?: string, ownerEmail?: string): ApiLayout {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    gridX: row.gridX,
    gridY: row.gridY,
    widthMm: row.widthMm,
    depthMm: row.depthMm,
    spacerHorizontal: row.spacerHorizontal,
    spacerVertical: row.spacerVertical,
    isPublic: row.isPublic,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(ownerUsername !== undefined ? { ownerUsername } : {}),
    ...(ownerEmail !== undefined ? { ownerEmail } : {}),
  };
}
```

Remove the import of `LayoutStatus` from `@gridfinity/shared`.

Delete the following functions from `layout.service.ts`:
- `submitLayout`
- `withdrawLayout`
- `deliverLayout`
- `getAdminLayouts`

- [ ] **Step 2: Remove handlers from `layout.controller.ts`**

Delete the following exported functions:
- `submitLayout`
- `withdrawLayout`
- `deliverLayout`
- `listAdminLayouts` (old one that accepted status filter)
- `getSubmittedCount`

Remove `LayoutStatusCount` import from `@gridfinity/shared`.

- [ ] **Step 3: Update `layouts.routes.ts`**

Remove:
```typescript
// DELETE: router.patch('/:id/submit', requireAuth, layoutController.submitLayout);
// DELETE: router.patch('/:id/withdraw', requireAuth, layoutController.withdrawLayout);
```

Keep: GET, POST, PUT, PATCH (meta), DELETE, clone, reference-images routes.

- [ ] **Step 4: Delete or gut old BOM submit files**

Delete `packages/server/src/services/bom.service.ts` and `packages/server/src/controllers/bom.controller.ts`:
```bash
rm packages/server/src/services/bom.service.ts
rm packages/server/src/controllers/bom.controller.ts
```

`bom.routes.ts` already imports from `bomGeneration.controller.ts` after Task 4.

- [ ] **Step 5: Run server tests — fix any failures**

```bash
cd packages/server && npx vitest run
```
Expected: all passing. Fix any test that referenced the deleted functions.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/
git commit -m "refactor(server): remove submit/withdraw/deliver/count routes and bom submit service"
```

---

## Task 7: Frontend API Client Updates

**Files:**
- Modify: `packages/app/src/api/bomGeneration.api.ts`
- Modify: `packages/app/src/api/layouts.api.ts`
- Create: `packages/app/src/api/admin.api.ts`
- Delete: `packages/app/src/api/bom.api.ts`

- [ ] **Step 1: Rewrite `bomGeneration.api.ts`**

```typescript
import type { ApiResponse, ApiBomGeneration, BOMItem } from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function genFetch<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function triggerBomGeneration(layoutId: number, bomItems: BOMItem[], accessToken: string): Promise<ApiBomGeneration> {
  const result = await genFetch<ApiResponse<ApiBomGeneration>>(
    `/bom/generate/${layoutId}`,
    { method: 'POST', body: JSON.stringify({ bomItems }) },
    accessToken,
  );
  return result.data;
}

export async function getBomGeneration(layoutId: number, accessToken: string): Promise<ApiBomGeneration | null> {
  try {
    const result = await genFetch<ApiResponse<ApiBomGeneration>>(
      `/bom/generation/${layoutId}`,
      { method: 'GET' },
      accessToken,
    );
    return result.data;
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
}

export function getFileDownloadUrl(layoutId: number, filename: string): string {
  return `${API_BASE_URL}/bom/generation/${layoutId}/files/${encodeURIComponent(filename)}`;
}
```

- [ ] **Step 2: Create `admin.api.ts`**

```typescript
import type { ApiLayout, ApiListResponse } from '@gridfinity/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api/v1';

async function adminFetch<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return response.json();
}

export async function fetchAdminUsers(accessToken: string): Promise<Array<{ id: number; username: string }>> {
  const result = await adminFetch<{ data: Array<{ id: number; username: string }> }>('/admin/users', accessToken);
  return result.data;
}

export async function fetchAdminUserLayouts(accessToken: string, userId: number): Promise<ApiLayout[]> {
  const result = await adminFetch<ApiListResponse<ApiLayout>>(`/admin/layouts?userId=${userId}`, accessToken);
  return result.data;
}
```

- [ ] **Step 3: Remove deleted functions from `layouts.api.ts`**

Delete the following functions from `packages/app/src/api/layouts.api.ts`:
- `submitLayout`
- `withdrawLayout`
- `deliverLayout`
- `fetchSubmittedCount`
- `fetchAdminLayouts`

Remove `LayoutStatusCount` from the type import line.

- [ ] **Step 4: Delete `bom.api.ts`**

```bash
rm packages/app/src/api/bom.api.ts
```

- [ ] **Step 5: Check TypeScript**

```bash
cd packages/app && npx tsc --noEmit 2>&1 | head -40
```
Expected: errors about missing imports — they will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/api/bomGeneration.api.ts \
        packages/app/src/api/admin.api.ts \
        packages/app/src/api/layouts.api.ts
git rm packages/app/src/api/bom.api.ts
git commit -m "refactor(api-clients): update bomGeneration to use layoutId, add admin API, remove bom submit"
```

---

## Task 8: Frontend useLayouts.ts Cleanup + New Admin Hooks

**Files:**
- Modify: `packages/app/src/hooks/useLayouts.ts`
- Create: `packages/app/src/hooks/useAdmin.ts`

- [ ] **Step 1: Remove deleted hooks from `useLayouts.ts`**

Delete these exported functions entirely:
- `useSubmitLayoutMutation`
- `useWithdrawLayoutMutation`
- `useDeliverLayoutMutation`
- `useAdminLayoutsQuery`
- `useSubmittedCountQuery`

Remove from the import at the top:
- `submitLayout`, `withdrawLayout`, `deliverLayout`, `fetchSubmittedCount`, `fetchAdminLayouts`
- `LayoutStatusCount` from `@gridfinity/shared`

- [ ] **Step 2: Create `useAdmin.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { ApiLayout } from '@gridfinity/shared';
import { useAuth } from '../contexts/AuthContext';
import { fetchAdminUsers, fetchAdminUserLayouts } from '../api/admin.api';

export function useAdminUsersQuery() {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<Array<{ id: number; username: string }>> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      return fetchAdminUsers(token);
    },
    enabled: isAuthenticated && isAdmin,
  });
}

export function useAdminUserLayoutsQuery(userId: number | null) {
  const { getAccessToken, isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return useQuery({
    queryKey: ['admin-user-layouts', userId],
    queryFn: async (): Promise<ApiLayout[]> => {
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');
      if (userId === null) throw new Error('No userId');
      return fetchAdminUserLayouts(token, userId);
    },
    enabled: isAuthenticated && isAdmin && userId !== null,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/hooks/useLayouts.ts packages/app/src/hooks/useAdmin.ts
git commit -m "refactor(hooks): remove submit/withdraw/admin hooks, add useAdmin hooks"
```

---

## Task 9: Frontend WorkspaceContext + Reducer Cleanup

**Files:**
- Modify: `packages/app/src/reducers/layoutMetaReducer.ts`
- Modify: `packages/app/src/contexts/WorkspaceContext.tsx`

- [ ] **Step 1: Update `layoutMetaReducer.ts`**

New version — remove `status`, `submissionId`, and all related actions:

```typescript
export interface LayoutMetaState {
  id: number | null;
  name: string;
  description: string;
  owner: string;
}

export type LayoutMetaAction =
  | { type: 'LOAD_LAYOUT'; payload: { id: number; name: string; description: string; owner: string } }
  | { type: 'CLEAR_LAYOUT' }
  | { type: 'SAVE_COMPLETE'; payload: { id: number; name: string } }
  | { type: 'CLONE_COMPLETE'; payload: { id: number; name: string } };

export const initialLayoutMetaState: LayoutMetaState = {
  id: null,
  name: '',
  description: '',
  owner: '',
};

export function layoutMetaReducer(state: LayoutMetaState, action: LayoutMetaAction): LayoutMetaState {
  switch (action.type) {
    case 'LOAD_LAYOUT':
      return { ...initialLayoutMetaState, ...action.payload };
    case 'CLEAR_LAYOUT':
      return { ...initialLayoutMetaState };
    case 'SAVE_COMPLETE':
      return { ...state, id: action.payload.id, name: action.payload.name };
    case 'CLONE_COMPLETE':
      return { ...state, id: action.payload.id, name: action.payload.name };
    default:
      return state;
  }
}
```

- [ ] **Step 2: Update `WorkspaceContext.tsx` — remove submission system**

Remove these imports:
```typescript
// DELETE: import type { LayoutStatus, ApiUser } from '@gridfinity/shared';
// DELETE: import { useSubmitLayoutMutation, useWithdrawLayoutMutation, useCloneLayoutMutation, useSubmittedCountQuery } from '../hooks/useLayouts';
// DELETE: import { submitBom } from '../api/bom.api';
```

Keep `useCloneLayoutMutation` (still needed).

In `WorkspaceContextValue` interface, remove:
- `isReadOnly`
- `handleSetStatus`
- `handleSetSubmissionId`
- `handleSubmitLayout`
- `submitLayoutMutation`
- `submittedCountQuery`

Remove these from the context implementation body:
- `const submitLayoutMutation = useSubmitLayoutMutation();`
- `const submittedCountQuery = useSubmittedCountQuery();`
- `const isReadOnly = layoutMeta.status === 'delivered';`
- The `handleSubmitLayout` callback (which called submit mutation + submitBom)
- `handleSetStatus`
- `handleSetSubmissionId`

Update any SAVE_COMPLETE or LOAD_LAYOUT dispatches that previously set `status`:
```typescript
// When saving, dispatch without status:
layoutMetaDispatch({ type: 'SAVE_COMPLETE', payload: { id: layout.id, name: layout.name } });

// When loading, dispatch without status:
layoutMetaDispatch({ type: 'LOAD_LAYOUT', payload: { id: layout.id, name: layout.name, description: layout.description ?? '', owner: layout.ownerUsername ?? '' } });
```

- [ ] **Step 3: Fix all callers of removed context values**

Search for usages and remove them:
```bash
grep -r "isReadOnly\|handleSubmitLayout\|submittedCountQuery\|handleSetStatus\|handleSetSubmissionId\|layoutMeta\.status\|layoutMeta\.submissionId\|submitLayoutMutation" packages/app/src --include="*.tsx" --include="*.ts" -l
```

For each file found: remove or replace the usage. Most are in files refactored in later tasks (AppShell, OrderSummaryPage, SavedConfigsPage, SavedConfigCard).

- [ ] **Step 4: Run frontend unit tests**

```bash
cd packages/app && npx vitest run
```
Expected: near-passing. Fix any unit test that directly references removed state.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/reducers/layoutMetaReducer.ts packages/app/src/contexts/WorkspaceContext.tsx
git commit -m "refactor(context): remove submission system, status, isReadOnly from workspace state"
```

---

## Task 10: BomGenerationPanel Component (TDD)

**Files:**
- Create: `packages/app/src/components/BomGenerationPanel.tsx`
- Create: `packages/app/src/components/BomGenerationPanel.test.tsx`

- [ ] **Step 1: Write the test file**

```typescript
// packages/app/src/components/BomGenerationPanel.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BomGenerationPanel } from './BomGenerationPanel';

vi.mock('../api/bomGeneration.api', () => ({
  triggerBomGeneration: vi.fn(),
  getBomGeneration: vi.fn(),
  getFileDownloadUrl: vi.fn((id: number, filename: string) => `/api/bom/${id}/${filename}`),
}));

import * as bomApi from '../api/bomGeneration.api';

const baseProps = {
  layoutId: 1,
  bomItems: [],
  accessToken: 'tok',
};

describe('BomGenerationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue(null);
  });

  it('shows Generate button when no generation exists', async () => {
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /regenerate/i })).not.toBeInTheDocument();
  });

  it('shows Regenerate button when generation is ready', async () => {
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'ready',
      fileManifest: [{ filename: 'bom.3mf', widthUnits: 2, heightUnits: 3, qty: 1 }],
      threeMfPath: '/out/bom.3mf',
      generatedAt: '2024-01-01T00:00:00Z',
      errorMessage: null,
    });

    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument());
  });

  it('Download 3MF button is disabled until status is ready', async () => {
    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => screen.getByRole('button', { name: /download 3mf/i }));
    const btn = screen.getByRole('button', { name: /download 3mf/i });
    expect(btn).toBeDisabled();
  });

  it('Download 3MF button enabled and links to correct URL when ready', async () => {
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'ready',
      fileManifest: [{ filename: 'bom-layout-1.3mf', widthUnits: 2, heightUnits: 3, qty: 1 }],
      threeMfPath: '/out/bom.3mf',
      generatedAt: '2024-01-01T00:00:00Z',
      errorMessage: null,
    });

    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /download 3mf/i });
      expect(btn).not.toBeDisabled();
    });
  });

  it('calls triggerBomGeneration when Generate is clicked', async () => {
    vi.mocked(bomApi.triggerBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'generating',
      fileManifest: null, threeMfPath: null, generatedAt: null, errorMessage: null,
    });

    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => screen.getByRole('button', { name: /generate/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => expect(bomApi.triggerBomGeneration).toHaveBeenCalledWith(1, [], 'tok'));
  });

  it('shows error message when status is error', async () => {
    vi.mocked(bomApi.getBomGeneration).mockResolvedValue({
      id: 1, layoutId: 1, status: 'error',
      fileManifest: null, threeMfPath: null, generatedAt: null,
      errorMessage: 'Python failed',
    });

    render(<BomGenerationPanel {...baseProps} />);
    await waitFor(() => expect(screen.getByText(/python failed/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests — confirm failures**

```bash
cd packages/app && npx vitest run src/components/BomGenerationPanel.test.tsx
```
Expected: FAIL (component doesn't exist)

- [ ] **Step 3: Implement `BomGenerationPanel.tsx`**

```typescript
import { useState, useEffect, useRef } from 'react';
import type { ApiBomGeneration, BOMItem } from '../types/gridfinity';
import { triggerBomGeneration, getBomGeneration, getFileDownloadUrl } from '../api/bomGeneration.api';

interface BomGenerationPanelProps {
  layoutId: number | null;
  bomItems: BOMItem[];
  accessToken: string | null;
}

export function BomGenerationPanel({ layoutId, bomItems, accessToken }: BomGenerationPanelProps) {
  const [generation, setGeneration] = useState<ApiBomGeneration | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const fetchGeneration = async () => {
    if (!layoutId || !accessToken) return;
    try {
      const gen = await getBomGeneration(layoutId, accessToken);
      setGeneration(gen);
      if (gen?.status !== 'generating') stopPolling();
    } catch {
      stopPolling();
    }
  };

  useEffect(() => {
    void fetchGeneration();
    return stopPolling;
  }, [layoutId, accessToken]);

  useEffect(() => {
    if (generation?.status === 'generating') {
      pollRef.current = setInterval(() => { void fetchGeneration(); }, 3000);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [generation?.status]);

  const handleGenerate = async () => {
    if (!layoutId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const gen = await triggerBomGeneration(layoutId, bomItems, accessToken);
      setGeneration(gen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const isGenerating = generation?.status === 'generating' || loading;
  const isReady = generation?.status === 'ready';
  const hasGeneration = generation !== null;

  const threeMfFilename = generation?.threeMfPath
    ? generation.threeMfPath.split('/').pop() ?? ''
    : '';

  const downloadUrl = isReady && layoutId && threeMfFilename
    ? getFileDownloadUrl(layoutId, threeMfFilename)
    : null;

  return (
    <div className="bom-generation-panel">
      {generation?.errorMessage && (
        <div className="bom-gen-error">{generation.errorMessage}</div>
      )}
      {error && <div className="bom-gen-error">{error}</div>}
      <div className="bom-gen-actions">
        <button
          type="button"
          className="bom-gen-btn bom-gen-btn-primary"
          onClick={handleGenerate}
          disabled={isGenerating || !layoutId}
        >
          {isGenerating ? 'Generating…' : hasGeneration ? 'Regenerate' : 'Generate'}
        </button>
        <button
          type="button"
          className="bom-gen-btn"
          disabled={!isReady || !downloadUrl}
          onClick={() => { if (downloadUrl) window.location.href = downloadUrl; }}
        >
          Download 3MF
        </button>
      </div>
      {isReady && generation?.generatedAt && (
        <div className="bom-gen-status">
          Generated {new Date(generation.generatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — confirm passing**

```bash
cd packages/app && npx vitest run src/components/BomGenerationPanel.test.tsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/BomGenerationPanel.tsx packages/app/src/components/BomGenerationPanel.test.tsx
git commit -m "feat(ui): add BomGenerationPanel with Generate/Regenerate and Download 3MF"
```

---

## Task 11: BOM Page Refactor (OrderSummaryPage)

**Files:**
- Modify: `packages/app/src/pages/OrderSummaryPage.tsx`

- [ ] **Step 1: Update the page**

Make these targeted edits to `OrderSummaryPage.tsx`:

a) Remove imports:
```typescript
// DELETE: import { AdminBomPanel } from '../components/admin/AdminBomPanel';
```

Add import:
```typescript
import { BomGenerationPanel } from '../components/BomGenerationPanel';
```

b) Remove from `useWorkspace()` destructuring:
```typescript
// DELETE: submitLayoutMutation,
// DELETE: handleSubmitLayout,
// DELETE: isReadOnly,
```

c) Remove the `handleSubmit` function entirely:
```typescript
// DELETE:
const handleSubmit = async () => {
  try {
    await handleSubmitLayout();
    navigate('/configs');
  } catch { }
};
```

d) Replace the breadcrumb and title text:
```typescript
// Change "Order Summary" → "BOM" in:
// 1. breadcrumb: <span>Order Summary</span>  → <span>BOM</span>
// 2. title: <h2>Order Summary &amp; BOM</h2>  → <h2>Bill of Materials</h2>
// 3. subtitle: update to "Review your layout and generate STL files for printing."
```

e) Replace the AdminBomPanel block and Submit button in the right panel with BomGenerationPanel:
```typescript
// REMOVE this block:
// {isAdmin && layoutMeta.submissionId !== null && accessToken && (
//   <AdminBomPanel submissionId={layoutMeta.submissionId} accessToken={accessToken} />
// )}

// ADD:
{isAuthenticated && layoutMeta.id && accessToken && (
  <BomGenerationPanel
    layoutId={layoutMeta.id}
    bomItems={bomItems}
    accessToken={accessToken}
  />
)}
```

f) Remove the "Submit Layout" button from the right panel action buttons. Keep "Download PDF" and "Save & Exit".

- [ ] **Step 2: Run all frontend unit tests**

```bash
cd packages/app && npx vitest run
```
Expected: PASS (or fix any test referencing removed context values from this file)

- [ ] **Step 3: Delete `AdminBomPanel.tsx`**

```bash
rm packages/app/src/components/admin/AdminBomPanel.tsx
```

Also remove `AdminBomPanel.test.tsx` if it exists.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/pages/OrderSummaryPage.tsx
git rm packages/app/src/components/admin/AdminBomPanel.tsx
git commit -m "feat(bom-page): rename to BOM, replace AdminBomPanel+submit with BomGenerationPanel"
```

---

## Task 12: SavedConfigsPage — Mine/Users Tabs

**Files:**
- Modify: `packages/app/src/pages/SavedConfigsPage.tsx`

- [ ] **Step 1: Rewrite `SavedConfigsPage.tsx`**

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  useLayoutsQuery,
  useDeleteLayoutMutation,
  useCloneLayoutMutation,
} from '../hooks/useLayouts';
import { useAdminUsersQuery, useAdminUserLayoutsQuery } from '../hooks/useAdmin';
import { useAuth } from '../contexts/AuthContext';
import { SavedConfigCard } from '../components/layouts/SavedConfigCard';
import './SavedConfigsPage.css';

type Tab = 'mine' | 'users';

export function SavedConfigsPage() {
  const navigate = useNavigate();
  const { loadLayout } = useWorkspace();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const layoutsQuery = useLayoutsQuery();
  const deleteMutation = useDeleteLayoutMutation();
  const cloneMutation = useCloneLayoutMutation();

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('mine');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const adminUsersQuery = useAdminUsersQuery();
  const adminLayoutsQuery = useAdminUserLayoutsQuery(selectedUserId);

  const handleEdit = async (id: number) => {
    try {
      await loadLayout(id);
      navigate('/');
    } catch {
      console.error('Failed to load layout');
    }
  };

  const newConfigCard = (
    <button className="saved-config-card new-config" onClick={() => navigate('/')} type="button">
      <span className="saved-config-new-icon">+</span>
      <span className="saved-config-new-label">New Configuration</span>
      <span className="saved-config-new-hint">Start a fresh layout</span>
    </button>
  );

  return (
    <div className="saved-configs-page">
      {pageError && (
        <div className="saved-configs-error" role="alert">
          {pageError}
          <button type="button" className="saved-configs-error-dismiss" onClick={() => setPageError(null)} aria-label="Dismiss error">&times;</button>
        </div>
      )}
      <div className="saved-configs-header">
        <h2 className="saved-configs-title">Saved Configs</h2>
        <p className="saved-configs-subtitle">Review and manage your gridfinity layouts.</p>
      </div>

      {isAdmin && (
        <div className="saved-configs-tabs">
          <button
            type="button"
            className={`saved-configs-tab${activeTab === 'mine' ? ' active' : ''}`}
            onClick={() => setActiveTab('mine')}
          >
            Mine
          </button>
          <button
            type="button"
            className={`saved-configs-tab${activeTab === 'users' ? ' active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
        </div>
      )}

      {/* Mine tab */}
      {activeTab === 'mine' && (
        <>
          {layoutsQuery.isLoading && <div className="saved-configs-loading">Loading layouts...</div>}
          {layoutsQuery.isError && <div className="saved-configs-empty">{(layoutsQuery.error as Error)?.message ?? 'Failed to load layouts'}</div>}
          {!layoutsQuery.isLoading && !layoutsQuery.isError && layoutsQuery.data && layoutsQuery.data.length > 0 && (
            <div className="saved-configs-grid">
              {layoutsQuery.data.map(layout => (
                <SavedConfigCard
                  key={layout.id}
                  layout={layout}
                  onEdit={handleEdit}
                  onDelete={async (id) => {
                    setDeletingId(id);
                    try { await deleteMutation.mutateAsync(id); }
                    finally { setDeletingId(null); }
                  }}
                  onDuplicate={(id) => cloneMutation.mutate(id, {
                    onError: () => setPageError('Failed to duplicate. Please try again.'),
                    onSuccess: () => setPageError(null),
                  })}
                  isDeleting={deletingId === layout.id}
                />
              ))}
              {newConfigCard}
            </div>
          )}
          {!layoutsQuery.isLoading && !layoutsQuery.isError && layoutsQuery.data?.length === 0 && (
            <div className="saved-configs-empty">
              <p>No saved layouts yet.</p>
              <button className="saved-config-btn" onClick={() => navigate('/')} type="button">Start your first layout</button>
            </div>
          )}
        </>
      )}

      {/* Users tab (admin-only) */}
      {activeTab === 'users' && isAdmin && (
        <div className="saved-configs-users-tab">
          <div className="saved-configs-user-select">
            <label htmlFor="user-select">View configs for:</label>
            <select
              id="user-select"
              value={selectedUserId ?? ''}
              onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— Select a user —</option>
              {adminUsersQuery.data?.map(u => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </div>

          {!selectedUserId && (
            <div className="saved-configs-empty">Select a user to view their saved configs.</div>
          )}

          {selectedUserId && adminLayoutsQuery.isLoading && (
            <div className="saved-configs-loading">Loading...</div>
          )}

          {selectedUserId && !adminLayoutsQuery.isLoading && adminLayoutsQuery.data && adminLayoutsQuery.data.length > 0 && (
            <div className="saved-configs-grid">
              {adminLayoutsQuery.data.map(layout => (
                <SavedConfigCard
                  key={layout.id}
                  layout={layout}
                  onEdit={handleEdit}
                  onDelete={async (id) => {
                    setDeletingId(id);
                    try { await deleteMutation.mutateAsync(id); }
                    finally { setDeletingId(null); }
                  }}
                  onDuplicate={(id) => cloneMutation.mutate(id, {
                    onError: () => setPageError('Failed to duplicate. Please try again.'),
                    onSuccess: () => setPageError(null),
                  })}
                  isDeleting={deletingId === layout.id}
                />
              ))}
            </div>
          )}

          {selectedUserId && !adminLayoutsQuery.isLoading && adminLayoutsQuery.data?.length === 0 && (
            <div className="saved-configs-empty">No saved layouts for this user.</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run frontend tests**

```bash
cd packages/app && npx vitest run
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/SavedConfigsPage.tsx
git commit -m "feat(saved-configs): add Mine/Users tabs with admin user-filter dropdown"
```

---

## Task 13: SavedConfigCard + AppShell Cleanup

**Files:**
- Modify: `packages/app/src/components/layouts/SavedConfigCard.tsx`
- Modify: `packages/app/src/AppShell.tsx`

- [ ] **Step 1: Update `SavedConfigCard.tsx`**

Remove `onSubmit`, `onWithdraw` from the props interface and from the component body.

Remove status badge rendering (any element that shows `layout.status`).

Remove submit and withdraw buttons from the rendered UI.

The card should only have: Edit, Duplicate, Delete.

- [ ] **Step 2: Update `AppShell.tsx`**

a) Change nav link text `"Order Summary"` → `"BOM"`.

b) Remove "Review & Submit" button from status bar:
```typescript
// DELETE:
// {isAuthenticated && layoutMeta.status !== 'submitted' && layoutMeta.status !== 'delivered' && (
//   <NavLink to="/order" className="status-submit-btn" ...>Review & Submit →</NavLink>
// )}
```

c) Remove `SubmissionsBadge` and `AdminSubmissionsDialog` usage:
```typescript
// DELETE: import { AdminSubmissionsDialog } from './components/admin/AdminSubmissionsDialog';
// DELETE: import { SubmissionsBadge } from './components/admin/SubmissionsBadge';
// DELETE: the <SubmissionsBadge> JSX in status bar
// DELETE: the <AdminSubmissionsDialog> in Global dialogs section
// DELETE: 'admin' from the dialogReducer if no longer needed
```

d) Remove read-only banner:
```typescript
// DELETE:
// {isReadOnly && (
//   <div className="read-only-banner">...</div>
// )}
```

e) Remove status badge from nav layout info:
```typescript
// REMOVE this block inside nav-layout-info:
// {layoutMeta.status && (
//   <span className={`layout-status-badge layout-status-${layoutMeta.status}`}>
//     {layoutMeta.status}
//   </span>
// )}
```

f) Remove `submittedCountQuery` and `isReadOnly` from `useWorkspace()` destructuring.

- [ ] **Step 3: Run all frontend tests**

```bash
cd packages/app && npx vitest run
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/layouts/SavedConfigCard.tsx packages/app/src/AppShell.tsx
git commit -m "refactor(ui): remove status badges, submit/withdraw buttons, admin submission badge"
```

---

## Task 14: Lint + Full Test Suite

**Files:** Various (lint fixes)

- [ ] **Step 1: Run lint and fix all errors**

```bash
cd /c/Users/mgome/Documents/projects/gridfinity-customizer && npm run lint 2>&1
```
Fix every error shown. Common patterns to fix:
- Remove unused imports
- Remove unused variables
- Fix type errors from removed fields (e.g., `layout.status` access)

- [ ] **Step 2: Re-run lint until clean**

```bash
npm run lint
```
Expected: no errors, warnings only.

- [ ] **Step 3: Run all unit tests**

```bash
npm run test:run
```
Expected: all passing.

- [ ] **Step 4: Fix any remaining test failures**

Search for tests that reference `submissionId`, `LayoutStatus`, `status: 'draft'`, `isReadOnly`, `handleSubmitLayout`, `submitBom`. Update each test to match the new API shapes.

- [ ] **Step 5: Run tests again to confirm clean**

```bash
npm run test:run
```
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "fix(lint): clean up lint errors and update tests for BOM view refactor"
```

---

## Task 15: Docker Rebuild + Deploy

- [ ] **Step 1: Verify git status is clean**

```bash
git status
```
Expected: clean working tree.

- [ ] **Step 2: Rebuild and deploy Docker**

```bash
docker compose down && docker compose build --no-cache && docker compose up -d
```

- [ ] **Step 3: Verify server started**

```bash
docker compose logs --tail=30
```
Expected: server running without errors.

- [ ] **Step 4: Smoke test at localhost:32888**

Check manually:
- BOM page (nav link says "BOM", Generate button visible)
- Generate button triggers generation
- Saved Configs page: Mine tab works, Users tab shows dropdown for admins
- No "Submit Layout" button anywhere
- No status badges on layout cards

- [ ] **Step 5: Commit final state if any last-minute fixups**

```bash
git status
# Only commit if there are actual fixups
```
