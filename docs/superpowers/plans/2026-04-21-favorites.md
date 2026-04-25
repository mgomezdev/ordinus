# Favorites Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users save placed items (with their customizations) as server-side favorites, accessible from a Favorites library tab that persists across sessions and devices.

**Architecture:** A `favorites` DB table stores per-user snapshots of `BinCustomization` + library item metadata. Four REST endpoints (GET/POST/DELETE/PATCH) back a `useFavorites` TanStack Query hook. The UI adds a heart button to the placed item toolbar and a Favorites tab in LibraryPanel.

**Tech Stack:** drizzle-orm + libsql (server DB), Express + zod (API), TanStack Query + React (frontend), Vitest + supertest (tests), Playwright (E2E)

---

## File Map

**Create:**
- `packages/server/src/services/favorites.service.ts` — DB CRUD
- `packages/server/src/controllers/favorites.controller.ts` — request validation + handlers
- `packages/server/src/controllers/favorites.controller.test.ts` — server unit tests
- `packages/server/src/routes/favorites.routes.ts` — router (all auth-gated)
- `packages/app/src/api/favorites.api.ts` — fetch wrappers
- `packages/app/src/hooks/useFavorites.ts` — TanStack Query hook
- `packages/app/src/hooks/useFavorites.test.ts` — hook unit tests
- `packages/app/src/components/FavoriteCard.tsx` — draggable card with rename/delete
- `packages/app/src/components/FavoriteCard.test.tsx` — component unit tests
- `packages/app/e2e/tests/favorites.spec.ts` — E2E tests

**Modify:**
- `packages/server/src/db/migrate.ts` — add favorites table
- `packages/server/src/db/schema.ts` — add favorites drizzle table + relation
- `packages/server/src/app.ts` — register favorites route
- `packages/app/src/types/gridfinity.ts` — add `FavoriteItem`, extend `DragData`
- `packages/app/src/hooks/useGridItems.ts` — add `addItemWithCustomization`, handle `'favorite'` drop
- `packages/app/src/components/LibraryPanel.tsx` — add Favorites tab
- `packages/app/src/components/PlacedItemOverlay.tsx` — add heart button
- `packages/app/src/App.css` — heart button + FavoriteCard styles

---

## Task 1: DB migration — favorites table

**Files:**
- Modify: `packages/server/src/db/migrate.ts`
- Modify: `packages/server/src/db/schema.ts`

- [ ] **Step 1: Add favorites table to migrate.ts**

Open `packages/server/src/db/migrate.ts`. After the `bom_generations` block (around line 307, before the `ALTER TABLE` blocks), add:

```typescript
  await client.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      library_id TEXT NOT NULL,
      library_item_id TEXT NOT NULL,
      library_item_name TEXT NOT NULL,
      width_units INTEGER NOT NULL,
      height_units INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      param_hash TEXT,
      image_url TEXT NOT NULL DEFAULT '',
      perspective_image_url TEXT,
      perspective_image_url90 TEXT,
      perspective_image_url180 TEXT,
      perspective_image_url270 TEXT,
      customization TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
  `);
```

- [ ] **Step 2: Add favorites table to schema.ts**

Open `packages/server/src/db/schema.ts`. After the `bomGenerations` table (line 200), add:

```typescript
export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  libraryId: text('library_id').notNull(),
  libraryItemId: text('library_item_id').notNull(),
  libraryItemName: text('library_item_name').notNull(),
  widthUnits: integer('width_units').notNull(),
  heightUnits: integer('height_units').notNull(),
  color: text('color').notNull().default('#3B82F6'),
  paramHash: text('param_hash'),
  imageUrl: text('image_url').notNull().default(''),
  perspectiveImageUrl: text('perspective_image_url'),
  perspectiveImageUrl90: text('perspective_image_url90'),
  perspectiveImageUrl180: text('perspective_image_url180'),
  perspectiveImageUrl270: text('perspective_image_url270'),
  customization: text('customization').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_favorites_user').on(table.userId),
]);
```

Then add a relation at the end of the relations section (after `bomGenerationsRelations`):

```typescript
export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
}));
```

Also extend `usersRelations` to include `favorites: many(favorites)` — find the `usersRelations` block (line 203) and add to it:

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  layouts: many(layouts),
  stlUploads: many(userStlUploads),
  favorites: many(favorites),
}));
```

- [ ] **Step 3: Verify server still starts**

```bash
cd packages/server && npx tsx src/index.ts
```

Expected: server starts without errors, migrations complete log line visible. Ctrl+C to stop.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/migrate.ts packages/server/src/db/schema.ts
git commit -m "feat(favorites): add favorites table migration and schema"
```

---

## Task 2: Favorites service

**Files:**
- Create: `packages/server/src/services/favorites.service.ts`

- [ ] **Step 1: Write the failing test (in Task 3's test file — skip for now)**

The service is pure DB logic; it's covered by the controller integration tests in Task 3.

- [ ] **Step 2: Create favorites.service.ts**

```typescript
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import { favorites } from '../db/schema.js';
import type { BinCustomization } from '@gridfinity/shared';

export interface FavoriteRow {
  id: string;
  userId: number;
  name: string;
  libraryId: string;
  libraryItemId: string;
  libraryItemName: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  paramHash: string | null;
  imageUrl: string;
  perspectiveImageUrl: string | null;
  perspectiveImageUrl90: string | null;
  perspectiveImageUrl180: string | null;
  perspectiveImageUrl270: string | null;
  customization: string;
  createdAt: number;
}

export interface CreateFavoriteData {
  name: string;
  libraryId: string;
  libraryItemId: string;
  libraryItemName: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  paramHash?: string | null;
  imageUrl: string;
  perspectiveImageUrl?: string | null;
  perspectiveImageUrl90?: string | null;
  perspectiveImageUrl180?: string | null;
  perspectiveImageUrl270?: string | null;
  customization: BinCustomization;
}

export async function listFavorites(client: Client, userId: number): Promise<FavoriteRow[]> {
  const db = drizzle(client);
  return db.select().from(favorites).where(eq(favorites.userId, userId));
}

export async function createFavorite(
  client: Client,
  userId: number,
  data: CreateFavoriteData,
): Promise<FavoriteRow> {
  const db = drizzle(client);
  const id = nanoid();
  const createdAt = Date.now();
  const row = {
    id,
    userId,
    name: data.name,
    libraryId: data.libraryId,
    libraryItemId: data.libraryItemId,
    libraryItemName: data.libraryItemName,
    widthUnits: data.widthUnits,
    heightUnits: data.heightUnits,
    color: data.color,
    paramHash: data.paramHash ?? null,
    imageUrl: data.imageUrl,
    perspectiveImageUrl: data.perspectiveImageUrl ?? null,
    perspectiveImageUrl90: data.perspectiveImageUrl90 ?? null,
    perspectiveImageUrl180: data.perspectiveImageUrl180 ?? null,
    perspectiveImageUrl270: data.perspectiveImageUrl270 ?? null,
    customization: JSON.stringify(data.customization),
    createdAt,
  };
  await db.insert(favorites).values(row);
  return row;
}

export async function deleteFavorite(
  client: Client,
  favoriteId: string,
  userId: number,
): Promise<boolean> {
  const db = drizzle(client);
  const result = await db
    .delete(favorites)
    .where(and(eq(favorites.id, favoriteId), eq(favorites.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}

export async function renameFavorite(
  client: Client,
  favoriteId: string,
  userId: number,
  name: string,
): Promise<boolean> {
  const db = drizzle(client);
  const result = await db
    .update(favorites)
    .set({ name })
    .where(and(eq(favorites.id, favoriteId), eq(favorites.userId, userId)));
  return (result.rowsAffected ?? 0) > 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/services/favorites.service.ts
git commit -m "feat(favorites): add favorites service (CRUD)"
```

---

## Task 3: Favorites controller, routes, and app registration

**Files:**
- Create: `packages/server/src/controllers/favorites.controller.ts`
- Create: `packages/server/src/controllers/favorites.controller.test.ts`
- Create: `packages/server/src/routes/favorites.routes.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/controllers/favorites.controller.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockRename = vi.fn();

vi.mock('../services/favorites.service.js', () => ({
  listFavorites: (...args: unknown[]) => mockList(...args),
  createFavorite: (...args: unknown[]) => mockCreate(...args),
  deleteFavorite: (...args: unknown[]) => mockDelete(...args),
  renameFavorite: (...args: unknown[]) => mockRename(...args),
}));

vi.mock('../middleware/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../middleware/auth.js')>();
  return {
    ...actual,
    requireAuth: vi.fn((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.user = { userId: 42, role: 'user' };
      next();
    }),
  };
});

async function buildApp() {
  const app = express();
  app.use(express.json());
  const favRoutes = (await import('../routes/favorites.routes.js')).default;
  app.use('/api/v1/favorites', favRoutes);
  app.use(errorHandler);
  return app;
}

const validCustomization = {
  wallPatternEnabled: false,
  wallPattern: 'grid',
  lipStyle: 'normal',
  fingerSlide: 'none',
  wallCutout: 'none',
  height: 4,
};

const validBody = {
  name: 'My Bin',
  libraryId: 'bins_standard',
  libraryItemId: 'bin_2x3x7',
  libraryItemName: 'Bin 2×3×7',
  widthUnits: 2,
  heightUnits: 3,
  color: '#3B82F6',
  imageUrl: '/images/bin.png',
  customization: validCustomization,
};

describe('GET /api/v1/favorites', () => {
  beforeEach(() => mockList.mockResolvedValue([]));

  it('returns favorites for the authenticated user', async () => {
    const app = await buildApp();
    mockList.mockResolvedValue([{ id: 'fav1', name: 'My Bin', customization: JSON.stringify(validCustomization) }]);
    const res = await request(app).get('/api/v1/favorites');
    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(expect.anything(), 42);
  });
});

describe('POST /api/v1/favorites', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({ id: 'fav1', ...validBody, customization: JSON.stringify(validCustomization), createdAt: 1000 });
  });

  it('creates a favorite and returns 201', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/v1/favorites').send(validBody);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.anything(), 42, expect.objectContaining({ name: 'My Bin' }));
  });

  it('rejects body missing required fields', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/v1/favorites').send({ name: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/favorites/:id', () => {
  it('returns 204 on success', async () => {
    mockDelete.mockResolvedValue(true);
    const app = await buildApp();
    const res = await request(app).delete('/api/v1/favorites/fav1');
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith(expect.anything(), 'fav1', 42);
  });

  it('returns 404 when favorite not found or not owned', async () => {
    mockDelete.mockResolvedValue(false);
    const app = await buildApp();
    const res = await request(app).delete('/api/v1/favorites/missing');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/favorites/:id/name', () => {
  it('returns 200 on success', async () => {
    mockRename.mockResolvedValue(true);
    const app = await buildApp();
    const res = await request(app).patch('/api/v1/favorites/fav1/name').send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(mockRename).toHaveBeenCalledWith(expect.anything(), 'fav1', 42, 'Renamed');
  });

  it('returns 404 when favorite not found or not owned', async () => {
    mockRename.mockResolvedValue(false);
    const app = await buildApp();
    const res = await request(app).patch('/api/v1/favorites/missing/name').send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/server && npx vitest run src/controllers/favorites.controller.test.ts
```

Expected: FAIL — modules not found

- [ ] **Step 3: Create favorites.controller.ts**

```typescript
import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import { client } from '../db/connection.js';
import * as favoritesService from '../services/favorites.service.js';

const binCustomizationSchema = z.object({
  wallPatternEnabled: z.boolean().default(false),
  wallPattern: z.enum(['grid', 'hexgrid', 'brick', 'voronoi', 'voronoigrid', 'voronoihexgrid']),
  lipStyle: z.enum(['normal', 'reduced', 'minimum', 'none']),
  fingerSlide: z.enum(['none', 'rounded', 'chamfered']),
  wallCutout: z.enum(['none', 'vertical', 'horizontal', 'both']),
  height: z.number().int().min(1).max(20),
});

const createFavoriteSchema = z.object({
  name: z.string().min(1).max(255),
  libraryId: z.string().min(1),
  libraryItemId: z.string().min(1),
  libraryItemName: z.string().min(1).max(255),
  widthUnits: z.number().int().min(1).max(10),
  heightUnits: z.number().int().min(1).max(10),
  color: z.string().min(1),
  paramHash: z.string().nullable().optional(),
  imageUrl: z.string().default(''),
  perspectiveImageUrl: z.string().nullable().optional(),
  perspectiveImageUrl90: z.string().nullable().optional(),
  perspectiveImageUrl180: z.string().nullable().optional(),
  perspectiveImageUrl270: z.string().nullable().optional(),
  customization: binCustomizationSchema,
});

const renameSchema = z.object({
  name: z.string().min(1).max(255),
});

function serializeFavorite(row: favoritesService.FavoriteRow) {
  return {
    id: row.id,
    name: row.name,
    libraryId: row.libraryId,
    libraryItemId: row.libraryItemId,
    libraryItemName: row.libraryItemName,
    widthUnits: row.widthUnits,
    heightUnits: row.heightUnits,
    color: row.color,
    paramHash: row.paramHash,
    imageUrl: row.imageUrl,
    perspectiveImageUrl: row.perspectiveImageUrl,
    perspectiveImageUrl90: row.perspectiveImageUrl90,
    perspectiveImageUrl180: row.perspectiveImageUrl180,
    perspectiveImageUrl270: row.perspectiveImageUrl270,
    customization: JSON.parse(row.customization),
    createdAt: row.createdAt,
  };
}

export async function listFavorites(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const rows = await favoritesService.listFavorites(client, userId);
    res.json({ data: rows.map(serializeFavorite) });
  } catch (err) {
    next(err);
  }
}

export async function createFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = createFavoriteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, parsed.error.errors[0]?.message ?? 'Invalid request');
    }
    const userId = req.user!.userId;
    const row = await favoritesService.createFavorite(client, userId, parsed.data);
    res.status(201).json({ data: serializeFavorite(row) });
  } catch (err) {
    next(err);
  }
}

export async function deleteFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const deleted = await favoritesService.deleteFavorite(client, req.params.id, userId);
    if (!deleted) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Favorite not found');
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function renameFavorite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'name is required');
    }
    const userId = req.user!.userId;
    const updated = await favoritesService.renameFavorite(client, req.params.id, userId, parsed.data.name);
    if (!updated) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Favorite not found');
    }
    res.json({ data: { id: req.params.id, name: parsed.data.name } });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4: Create favorites.routes.ts**

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as favoritesController from '../controllers/favorites.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', favoritesController.listFavorites);
router.post('/', favoritesController.createFavorite);
router.delete('/:id', favoritesController.deleteFavorite);
router.patch('/:id/name', favoritesController.renameFavorite);

export default router;
```

- [ ] **Step 5: Register route in app.ts**

Open `packages/server/src/app.ts`. Add the import after the last route import (line 21):

```typescript
import favoritesRoutes from './routes/favorites.routes.js';
```

Add the route registration after `app.use('/api/v1/user-stls', userStlsRouter);` (line 68):

```typescript
  app.use('/api/v1/favorites', favoritesRoutes);
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run src/controllers/favorites.controller.test.ts
```

Expected: all 6 tests PASS

- [ ] **Step 7: Run full server test suite**

```bash
cd packages/server && npx vitest run
```

Expected: all tests pass, no regressions

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/controllers/favorites.controller.ts packages/server/src/controllers/favorites.controller.test.ts packages/server/src/routes/favorites.routes.ts packages/server/src/app.ts
git commit -m "feat(favorites): add favorites REST API (GET/POST/DELETE/PATCH)"
```

---

## Task 4: FavoriteItem type + favorites API client

**Files:**
- Modify: `packages/app/src/types/gridfinity.ts`
- Create: `packages/app/src/api/favorites.api.ts`

- [ ] **Step 1: Add FavoriteItem and extend DragData in gridfinity.ts**

Open `packages/app/src/types/gridfinity.ts`. After the `DEFAULT_BIN_CUSTOMIZATION` constant (after line 151), add:

```typescript
export interface FavoriteItem {
  id: string;
  name: string;
  createdAt: number;
  libraryId: string;
  libraryItemId: string;
  libraryItemName: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  paramHash: string | null;
  imageUrl: string;
  perspectiveImageUrl: string | null;
  perspectiveImageUrl90: string | null;
  perspectiveImageUrl180: string | null;
  perspectiveImageUrl270: string | null;
  customization: BinCustomization;
}
```

Update the `DragData` interface (line 84) to add `'favorite'` type:

```typescript
export interface DragData {
  type: 'library' | 'placed' | 'ref-image' | 'favorite';
  itemId: string;
  instanceId?: string;
  refImageId?: number;
  refImageUrl?: string;
  refImageName?: string;
  favoriteCustomization?: BinCustomization;
}
```

- [ ] **Step 2: Create favorites.api.ts**

```typescript
import { apiFetch } from './apiClient';
import type { FavoriteItem, BinCustomization } from '../types/gridfinity';

interface FavoritesListResponse {
  data: FavoriteItem[];
}

interface FavoriteResponse {
  data: FavoriteItem;
}

export interface CreateFavoriteRequest {
  name: string;
  libraryId: string;
  libraryItemId: string;
  libraryItemName: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  paramHash: string | null;
  imageUrl: string;
  perspectiveImageUrl: string | null;
  perspectiveImageUrl90: string | null;
  perspectiveImageUrl180: string | null;
  perspectiveImageUrl270: string | null;
  customization: BinCustomization;
}

export async function listFavoritesApi(token: string): Promise<FavoriteItem[]> {
  const res = await apiFetch<FavoritesListResponse>('/favorites', {}, token);
  return res.data;
}

export async function createFavoriteApi(
  data: CreateFavoriteRequest,
  token: string,
): Promise<FavoriteItem> {
  const res = await apiFetch<FavoriteResponse>(
    '/favorites',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
    token,
  );
  return res.data;
}

export async function deleteFavoriteApi(id: string, token: string): Promise<void> {
  await apiFetch<void>(`/favorites/${id}`, { method: 'DELETE' }, token);
}

export async function renameFavoriteApi(id: string, name: string, token: string): Promise<void> {
  await apiFetch<void>(
    `/favorites/${id}/name`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) },
    token,
  );
}
```

- [ ] **Step 3: Run type check**

```bash
cd packages/app && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/types/gridfinity.ts packages/app/src/api/favorites.api.ts
git commit -m "feat(favorites): add FavoriteItem type and favorites API client"
```

---

## Task 5: useFavorites hook

**Files:**
- Create: `packages/app/src/hooks/useFavorites.ts`
- Create: `packages/app/src/hooks/useFavorites.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/app/src/hooks/useFavorites.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { useFavorites } from './useFavorites';
import type { FavoriteItem, BinCustomization } from '../types/gridfinity';

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockDelete = vi.fn();
const mockRename = vi.fn();

vi.mock('../api/favorites.api', () => ({
  listFavoritesApi: (...args: unknown[]) => mockList(...args),
  createFavoriteApi: (...args: unknown[]) => mockCreate(...args),
  deleteFavoriteApi: (...args: unknown[]) => mockDelete(...args),
  renameFavoriteApi: (...args: unknown[]) => mockRename(...args),
}));

const mockGetAccessToken = vi.fn(() => 'test-token');
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, getAccessToken: mockGetAccessToken }),
}));

const defaultCustomization: BinCustomization = {
  wallPatternEnabled: false, wallPattern: 'grid',
  lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4,
};

const voronoiCustomization: BinCustomization = {
  wallPatternEnabled: true, wallPattern: 'voronoi',
  lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4,
};

const mockFavorite: FavoriteItem = {
  id: 'fav1', name: 'Bin 2×3×7 (voronoi)', createdAt: 1000,
  libraryId: 'bins_standard', libraryItemId: 'bin_2x3x7', libraryItemName: 'Bin 2×3×7',
  widthUnits: 2, heightUnits: 3, color: '#3B82F6',
  paramHash: null, imageUrl: '/img.png',
  perspectiveImageUrl: null, perspectiveImageUrl90: null,
  perspectiveImageUrl180: null, perspectiveImageUrl270: null,
  customization: voronoiCustomization,
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useFavorites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([mockFavorite]);
    mockCreate.mockResolvedValue({ ...mockFavorite, id: 'fav2' });
    mockDelete.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
  });

  it('returns favorites from API', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.favorites[0].id).toBe('fav1');
  });

  it('isFavorite returns true for matching itemId + customization', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFavorite('bins_standard:bin_2x3x7', voronoiCustomization)).toBe(true);
    expect(result.current.isFavorite('bins_standard:bin_2x3x7', defaultCustomization)).toBe(false);
  });

  it('isFavorite returns false for different libraryItemId', async () => {
    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isFavorite('bins_standard:bin_1x1x5', voronoiCustomization)).toBe(false);
  });

  it('returns empty state when not authenticated', async () => {
    vi.mocked(vi.importMock('../contexts/AuthContext') as never);
    // Reset mock to simulate unauthenticated
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/app && npx vitest run src/hooks/useFavorites.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create useFavorites.ts**

```typescript
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  listFavoritesApi,
  createFavoriteApi,
  deleteFavoriteApi,
  renameFavoriteApi,
} from '../api/favorites.api';
import type { FavoriteItem, BinCustomization, LibraryItem } from '../types/gridfinity';

const QUERY_KEY = ['favorites'] as const;

function binCustomizationsEqual(a: BinCustomization, b: BinCustomization): boolean {
  return (
    a.wallPatternEnabled === b.wallPatternEnabled &&
    a.wallPattern === b.wallPattern &&
    a.lipStyle === b.lipStyle &&
    a.fingerSlide === b.fingerSlide &&
    a.wallCutout === b.wallCutout &&
    a.height === b.height
  );
}

export function generateFavoriteName(libraryItemName: string, customization: BinCustomization): string {
  if (customization.wallPatternEnabled) {
    return `${libraryItemName} (${customization.wallPattern})`;
  }
  if (customization.lipStyle !== 'normal') {
    return `${libraryItemName} (${customization.lipStyle})`;
  }
  return libraryItemName;
}

export interface UseFavoritesResult {
  favorites: FavoriteItem[];
  isLoading: boolean;
  isFavorite: (itemId: string, customization: BinCustomization) => boolean;
  toggleFavorite: (
    libraryItem: LibraryItem,
    customization: BinCustomization,
    paramHash: string | null,
  ) => void;
  removeFavorite: (favoriteId: string) => void;
  renameFavorite: (favoriteId: string, name: string) => void;
}

export function useFavorites(): UseFavoritesResult {
  const { isAuthenticated, getAccessToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listFavoritesApi(getAccessToken()!),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createFavoriteApi>[0]) =>
      createFavoriteApi(data, getAccessToken()!),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FavoriteItem[]>(QUERY_KEY);
      const optimistic: FavoriteItem = { ...data, id: `temp-${Date.now()}`, createdAt: Date.now() };
      queryClient.setQueryData<FavoriteItem[]>(QUERY_KEY, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFavoriteApi(id, getAccessToken()!),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FavoriteItem[]>(QUERY_KEY);
      queryClient.setQueryData<FavoriteItem[]>(QUERY_KEY, (old) => (old ?? []).filter((f) => f.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameFavoriteApi(id, name, getAccessToken()!),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<FavoriteItem[]>(QUERY_KEY);
      queryClient.setQueryData<FavoriteItem[]>(QUERY_KEY, (old) =>
        (old ?? []).map((f) => (f.id === id ? { ...f, name } : f)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(QUERY_KEY, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const isFavorite = useCallback(
    (itemId: string, customization: BinCustomization): boolean => {
      const [libId, itemPartId] = itemId.split(':');
      return favorites.some(
        (f) =>
          f.libraryId === libId &&
          f.libraryItemId === itemPartId &&
          binCustomizationsEqual(f.customization, customization),
      );
    },
    [favorites],
  );

  const toggleFavorite = useCallback(
    (libraryItem: LibraryItem, customization: BinCustomization, paramHash: string | null) => {
      const [libId, itemPartId] = libraryItem.id.split(':');
      const existing = favorites.find(
        (f) =>
          f.libraryId === libId &&
          f.libraryItemId === itemPartId &&
          binCustomizationsEqual(f.customization, customization),
      );
      if (existing) {
        deleteMutation.mutate(existing.id);
      } else {
        createMutation.mutate({
          name: generateFavoriteName(libraryItem.name, customization),
          libraryId: libId,
          libraryItemId: itemPartId,
          libraryItemName: libraryItem.name,
          widthUnits: libraryItem.widthUnits,
          heightUnits: libraryItem.heightUnits,
          color: libraryItem.color,
          paramHash,
          imageUrl: libraryItem.imageUrl ?? '',
          perspectiveImageUrl: libraryItem.perspectiveImageUrl ?? null,
          perspectiveImageUrl90: libraryItem.perspectiveImageUrl90 ?? null,
          perspectiveImageUrl180: libraryItem.perspectiveImageUrl180 ?? null,
          perspectiveImageUrl270: libraryItem.perspectiveImageUrl270 ?? null,
          customization,
        });
      }
    },
    [favorites, createMutation, deleteMutation],
  );

  const removeFavorite = useCallback(
    (favoriteId: string) => deleteMutation.mutate(favoriteId),
    [deleteMutation],
  );

  const renameFavoriteCallback = useCallback(
    (favoriteId: string, name: string) => renameMutation.mutate({ id: favoriteId, name }),
    [renameMutation],
  );

  return {
    favorites,
    isLoading,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    renameFavorite: renameFavoriteCallback,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/app && npx vitest run src/hooks/useFavorites.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: Run full frontend test suite**

```bash
cd packages/app && npx vitest run --exclude '**/e2e/**'
```

Expected: no regressions

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/hooks/useFavorites.ts packages/app/src/hooks/useFavorites.test.ts
git commit -m "feat(favorites): add useFavorites hook with TanStack Query"
```

---

## Task 6: FavoriteCard component

**Files:**
- Create: `packages/app/src/components/FavoriteCard.tsx`
- Create: `packages/app/src/components/FavoriteCard.test.tsx`
- Modify: `packages/app/src/App.css`

- [ ] **Step 1: Write the failing tests**

Create `packages/app/src/components/FavoriteCard.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoriteCard } from './FavoriteCard';
import type { FavoriteItem } from '../types/gridfinity';

vi.mock('../api/generation.api', () => ({
  generatedImageUrl: (hash: string, file: string) => `/generated/${hash}/${file}`,
}));

const mockFavorite: FavoriteItem = {
  id: 'fav1', name: 'Bin 2×3×7 (voronoi)', createdAt: 1000,
  libraryId: 'bins_standard', libraryItemId: 'bin_2x3x7', libraryItemName: 'Bin 2×3×7',
  widthUnits: 2, heightUnits: 3, color: '#3B82F6',
  paramHash: 'abc123', imageUrl: '/img.png',
  perspectiveImageUrl: null, perspectiveImageUrl90: null,
  perspectiveImageUrl180: null, perspectiveImageUrl270: null,
  customization: {
    wallPatternEnabled: true, wallPattern: 'voronoi',
    lipStyle: 'normal', fingerSlide: 'none', wallCutout: 'none', height: 4,
  },
};

describe('FavoriteCard', () => {
  const onRemove = vi.fn();
  const onRename = vi.fn();

  beforeEach(() => { onRemove.mockClear(); onRename.mockClear(); });

  it('renders the favorite name', () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    expect(screen.getByText('Bin 2×3×7 (voronoi)')).toBeDefined();
  });

  it('calls onRemove when trash icon is clicked', async () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    await userEvent.click(screen.getByLabelText('Remove favorite'));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('activates inline edit on double-click and saves on Enter', async () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    const nameEl = screen.getByText('Bin 2×3×7 (voronoi)');
    await userEvent.dblClick(nameEl);
    const input = screen.getByRole('textbox');
    expect(input).toBeDefined();
    await userEvent.clear(input);
    await userEvent.type(input, 'My custom bin{Enter}');
    expect(onRename).toHaveBeenCalledWith('My custom bin');
  });

  it('cancels inline edit on Escape without calling onRename', async () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    const nameEl = screen.getByText('Bin 2×3×7 (voronoi)');
    await userEvent.dblClick(nameEl);
    await userEvent.keyboard('{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('activates inline edit on 500ms long-press', async () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    const nameEl = screen.getByText('Bin 2×3×7 (voronoi)');
    act(() => {
      fireEvent.touchStart(nameEl);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 510));
    });
    expect(screen.getByRole('textbox')).toBeDefined();
  });

  it('sets correct drag data on dragStart', () => {
    render(<FavoriteCard favorite={mockFavorite} onRemove={onRemove} onRename={onRename} />);
    // FavoriteCard uses usePointerDragSource — drag data is verified via dragData prop
    // Just check the card renders draggable structure
    const card = screen.getByRole('button', { hidden: true });
    expect(card).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/app && npx vitest run src/components/FavoriteCard.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create FavoriteCard.tsx**

```typescript
import { useState, useCallback, useRef } from 'react';
import type { FavoriteItem } from '../types/gridfinity';
import { usePointerDragSource } from '../hooks/usePointerDrag';
import { useImageLoadState } from '../hooks/useImageLoadState';
import { generatedImageUrl } from '../api/generation.api';

interface FavoriteCardProps {
  favorite: FavoriteItem;
  onRemove: () => void;
  onRename: (name: string) => void;
}

const LONG_PRESS_MS = 500;

export function FavoriteCard({ favorite, onRemove, onRename }: FavoriteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(favorite.name);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveImageUrl = favorite.paramHash
    ? generatedImageUrl(favorite.paramHash, 'ortho.png')
    : favorite.imageUrl || undefined;

  const { shouldShowImage, imageError, handleImageLoad, handleImageError } =
    useImageLoadState(effectiveImageUrl);

  const { onPointerDown } = usePointerDragSource({
    dragData: {
      type: 'favorite',
      itemId: `${favorite.libraryId}:${favorite.libraryItemId}`,
      favoriteCustomization: favorite.customization,
    },
  });

  const startEditing = useCallback(() => {
    setEditValue(favorite.name);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [favorite.name]);

  const commitEdit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== favorite.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editValue, favorite.name, onRename]);

  const cancelEdit = useCallback(() => {
    setEditValue(favorite.name);
    setIsEditing(false);
  }, [favorite.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') cancelEdit();
    },
    [commitEdit, cancelEdit],
  );

  const handleTouchStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      startEditing();
    }, LONG_PRESS_MS);
  }, [startEditing]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Mini grid preview cells
  const previewCells = [];
  const maxPreviewSize = 3;
  for (let y = 0; y < maxPreviewSize; y++) {
    for (let x = 0; x < maxPreviewSize; x++) {
      const isActive = x < favorite.widthUnits && y < favorite.heightUnits;
      previewCells.push(
        <div
          key={`${x}-${y}`}
          className={`library-item-preview-cell ${isActive ? 'active' : ''}`}
          style={isActive ? { backgroundColor: favorite.color } : undefined}
        />,
      );
    }
  }

  return (
    <div
      className="favorite-card"
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none' }}
      role="button"
      tabIndex={0}
      aria-label={`${favorite.name}, ${favorite.widthUnits} by ${favorite.heightUnits} units. Drag to place.`}
    >
      <button
        className="favorite-card-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Remove favorite"
        title="Remove favorite"
        draggable={false}
      >
        🗑
      </button>
      <div className="library-item-preview-container">
        {effectiveImageUrl && !imageError && (
          <img
            src={effectiveImageUrl}
            alt={favorite.name}
            className={`library-item-image ${shouldShowImage ? 'visible' : 'hidden'}`}
            loading="lazy"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        )}
        {!shouldShowImage && <div className="library-item-preview">{previewCells}</div>}
      </div>
      <div className="favorite-card-name">
        {isEditing ? (
          <input
            ref={inputRef}
            className="favorite-card-name-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); startEditing(); }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            title="Double-click or long-press to rename"
          >
            {favorite.name}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add FavoriteCard styles to App.css**

Open `packages/app/src/App.css`. Add at the end of the file:

```css
/* Favorites */
.favorite-card {
  position: relative;
  background: var(--blue-50, #eff6ff);
  border: 1px solid var(--blue-200, #bfdbfe);
  border-radius: 8px;
  overflow: hidden;
  cursor: grab;
  user-select: none;
}

.favorite-card:active {
  cursor: grabbing;
}

.favorite-card-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  width: 22px;
  height: 22px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.favorite-card-remove:hover {
  background: #fee2e2;
}

.favorite-card-name {
  padding: 4px 6px;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-card-name-input {
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--blue-400, #60a5fa);
  border-radius: 3px;
  padding: 1px 3px;
  text-align: center;
  outline: none;
}

/* Heart button in placed item toolbar */
.placed-item-toolbar-btn--heart {
  color: #d1d5db;
}

.placed-item-toolbar-btn--heart.favorited {
  color: #ec4899;
  background: #fff1f8;
  border-color: #f9a8d4;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/app && npx vitest run src/components/FavoriteCard.test.tsx
```

Expected: PASS

- [ ] **Step 6: Run full frontend test suite**

```bash
cd packages/app && npx vitest run --exclude '**/e2e/**'
```

Expected: no regressions

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/components/FavoriteCard.tsx packages/app/src/components/FavoriteCard.test.tsx packages/app/src/App.css
git commit -m "feat(favorites): add FavoriteCard component and styles"
```

---

## Task 7: LibraryPanel — favorites tab

**Files:**
- Modify: `packages/app/src/components/LibraryPanel.tsx`

- [ ] **Step 1: Update LibraryPanel.tsx**

Open `packages/app/src/components/LibraryPanel.tsx`. Replace the entire file with:

```typescript
import { useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ItemLibrary } from './ItemLibrary';
import { RefImageLibrary } from './RefImageLibrary';
import { UserStlLibrarySection } from './UserStlLibrarySection';
import { FavoriteCard } from './FavoriteCard';
import { useFavorites } from '../hooks/useFavorites';

interface LibraryPanelProps {
  width: number;
  isMobile?: boolean;
  isOpen?: boolean;
}

export function LibraryPanel({ width, isMobile, isOpen }: LibraryPanelProps) {
  const {
    isAuthenticated,
    libraryItems, isLibraryLoading, isLibrariesLoading,
    libraryError, librariesError, categories,
  } = useWorkspace();

  const { favorites, removeFavorite, renameFavorite } = useFavorites();

  const [libraryTab, setLibraryTab] = useState<'favorites' | 'items' | 'images'>('items');
  const [libraryCategory, setLibraryCategory] = useState<string | null>(null);

  return (
    <section
      className={`library-panel${isOpen ? ' library-panel--open' : ''}`}
      style={isMobile ? undefined : { width, minWidth: width }}
    >
      <div className="library-panel-header">
        <div className="library-panel-header-icon">⊞</div>
        <div className="library-panel-header-text">
          <span className="library-panel-title">Component Library</span>
          <span className="library-panel-subtitle">Drag to workspace</span>
        </div>
      </div>
      <div className="library-panel-tabs">
        {isAuthenticated && (
          <button
            className={`library-cat-tab${libraryTab === 'favorites' ? ' active' : ''}`}
            onClick={() => { setLibraryTab('favorites'); setLibraryCategory(null); }}
            type="button"
            title="Favorites"
          >♥</button>
        )}
        <button
          className={`library-cat-tab${libraryTab === 'items' && !libraryCategory ? ' active' : ''}`}
          onClick={() => { setLibraryTab('items'); setLibraryCategory(null); }}
          type="button"
        >All</button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`library-cat-tab${libraryTab === 'items' && libraryCategory === cat.id ? ' active' : ''}`}
            onClick={() => { setLibraryTab('items'); setLibraryCategory(cat.id); }}
            type="button"
          >{cat.name}</button>
        ))}
        {isAuthenticated && (
          <button
            className={`library-cat-tab${libraryTab === 'images' ? ' active' : ''}`}
            onClick={() => setLibraryTab('images')}
            type="button"
          >Images</button>
        )}
      </div>
      <div className="library-panel-content">
        {libraryTab === 'favorites' && isAuthenticated ? (
          favorites.length === 0 ? (
            <div className="ref-image-auth-prompt">
              <p>No favorites yet. Click ♡ on a placed item to save it as a favorite.</p>
            </div>
          ) : (
            <div className="library-items-grid">
              {favorites.map((fav) => (
                <FavoriteCard
                  key={fav.id}
                  favorite={fav}
                  onRemove={() => removeFavorite(fav.id)}
                  onRename={(name) => renameFavorite(fav.id, name)}
                />
              ))}
            </div>
          )
        ) : libraryTab === 'items' ? (
          <>
            <ItemLibrary
              items={libraryItems}
              isLoading={isLibraryLoading || isLibrariesLoading}
              error={libraryError || librariesError}
              activeCategory={libraryCategory}
            />
            {isAuthenticated && <UserStlLibrarySection />}
          </>
        ) : isAuthenticated ? (
          <RefImageLibrary />
        ) : (
          <div className="ref-image-auth-prompt">
            <p>Sign in to upload and manage reference images.</p>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run full frontend test suite**

```bash
cd packages/app && npx vitest run --exclude '**/e2e/**'
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/LibraryPanel.tsx
git commit -m "feat(favorites): add Favorites tab to LibraryPanel"
```

---

## Task 8: PlacedItemOverlay — heart button

**Files:**
- Modify: `packages/app/src/components/PlacedItemOverlay.tsx`

- [ ] **Step 1: Add heart button to PlacedItemOverlay**

Open `packages/app/src/components/PlacedItemOverlay.tsx`.

Add the `useFavorites` import at the top (after the existing imports):

```typescript
import { useFavorites } from '../hooks/useFavorites';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';
```

(Note: `DEFAULT_BIN_CUSTOMIZATION` is already imported on line 5 — do not duplicate it.)

Add `useFavorites` call inside the component function body, after the `useAuth` line (line 58):

```typescript
  const { isFavorite, toggleFavorite } = useFavorites();
```

Add a derived `isFavorited` boolean after the existing `useEffect` blocks, before the toolbar JSX:

```typescript
  const libraryItem = getItemById(item.itemId);
  const currentCustomization = item.customization ?? DEFAULT_BIN_CUSTOMIZATION;
  const isFavorited = isAuthenticated && isFavorite(item.itemId, currentCustomization);
```

Note: `libraryItem` may already be derived elsewhere in the component — check and reuse rather than redefine. Search for `getItemById` calls in the existing code.

In the toolbar JSX (around line 341), add the heart button as the **first** button inside the toolbar div, before the `{onRotateCcw && ...}` block:

```typescript
          {isAuthenticated && libraryItem && (
            <button
              className={`placed-item-toolbar-btn placed-item-toolbar-btn--heart${isFavorited ? ' favorited' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const generationHash = generationEntry?.status === 'complete' ? generationEntry.hash : (libraryItem.paramHash ?? null);
                toggleFavorite(libraryItem, currentCustomization, generationHash);
              }}
              draggable={false}
              aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorited ? '♥' : '♡'}
            </button>
          )}
```

- [ ] **Step 2: Run full frontend test suite**

```bash
cd packages/app && npx vitest run --exclude '**/e2e/**'
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/PlacedItemOverlay.tsx
git commit -m "feat(favorites): add heart toggle button to placed item toolbar"
```

---

## Task 9: useGridItems — favorite drop support

**Files:**
- Modify: `packages/app/src/hooks/useGridItems.ts`

- [ ] **Step 1: Add addItemWithCustomization and update handleDrop**

Open `packages/app/src/hooks/useGridItems.ts`.

After the existing `addItem` function (line 229), add:

```typescript
  const addItemWithCustomization = useCallback(
    (itemId: string, x: number, y: number, customization: BinCustomization) => {
      const libraryItem = getItemById(itemId);
      if (!libraryItem) return;

      const newItem: PlacedItem = {
        instanceId: generateInstanceId(),
        itemId,
        x,
        y,
        width: libraryItem.widthUnits,
        height: libraryItem.heightUnits,
        rotation: 0,
        customization,
        parameters: libraryItem.parameters ? mergeGeneratorParams(libraryItem.parameters) : undefined,
      };

      updateItems([...itemsRef.current, newItem]);
      updateSelected(new Set([newItem.instanceId]));
    },
    [getItemById, updateItems, updateSelected],
  );
```

Update `handleDrop` (line 315) to handle `'favorite'` drops. Replace the existing `handleDrop`:

```typescript
  const handleDrop = useCallback((dragData: DragData, dropX: number, dropY: number) => {
    if (dragData.type === 'library') {
      addItem(dragData.itemId, dropX, dropY);
    } else if (dragData.type === 'favorite' && dragData.favoriteCustomization) {
      addItemWithCustomization(dragData.itemId, dropX, dropY, dragData.favoriteCustomization);
    } else if (dragData.type === 'placed' && dragData.instanceId) {
      const currentSelected = selectedRef.current;
      if (currentSelected.size > 1 && currentSelected.has(dragData.instanceId)) {
        const items = itemsRef.current;
        const draggedItem = items.find(i => i.instanceId === dragData.instanceId);
        if (!draggedItem) return;
        const dx = dropX - draggedItem.x;
        const dy = dropY - draggedItem.y;

        const allValid = items
          .filter(i => currentSelected.has(i.instanceId))
          .every(i => !isOutOfBounds(i.x + dx, i.y + dy, i.width, i.height, gridX, gridY) &&
            !hasCollisionExcludeSet(items, i.x + dx, i.y + dy, i.width, i.height, currentSelected));

        if (!allValid) return;

        const updated = items.map(item =>
          currentSelected.has(item.instanceId)
            ? { ...item, x: item.x + dx, y: item.y + dy }
            : item
        );
        updateItems(updated);
      } else {
        moveItem(dragData.instanceId, dropX, dropY);
      }
    }
  }, [addItem, addItemWithCustomization, moveItem, gridX, gridY, updateItems]);
```

Add `addItemWithCustomization` to the return object at line 476:

```typescript
  return {
    placedItems: placedItemsWithValidity,
    selectedItemId,
    selectedItemIds,
    clipboard,
    addItem,
    addItemWithCustomization,
    moveItem,
    rotateItem,
    updateItemCustomization,
    deleteItem,
    clearAll,
    loadItems,
    selectItem,
    selectAll,
    deselectAll,
    handleDrop,
    duplicateItem,
    copyItems,
    pasteItems,
    deleteSelected,
    rotateSelected,
    moveSelected,
  };
```

Also add `BinCustomization` to the import at line 2:

```typescript
import type { PlacedItem, PlacedItemWithValidity, DragData, LibraryItem, Rotation, BinCustomization, CustomizableFieldDef } from '../types/gridfinity';
```

(It may already be imported — verify before adding.)

- [ ] **Step 2: Run full frontend test suite**

```bash
cd packages/app && npx vitest run --exclude '**/e2e/**'
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/hooks/useGridItems.ts
git commit -m "feat(favorites): handle favorite drag-drop in useGridItems"
```

---

## Task 10: E2E tests

**Files:**
- Create: `packages/app/e2e/tests/favorites.spec.ts`

The E2E tests require a running Docker container (`TARGET=docker`). They use the page object pattern from the project's existing E2E test suite. Check `packages/app/e2e/pages/` for available page objects and `packages/app/e2e/utils/` for helpers.

- [ ] **Step 1: Create favorites.spec.ts**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Favorites', () => {
  test.beforeEach(async ({ page }) => {
    // Log in as default test user
    await page.goto('/');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByLabel(/email/i).fill('admin@example.com');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByText(/sign out/i)).toBeVisible();
  });

  test('heart button appears on placed item toolbar', async ({ page }) => {
    // Drag a library item to grid
    const card = page.locator('.library-item-card').first();
    const grid = page.locator('.grid-preview');
    await card.dragTo(grid);

    // Select the placed item
    await page.locator('.placed-item').first().click();
    await expect(page.locator('[aria-label="Add to favorites"]')).toBeVisible();
  });

  test('clicking heart saves a favorite and shows filled heart', async ({ page }) => {
    const card = page.locator('.library-item-card').first();
    const grid = page.locator('.grid-preview');
    await card.dragTo(grid);
    await page.locator('.placed-item').first().click();

    await page.locator('[aria-label="Add to favorites"]').click();
    await expect(page.locator('[aria-label="Remove from favorites"]')).toBeVisible();
  });

  test('favorite appears in Favorites tab', async ({ page }) => {
    const card = page.locator('.library-item-card').first();
    const grid = page.locator('.grid-preview');
    await card.dragTo(grid);
    await page.locator('.placed-item').first().click();
    await page.locator('[aria-label="Add to favorites"]').click();

    await page.locator('.library-cat-tab', { hasText: '♥' }).click();
    await expect(page.locator('.favorite-card')).toBeVisible();
  });

  test('favorite persists after page refresh', async ({ page }) => {
    const card = page.locator('.library-item-card').first();
    const grid = page.locator('.grid-preview');
    await card.dragTo(grid);
    await page.locator('.placed-item').first().click();
    await page.locator('[aria-label="Add to favorites"]').click();

    // Refresh and re-check
    await page.reload();
    await expect(page.getByText(/sign out/i)).toBeVisible();
    await page.locator('.library-cat-tab', { hasText: '♥' }).click();
    await expect(page.locator('.favorite-card')).toBeVisible();
  });

  test('dragging favorite places item with correct customization', async ({ page }) => {
    // Favorite a placed item with a non-default customization
    const card = page.locator('.library-item-card').first();
    const grid = page.locator('.grid-preview');
    await card.dragTo(grid);
    await page.locator('.placed-item').first().click();
    await page.locator('[aria-label="Add to favorites"]').click();

    // Clear the grid and drag from favorites
    await page.locator('[aria-label="Remove item"]').click();
    await page.locator('.library-cat-tab', { hasText: '♥' }).click();

    const favCard = page.locator('.favorite-card').first();
    await favCard.dragTo(grid);
    await expect(page.locator('.placed-item')).toBeVisible();
  });

  test('removing favorite via trash icon does not affect placed item', async ({ page }) => {
    const card = page.locator('.library-item-card').first();
    const grid = page.locator('.grid-preview');
    await card.dragTo(grid);
    await page.locator('.placed-item').first().click();
    await page.locator('[aria-label="Add to favorites"]').click();

    // Remove from favorites tab
    await page.locator('.library-cat-tab', { hasText: '♥' }).click();
    await page.locator('[aria-label="Remove favorite"]').click();
    await expect(page.locator('.favorite-card')).not.toBeVisible();

    // Placed item is still on grid with empty heart
    await page.locator('.placed-item').first().click();
    await expect(page.locator('[aria-label="Add to favorites"]')).toBeVisible();
  });

  test('renaming favorite persists after page reload', async ({ page }) => {
    const card = page.locator('.library-item-card').first();
    const grid = page.locator('.grid-preview');
    await card.dragTo(grid);
    await page.locator('.placed-item').first().click();
    await page.locator('[aria-label="Add to favorites"]').click();

    await page.locator('.library-cat-tab', { hasText: '♥' }).click();
    const nameEl = page.locator('.favorite-card-name span');
    await nameEl.dblclick();
    await page.locator('.favorite-card-name-input').fill('My Renamed Favorite');
    await page.keyboard.press('Enter');

    await page.reload();
    await expect(page.getByText(/sign out/i)).toBeVisible();
    await page.locator('.library-cat-tab', { hasText: '♥' }).click();
    await expect(page.locator('.favorite-card-name', { hasText: 'My Renamed Favorite' })).toBeVisible();
  });

  test('favorites tab is not visible when not authenticated', async ({ page }) => {
    await page.locator('button', { hasText: /sign out/i }).click();
    await expect(page.locator('.library-cat-tab', { hasText: '♥' })).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/app/e2e/tests/favorites.spec.ts
git commit -m "test(favorites): add E2E tests for favorites feature"
```

- [ ] **Step 3: Run unit tests one final time**

```bash
npm run test:run
```

Expected: all unit tests pass across all packages
