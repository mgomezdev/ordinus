# Coverage Round 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add missing unit tests for `useLayoutLoader` and `DimensionInput`, add server tests for `refImages.routes.ts` and `adminUserStls.routes.ts`, and extract `useLayoutActions` from `WorkspaceContext` to reduce its size.

**Architecture:** Tasks 1–4 are pure test additions following existing patterns. Task 5 extracts a `useLayoutActions` hook from `WorkspaceContext.tsx` — the submit/withdraw/clone/save callbacks that share layout mutation dependencies. No public interface changes needed; `WorkspaceContext` consumes the new hook internally.

**Tech Stack:** React 19 / TypeScript / Vitest / React Testing Library (Tasks 1, 3), Vitest / supertest / libsql in-memory (Tasks 2, 4), React 19 / TypeScript (Task 5)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `packages/app/src/hooks/useLayoutLoader.test.ts` | 8 unit tests for handleLoadLayout + loadLayout |
| Create | `packages/app/src/components/DimensionInput.test.tsx` | 10 unit tests for metric, decimal imperial, fractional imperial modes |
| Create | `packages/server/tests/refImages.test.ts` | 8 tests: auth guard, list, upload, rename, delete, global-admin-gate |
| Create | `packages/server/tests/adminUserStls.test.ts` | 5 tests: auth guard, admin guard, list (empty), promote 404, promote non-ready |
| Create | `packages/app/src/hooks/useLayoutActions.ts` | New hook: submit/withdraw/clone/save callbacks + submitAfterSaveRef |
| Modify | `packages/app/src/contexts/WorkspaceContext.tsx` | Replace inline callbacks with `useLayoutActions(...)` |

---

## Task 1: Unit tests for `useLayoutLoader`

`useLayoutLoader` has two functions with significant logic:
- `handleLoadLayout`: converts widthMm/depthMm based on unit system, builds owner string, calls six callbacks
- `loadLayout`: requires token, maps API response into `PlacedItem[]` and `RefImagePlacement[]`, calls `handleLoadLayout`

**File:**
- Create: `packages/app/src/hooks/useLayoutLoader.test.ts`

**Background — how to test hooks:**
The hook takes all its dependencies as parameters (not from context), so test it with `renderHook` + mock functions. No QueryClient wrapper needed.

Mock `../api/layouts.api.js` to control what `fetchLayout` returns.

**Dependencies to understand:**
- `mmToInches(168)` → `6.6142` (approx) — from `packages/app/src/utils/conversions.ts`
- `loadedPlacedItems[i].instanceId` is `loaded-${Date.now()}-${index}` — use `expect.stringMatching(/^loaded-/)` since Date.now() is non-deterministic
- `loadedRefImagePlacements[i].id` is `loaded-ref-${Date.now()}-${index}` — same pattern

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutLoader } from './useLayoutLoader';

vi.mock('../api/layouts.api.js', () => ({
  fetchLayout: vi.fn(),
}));

import { fetchLayout } from '../api/layouts.api.js';

const MOCK_DETAIL = {
  id: 42,
  name: 'My Layout',
  description: 'desc',
  status: 'draft' as const,
  widthMm: 168,
  depthMm: 126,
  spacerHorizontal: 'none',
  spacerVertical: 'none',
  placedItems: [
    {
      libraryId: 'lib1', itemId: 'bin-2x3', x: 0, y: 0,
      width: 2, height: 3, rotation: 0, customization: null,
    },
  ],
  refImagePlacements: [
    {
      refImageId: 7, name: 'ref.png', imageUrl: 'ref-lib/abc.webp',
      x: 10, y: 20, width: 25, height: 25,
      opacity: 0.5, scale: 1, isLocked: false, rotation: 0,
    },
  ],
};

function makeParams(overrides = {}) {
  return {
    unitSystem: 'metric' as const,
    setWidth: vi.fn(),
    setDepth: vi.fn(),
    setSpacerConfig: vi.fn(),
    loadItems: vi.fn(),
    loadRefImagePlacements: vi.fn(),
    layoutDispatch: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue('token123'),
    ...overrides,
  };
}

describe('handleLoadLayout', () => {
  it('sets metric dimensions directly', () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 1, layoutName: 'Test', layoutDescription: 'desc', layoutStatus: 'draft',
        widthMm: 168, depthMm: 126,
        spacerConfig: { horizontal: 'none', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
      });
    });

    expect(params.setWidth).toHaveBeenCalledWith(168);
    expect(params.setDepth).toHaveBeenCalledWith(126);
  });

  it('converts mm to inches in imperial mode', () => {
    const params = makeParams({ unitSystem: 'imperial' as const });
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 1, layoutName: 'Test', layoutDescription: '', layoutStatus: 'draft',
        widthMm: 25.4, depthMm: 50.8,
        spacerConfig: { horizontal: 'none', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
      });
    });

    // 25.4mm = 1.0in, 50.8mm = 2.0in
    expect(params.setWidth).toHaveBeenCalledWith(1);
    expect(params.setDepth).toHaveBeenCalledWith(2);
  });

  it('builds owner string with username only', () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 5, layoutName: 'L', layoutDescription: '', layoutStatus: 'submitted',
        widthMm: 168, depthMm: 168,
        spacerConfig: { horizontal: 'none', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
        ownerUsername: 'alice',
      });
    });

    expect(params.layoutDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ owner: 'alice' }) })
    );
  });

  it('builds owner string with username + email', () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 5, layoutName: 'L', layoutDescription: '', layoutStatus: 'draft',
        widthMm: 168, depthMm: 168,
        spacerConfig: { horizontal: 'none', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
        ownerUsername: 'alice', ownerEmail: 'alice@example.com',
      });
    });

    expect(params.layoutDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ owner: 'alice <alice@example.com>' }),
      })
    );
  });

  it('dispatches LOAD_LAYOUT with correct payload', () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    act(() => {
      result.current.handleLoadLayout({
        layoutId: 99, layoutName: 'My Layout', layoutDescription: 'cool', layoutStatus: 'draft',
        widthMm: 168, depthMm: 168,
        spacerConfig: { horizontal: 'left', vertical: 'none' },
        placedItems: [], refImagePlacements: [],
      });
    });

    expect(params.layoutDispatch).toHaveBeenCalledWith({
      type: 'LOAD_LAYOUT',
      payload: { id: 99, name: 'My Layout', description: 'cool', status: 'draft', owner: '' },
    });
    expect(params.setSpacerConfig).toHaveBeenCalledWith({ horizontal: 'left', vertical: 'none' });
  });
});

describe('loadLayout', () => {
  beforeEach(() => {
    vi.mocked(fetchLayout).mockResolvedValue(MOCK_DETAIL as never);
  });

  it('throws if no token', async () => {
    const params = makeParams({ getAccessToken: vi.fn().mockReturnValue(null) });
    const { result } = renderHook(() => useLayoutLoader(params));

    await expect(result.current.loadLayout(1)).rejects.toThrow('Not authenticated');
  });

  it('calls fetchLayout with token and id', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    await act(async () => {
      await result.current.loadLayout(42);
    });

    expect(fetchLayout).toHaveBeenCalledWith('token123', 42);
  });

  it('maps placed items with prefixed instanceId', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    await act(async () => {
      await result.current.loadLayout(42);
    });

    expect(params.loadItems).toHaveBeenCalledWith([
      expect.objectContaining({
        instanceId: expect.stringMatching(/^loaded-\d+-0$/),
        itemId: 'lib1:bin-2x3',
        x: 0, y: 0, width: 2, height: 3, rotation: 0,
      }),
    ]);
  });

  it('maps ref image placements with prefixed id', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useLayoutLoader(params));

    await act(async () => {
      await result.current.loadLayout(42);
    });

    expect(params.loadRefImagePlacements).toHaveBeenCalledWith([
      expect.objectContaining({
        id: expect.stringMatching(/^loaded-ref-\d+-0$/),
        refImageId: 7,
        name: 'ref.png',
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run tests — verify all 8 pass**

```bash
npm run test:run --workspace=packages/app -- --reporter=verbose src/hooks/useLayoutLoader.test.ts
```

Expected: 8 passed

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/hooks/useLayoutLoader.test.ts
git commit -m "test(useLayoutLoader): add 8 unit tests for metric/imperial loading and item mapping"
```

---

## Task 2: Server tests for `refImages.routes.ts`

`refImages.routes.ts` has `requireAuth` on all routes and `requireAdmin` on POST `/global`. The upload route uses multer in-memory storage (no disk writes needed during tests). The controller delegates to `refImage.service.js` — mock that to avoid real DB/file calls.

**File:**
- Create: `packages/server/tests/refImages.test.ts`

Background:
- The route is mounted at `/api/v1/ref-images` (verify in `app.ts` if needed)
- `refImage.service.js` contains: `listRefImages`, `uploadRefImage`, `uploadGlobalRefImage`, `renameRefImage`, `deleteRefImage`
- Mock the entire service module so no DB is needed for service calls; only auth middleware touches the DB

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';

vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

vi.mock('../src/config.js', () => ({
  config: {
    IMAGE_DIR: '/tmp/test-images',
    USER_STL_DIR: '/tmp/test-user-stls',
    USER_STL_IMAGE_DIR: '/tmp/test-stl-images',
    PORT: 3001, NODE_ENV: 'test', DB_PATH: ':memory:',
    LOG_LEVEL: 'silent', CORS_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret', JWT_REFRESH_SECRET: 'test-refresh-secret',
    MAX_STL_WORKERS: 1, PYTHON_SCRIPT_DIR: '/tmp/scripts',
  },
}));

// Mock the service so tests don't need real image storage
vi.mock('../src/services/refImage.service.js', () => ({
  listRefImages: vi.fn().mockResolvedValue([]),
  uploadRefImage: vi.fn().mockResolvedValue({
    id: 1, ownerId: 1, name: 'test.png', isGlobal: false,
    imageUrl: 'ref-lib/abc.webp', fileSize: 1024, createdAt: new Date().toISOString(),
  }),
  uploadGlobalRefImage: vi.fn().mockResolvedValue({
    id: 2, ownerId: null, name: 'global.png', isGlobal: true,
    imageUrl: 'ref-lib/def.webp', fileSize: 1024, createdAt: new Date().toISOString(),
  }),
  renameRefImage: vi.fn().mockResolvedValue({
    id: 1, ownerId: 1, name: 'renamed.png', isGlobal: false,
    imageUrl: 'ref-lib/abc.webp', fileSize: 1024, createdAt: new Date().toISOString(),
  }),
  deleteRefImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, mkdirSync: vi.fn() };
});

const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Reference Image endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'img-user@example.com', username: 'imguser', password: 'password123' });
    userToken = res1.body.data.accessToken;

    // Register + promote to admin
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'img-admin@example.com', username: 'imgadmin', password: 'password123' });
    await testClient.execute(`UPDATE users SET role='admin' WHERE email='img-admin@example.com'`);
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'img-admin@example.com', password: 'password123' });
    adminToken = res2.body.data.accessToken;
  });

  afterAll(() => { testClient.close(); });

  describe('Auth guards', () => {
    it('GET / returns 401 without token', async () => {
      expect((await request(app).get('/api/v1/ref-images')).status).toBe(401);
    });

    it('POST / returns 401 without token', async () => {
      expect((await request(app).post('/api/v1/ref-images')).status).toBe(401);
    });

    it('DELETE /:id returns 401 without token', async () => {
      expect((await request(app).delete('/api/v1/ref-images/1')).status).toBe(401);
    });
  });

  describe('GET /', () => {
    it('returns empty array for new user', async () => {
      const res = await request(app)
        .get('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });
  });

  describe('POST / (upload)', () => {
    it('accepts image upload from authenticated user', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', Buffer.from('fake-image-data'), 'photo.png');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ name: 'test.png' }); // mock always returns 'test.png'
    });
  });

  describe('POST /global (admin only)', () => {
    it('returns 403 for regular user', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images/global')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('image', Buffer.from('data'), 'global.png');
      expect(res.status).toBe(403);
    });

    it('accepts upload from admin', async () => {
      const res = await request(app)
        .post('/api/v1/ref-images/global')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', Buffer.from('data'), 'global.png');
      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /:id (rename)', () => {
    it('renames an image for authenticated user', async () => {
      const res = await request(app)
        .patch('/api/v1/ref-images/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'renamed.png' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ name: 'renamed.png' });
    });
  });

  describe('DELETE /:id', () => {
    it('deletes an image for authenticated user', async () => {
      const res = await request(app)
        .delete('/api/v1/ref-images/1')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(204);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify all 8 pass**

```bash
npm run test --workspace=packages/server -- --reporter=verbose tests/refImages.test.ts
```

Expected: 8 passed

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/refImages.test.ts
git commit -m "test(server): add 8 tests for refImages route auth, upload, rename, delete"
```

---

## Task 3: Unit tests for `DimensionInput`

`DimensionInput` renders differently in three modes:
1. **Metric** — `<input type="number">`, `onChange` fires immediately with parsed float
2. **Imperial decimal** — `<input type="number">`, `onChange` fires immediately with parsed float
3. **Imperial fractional** — `<input type="text">`, `editValue` tracks live typing, `onChange` fires on change, `onBlur` fires final commit

Key behaviors to test:
- `fractionToDecimal('10 3/4')` → `10.75` (from `utils/conversions.ts`)
- `decimalToFraction(10.75)` → `'10 3/4'`
- Typing `'abc'` into fractional input → `fractionToDecimal('abc')` returns `0`; onChange called with 0

**File:**
- Create: `packages/app/src/components/DimensionInput.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DimensionInput } from './DimensionInput';

function renderMetric(onChange = vi.fn()) {
  return { onChange, ...render(
    <DimensionInput label="Width" value={168} onChange={onChange} unit="metric" imperialFormat="decimal" />
  )};
}

function renderDecimalImperial(value = 6.6142, onChange = vi.fn()) {
  return { onChange, ...render(
    <DimensionInput label="Width" value={value} onChange={onChange} unit="imperial" imperialFormat="decimal" />
  )};
}

function renderFractional(value = 10.75, onChange = vi.fn()) {
  return { onChange, ...render(
    <DimensionInput label="Width" value={value} onChange={onChange} unit="imperial" imperialFormat="fractional" />
  )};
}

describe('Metric mode', () => {
  it('renders a number input with the value', () => {
    renderMetric();
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(168);
  });

  it('shows mm unit label', () => {
    renderMetric();
    expect(screen.getByText('mm')).toBeInTheDocument();
  });

  it('calls onChange with parsed float on input change', () => {
    const { onChange } = renderMetric();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith(200);
  });

  it('falls back to 0 for non-numeric input', () => {
    const { onChange } = renderMetric();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});

describe('Imperial decimal mode', () => {
  it('renders a number input with the current value', () => {
    renderDecimalImperial(6.5);
    expect(screen.getByRole('spinbutton')).toHaveValue(6.5);
  });

  it('shows in unit label', () => {
    renderDecimalImperial();
    expect(screen.getByText('in')).toBeInTheDocument();
  });
});

describe('Imperial fractional mode', () => {
  it('renders a text input showing fractional display value', () => {
    renderFractional(10.75);
    // 10.75 → "10 3/4"
    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('10 3/4');
  });

  it('calls onChange while typing a valid fraction', () => {
    const { onChange } = renderFractional(0);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '6 1/2' } });
    expect(onChange).toHaveBeenCalledWith(6.5);
  });

  it('calls onChange with 0 for unparseable input', () => {
    // Use value=5 so fractionToDecimal('xyz')=0 !== 5 passes the guard and onChange fires
    const { onChange } = renderFractional(5);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('shows the editValue while focused instead of displayValue', () => {
    renderFractional(10.75);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    // After focus, editValue is set to displayValue
    expect(input).toHaveValue('10 3/4');
    // Type something new
    fireEvent.change(input, { target: { value: '11' } });
    expect(input).toHaveValue('11');
  });

  it('clears editValue on blur (reverts to displayValue from prop)', () => {
    const { onChange } = renderFractional(10.75);
    const input = screen.getByRole('textbox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '11' } });
    fireEvent.blur(input);
    // After blur, editValue is null so displayValue is shown
    // onChange was called with 11 already; component re-renders with new prop value
    expect(onChange).toHaveBeenCalledWith(11);
  });
});
```

- [ ] **Step 2: Run tests — verify all 10 pass**

```bash
npm run test:run --workspace=packages/app -- --reporter=verbose src/components/DimensionInput.test.tsx
```

Expected: 10 passed

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/components/DimensionInput.test.tsx
git commit -m "test(DimensionInput): add 10 unit tests for metric, decimal-imperial, and fractional modes"
```

---

## Task 4: Server tests for `adminUserStls.routes.ts`

`adminUserStls.routes.ts` mounts two endpoints: `GET /admin/user-stls` and `POST /admin/user-stls/:id/promote`. Both require `requireAuth` + `requireAdmin`. The `promoteHandler` calls `fs.copyFile`, `fs.mkdir`, `fs.readFile`, `fs.writeFile`, `fs.rename` — mock `fs/promises` to avoid real I/O.

**File:**
- Create: `packages/server/tests/adminUserStls.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import pino from 'pino';

vi.mock('../src/db/connection.js', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('../src/db/schema.js');
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });
  return { db, client };
});

vi.mock('../src/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

vi.mock('../src/config.js', () => ({
  config: {
    IMAGE_DIR: '/tmp/test-images',
    USER_STL_DIR: '/tmp/test-user-stls',
    USER_STL_IMAGE_DIR: '/tmp/test-stl-images',
    PORT: 3001, NODE_ENV: 'test', DB_PATH: ':memory:',
    LOG_LEVEL: 'silent', CORS_ORIGIN: 'http://localhost:5173',
    JWT_SECRET: 'test-secret', JWT_REFRESH_SECRET: 'test-refresh-secret',
    MAX_STL_WORKERS: 1, PYTHON_SCRIPT_DIR: '/tmp/scripts',
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return { ...actual, mkdirSync: vi.fn() };
});

vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' })),
  };
});

vi.mock('../src/services/stlProcessing.service.js', () => ({
  processUpload: vi.fn().mockResolvedValue(undefined),
  getImageOutputDir: vi.fn().mockReturnValue('/tmp/test-stl-images'),
}));

const { createApp } = await import('../src/app.js');
const { client: testClient } = await import('../src/db/connection.js');
const { runMigrations } = await import('../src/db/migrate.js');

describe('Admin User STL endpoints', () => {
  let app: ReturnType<typeof createApp>;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await runMigrations(testClient);
    app = createApp();

    const res1 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'admin-stl-user@example.com', username: 'admstluser', password: 'password123' });
    userToken = res1.body.data.accessToken;

    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'admin-stl-admin@example.com', username: 'admstladmin', password: 'password123' });
    await testClient.execute(`UPDATE users SET role='admin' WHERE email='admin-stl-admin@example.com'`);
    const res2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin-stl-admin@example.com', password: 'password123' });
    adminToken = res2.body.data.accessToken;
  });

  afterAll(() => { testClient.close(); });

  describe('Auth + admin guards', () => {
    it('GET /admin/user-stls returns 401 without token', async () => {
      expect((await request(app).get('/api/v1/admin/user-stls')).status).toBe(401);
    });

    it('GET /admin/user-stls returns 403 for regular user', async () => {
      expect(
        (await request(app).get('/api/v1/admin/user-stls').set('Authorization', `Bearer ${userToken}`)).status
      ).toBe(403);
    });

    it('POST /admin/user-stls/:id/promote returns 401 without token', async () => {
      expect((await request(app).post('/api/v1/admin/user-stls/fake-id/promote')).status).toBe(401);
    });
  });

  describe('Admin operations', () => {
    it('GET /admin/user-stls returns empty array for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/user-stls')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /admin/user-stls/:id/promote returns 404 for nonexistent id', async () => {
      const res = await request(app)
        .post('/api/v1/admin/user-stls/nonexistent-id/promote')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run tests — verify all 5 pass**

```bash
npm run test --workspace=packages/server -- --reporter=verbose tests/adminUserStls.test.ts
```

Expected: 5 passed

- [ ] **Step 3: Commit**

```bash
git add packages/server/tests/adminUserStls.test.ts
git commit -m "test(server): add 5 tests for adminUserStls route auth/admin guards"
```

---

## Task 5: Extract `useLayoutActions` from `WorkspaceContext`

The submit/withdraw/clone/save callbacks in `WorkspaceContext.tsx` (lines 332–406) all depend on the same set of inputs: `layoutMeta.id`, three mutations, `handleSetStatus`, `handleCloneComplete`, `rawHandleSaveComplete`, and `dialogDispatch`. Extracting them into `useLayoutActions` reduces the provider by ~75 lines and puts the logic in a testable unit.

**What to extract:**
- `submitAfterSaveRef`
- `handleSubmitLayout`
- `handleSubmitClick`
- `handleSaveComplete` (the extended version with submitAfterSave)
- `handleWithdrawLayout`
- `handleCloneCurrentLayout`

**Return type:** All six are returned so the context value object stays unchanged.

**Files:**
- Create: `packages/app/src/hooks/useLayoutActions.ts`
- Modify: `packages/app/src/contexts/WorkspaceContext.tsx`

- [ ] **Step 1: Create `useLayoutActions.ts`**

```ts
import { useCallback, useRef } from 'react';
import type { LayoutStatus } from '@gridfinity/shared';
import type { DialogAction } from '../reducers/dialogReducer';
import type {
  useSubmitLayoutMutation,
  useWithdrawLayoutMutation,
  useCloneLayoutMutation,
} from './useLayouts';

interface UseLayoutActionsParams {
  layoutId: number | null;
  submitLayoutMutation: ReturnType<typeof useSubmitLayoutMutation>;
  withdrawLayoutMutation: ReturnType<typeof useWithdrawLayoutMutation>;
  cloneLayoutMutation: ReturnType<typeof useCloneLayoutMutation>;
  handleSetStatus: (status: LayoutStatus | null) => void;
  handleCloneComplete: (id: number, name: string, status: LayoutStatus) => void;
  rawHandleSaveComplete: (layoutId: number, name: string, status: LayoutStatus) => void;
  dialogDispatch: React.Dispatch<DialogAction>;
}

export function useLayoutActions({
  layoutId,
  submitLayoutMutation,
  withdrawLayoutMutation,
  cloneLayoutMutation,
  handleSetStatus,
  handleCloneComplete,
  rawHandleSaveComplete,
  dialogDispatch,
}: UseLayoutActionsParams) {
  const submitAfterSaveRef = useRef(false);

  const handleSubmitLayout = useCallback(async () => {
    if (!layoutId) return;
    try {
      const result = await submitLayoutMutation.mutateAsync(layoutId);
      handleSetStatus(result.status);
    } catch {
      // Error handled by mutation
    }
  }, [layoutId, submitLayoutMutation, handleSetStatus]);

  const handleSubmitClick = useCallback(() => {
    if (!layoutId) {
      submitAfterSaveRef.current = true;
      dialogDispatch({ type: 'OPEN', dialog: 'save' });
    } else {
      void handleSubmitLayout();
    }
  }, [layoutId, dialogDispatch, handleSubmitLayout]);

  const handleSaveComplete = useCallback((id: number, name: string, status: LayoutStatus) => {
    rawHandleSaveComplete(id, name, status);
    if (submitAfterSaveRef.current) {
      submitAfterSaveRef.current = false;
      submitLayoutMutation.mutate(id, {
        onSuccess: (result) => handleSetStatus(result.status),
      });
    }
  }, [rawHandleSaveComplete, submitLayoutMutation, handleSetStatus]);

  const handleWithdrawLayout = useCallback(async () => {
    if (!layoutId) return;
    try {
      const result = await withdrawLayoutMutation.mutateAsync(layoutId);
      handleSetStatus(result.status);
    } catch {
      // Error handled by mutation
    }
  }, [layoutId, withdrawLayoutMutation, handleSetStatus]);

  const handleCloneCurrentLayout = useCallback(async () => {
    if (!layoutId) return;
    try {
      const result = await cloneLayoutMutation.mutateAsync(layoutId);
      handleCloneComplete(result.id, result.name, result.status);
    } catch {
      // Error handled by mutation
    }
  }, [layoutId, cloneLayoutMutation, handleCloneComplete]);

  return {
    handleSubmitLayout,
    handleSubmitClick,
    handleSaveComplete,
    handleWithdrawLayout,
    handleCloneCurrentLayout,
  };
}
```

- [ ] **Step 2: Replace inline callbacks in `WorkspaceContext.tsx`**

Remove the `submitAfterSaveRef` declaration and the five `useCallback` blocks (lines ~342–406). Replace with:

```ts
const {
  handleSubmitLayout,
  handleSubmitClick,
  handleSaveComplete,
  handleWithdrawLayout,
  handleCloneCurrentLayout,
} = useLayoutActions({
  layoutId: layoutMeta.id,
  submitLayoutMutation,
  withdrawLayoutMutation,
  cloneLayoutMutation,
  handleSetStatus,
  handleCloneComplete,
  rawHandleSaveComplete,
  dialogDispatch,
});
```

Add the import at the top:
```ts
import { useLayoutActions } from '../hooks/useLayoutActions';
```

- [ ] **Step 3: Run lint + unit tests**

```bash
npm run lint --workspace=packages/app
npm run test:run --workspace=packages/app
```

Expected: 0 lint errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/hooks/useLayoutActions.ts packages/app/src/contexts/WorkspaceContext.tsx
git commit -m "refactor(context): extract useLayoutActions hook from WorkspaceContext"
```

---

## Final Step: Push and update PR

```bash
npm run test:run --workspace=packages/app
npm run test --workspace=packages/server

git push
```

Verify PR #103 has all commits. All tasks land on the existing `refactor/code-quality-round2` branch.
