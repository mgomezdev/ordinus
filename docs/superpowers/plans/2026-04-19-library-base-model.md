# Library Base Model & Static STL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow libraries to declare an optional OpenSCAD base model for parametric STL generation, and allow items to declare pre-bundled STL files used directly—skipping generation and hiding customization controls entirely.

**Architecture:** The library `index.json` gains an optional `baseModel` field. The seeder copies `.scad`/`.stl` files to server-accessible data dirs and stores absolute paths in the DB. The generation pipeline splits items into "static" (copy STL) and "generated" (run OpenSCAD with explicit model path) groups. `generate_bin.py` accepts an explicit `--model` argument. Frontend hides the customize gear button for items that have a static STL.

**Tech Stack:** TypeScript, Python, SQLite/Drizzle ORM, React, Vitest, pytest

---

## File Map

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `stlFile: string \| null` to `ApiLibraryItem`; add `libraryId: string` to `BOMItem` |
| `packages/server/src/db/migrate.ts` | Add idempotent `ALTER TABLE` for `base_model_path` and `stl_file` |
| `packages/server/src/db/schema.ts` | Add `baseModelPath` and `stlFile` to Drizzle schema |
| `packages/server/src/db/reseedLibraries.ts` | Copy `.scad`/`.stl` files; store absolute paths in DB |
| `packages/server/src/services/library.service.ts` | Include `stlFile` in `getLibraryItems` SELECT + format |
| `packages/server/tests/libraries.test.ts` | Assert `stlFile` in API responses |
| `packages/server/tests/reseedLibraries.test.ts` | New: assert DB rows have correct paths after reseed |
| `packages/server/src/services/bomGeneration.service.ts` | Add `StaticConfig`, update `UniqueConfig`, remove `extractUniqueConfigs`, add `resolveItemSources`, update pipeline |
| `packages/server/src/services/bomGeneration.service.test.ts` | Replace `extractUniqueConfigs` tests with `resolveItemSources` tests; update `baseConfig` fixture |
| `tools/gridfinity-generator/generate_bin.py` | Add `--model` CLI argument |
| `tools/gridfinity-generator/test_generate_bin.py` | Assert `--model` overrides default SCAD file in command |
| `packages/app/public/libraries/bins_standard/index.json` | Add `baseModel`, remove `stlFile` from items |
| `packages/app/public/libraries/bins_labeled/index.json` | Add `baseModel`, remove `stlFile` from items |
| `packages/app/public/libraries/bins_standard/gridfinity_basic_cup.scad` | Copy from `tools/gridfinity-generator/` |
| `packages/app/public/libraries/bins_labeled/gridfinity_basic_cup.scad` | Copy from `tools/gridfinity-generator/` |
| `packages/app/src/types/gridfinity.ts` | Add `libraryId: string` to `LibraryItem`; add `baseModel?: string` to `LibraryIndex` |
| `packages/app/src/api/adapters/static.adapter.ts` | Map `libraryId` into items |
| `packages/app/src/api/adapters/api.adapter.ts` | Map `libraryId` and `stlFile` from API response |
| `packages/app/src/hooks/useBillOfMaterials.ts` | Include `libraryId` in each `BOMItem` |
| `packages/app/src/hooks/useBillOfMaterials.test.ts` | Assert `libraryId` propagates into `BOMItem` |
| `packages/app/src/components/PlacedItemOverlay.tsx` | Hide customize gear/context menu option when item has `stlFile` |
| `packages/app/src/components/PlacedItemOverlay.test.tsx` | Assert gear hidden for items with `stlFile` |

---

## Task 1: Shared Types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Write failing test**

TypeScript type errors are the failing test. Open `packages/shared/src/types.ts` and verify that `ApiLibraryItem` does NOT have `stlFile` and `BOMItem` does NOT have `libraryId`. Confirm by checking current types before making changes.

Run: `cd packages/shared && npx tsc --noEmit 2>&1 | head -5`
Expected: Clean (no errors yet — confirms current state)

- [ ] **Step 2: Update `ApiLibraryItem`**

In `packages/shared/src/types.ts`, find the `ApiLibraryItem` interface (currently at line ~178) and add `stlFile`:

```typescript
export interface ApiLibraryItem {
  id: string;
  libraryId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  imagePath: string | null;
  perspectiveImagePath: string | null;
  isActive: boolean;
  sortOrder: number;
  categories: string[];
  stlFile: string | null;
}
```

- [ ] **Step 3: Update `BOMItem`**

In the same file, find `BOMItem` (currently at line ~103) and add `libraryId`:

```typescript
export interface BOMItem {
  libraryId: string;
  itemId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  quantity: number;
  customization?: BinCustomization;
  gridfinityExtendedParams?: GeneratorParams;
}
```

- [ ] **Step 4: Verify type compilation**

Run: `cd packages/shared && npx tsc --noEmit 2>&1`
Expected: Clean or only errors from *other packages* that now consume the new required field (those will be fixed in later tasks).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add stlFile to ApiLibraryItem, libraryId to BOMItem"
```

---

## Task 2: DB Migration + Drizzle Schema

**Files:**
- Modify: `packages/server/src/db/migrate.ts`
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/tests/migration.test.ts`

- [ ] **Step 1: Write failing tests**

In `packages/server/tests/migration.test.ts`, add two new `it` blocks inside the existing `describe('DB migrations', ...)`:

```typescript
it('libraries table has base_model_path column', async () => {
  const cols = await client.execute('PRAGMA table_info(libraries)');
  const names = cols.rows.map((r) => (r as Record<string, unknown>).name);
  expect(names).toContain('base_model_path');
});

it('library_items table has stl_file column', async () => {
  const cols = await client.execute('PRAGMA table_info(library_items)');
  const names = cols.rows.map((r) => (r as Record<string, unknown>).name);
  expect(names).toContain('stl_file');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npm test -- --run migration 2>&1 | tail -20`
Expected: FAIL — `base_model_path` and `stl_file` not found in column lists

- [ ] **Step 3: Add migration statements to `migrate.ts`**

In `packages/server/src/db/migrate.ts`, append idempotent ALTER TABLE blocks after the existing `perspective_image_path` migration (around line 38):

```typescript
// Add base_model_path to libraries if missing
try {
  await client.execute(`ALTER TABLE libraries ADD COLUMN base_model_path TEXT;`);
} catch {
  // Column already exists — ignore
}

// Add stl_file to library_items if missing
try {
  await client.execute(`ALTER TABLE library_items ADD COLUMN stl_file TEXT;`);
} catch {
  // Column already exists — ignore
}
```

- [ ] **Step 4: Update Drizzle schema**

In `packages/server/src/db/schema.ts`, add the two new columns to their respective tables:

For `libraries` (after `updatedAt`):
```typescript
export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  baseModelPath: text('base_model_path'),
});
```

For `libraryItems` (after `updatedAt`):
```typescript
export const libraryItems = sqliteTable('library_items', {
  libraryId: text('library_id').notNull().references(() => libraries.id),
  id: text('id').notNull(),
  name: text('name').notNull(),
  widthUnits: integer('width_units').notNull(),
  heightUnits: integer('height_units').notNull(),
  color: text('color').notNull().default('#3B82F6'),
  imagePath: text('image_path'),
  perspectiveImagePath: text('perspective_image_path'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  stlFile: text('stl_file'),
}, (table) => [
  primaryKey({ columns: [table.libraryId, table.id] }),
]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npm test -- --run migration 2>&1 | tail -20`
Expected: PASS — all migration tests including the 2 new ones

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/migrate.ts packages/server/src/db/schema.ts packages/server/tests/migration.test.ts
git commit -m "feat(server): add base_model_path and stl_file columns to DB"
```

---

## Task 3: Seeder — Copy `.scad` and `.stl` Files

**Files:**
- Modify: `packages/server/src/db/reseedLibraries.ts`
- Create: `packages/server/tests/reseedLibraries.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/server/tests/reseedLibraries.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import pino from 'pino';

// Mock node:fs — we verify DB state, not file ops
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((filePath: string) => {
    if (String(filePath).includes('manifest.json')) {
      return JSON.stringify({
        version: '1.0.0',
        libraries: [
          { id: 'test-gen-lib', name: 'Generated Lib', path: '/libraries/test-gen-lib/index.json' },
          { id: 'test-static-lib', name: 'Static Lib', path: '/libraries/test-static-lib/index.json' },
        ],
      });
    }
    if (String(filePath).includes('test-gen-lib')) {
      return JSON.stringify({
        version: '1.0.0',
        baseModel: 'base.scad',
        items: [
          { id: 'item-1', name: 'Item 1', widthUnits: 1, heightUnits: 1, color: '#000', categories: ['bin'] },
        ],
      });
    }
    if (String(filePath).includes('test-static-lib')) {
      return JSON.stringify({
        version: '1.0.0',
        items: [
          { id: 'item-2', name: 'Item 2', widthUnits: 1, heightUnits: 1, color: '#000', categories: ['bin'], stlFile: 'item2.stl' },
        ],
      });
    }
    throw new Error(`Unexpected readFileSync: ${filePath}`);
  }),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
}));

vi.mock('../src/logger.js', async () => {
  const pino = (await import('pino')).default;
  return { logger: pino({ level: 'silent' }) };
});

const { runMigrations } = await import('../src/db/migrate.js');
const { reseedLibraryData } = await import('../src/db/reseedLibraries.js');

describe('reseedLibraryData — base model and static stl', () => {
  let client: Client;
  const logger = pino({ level: 'silent' });

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });
    await runMigrations(client);
    await reseedLibraryData(client, logger);
  });

  afterAll(() => client.close());

  it('stores base_model_path for library with baseModel', async () => {
    const rows = await client.execute(`SELECT base_model_path FROM libraries WHERE id = 'test-gen-lib'`);
    const path = rows.rows[0]?.base_model_path as string | null;
    expect(path).not.toBeNull();
    expect(path).toContain('base.scad');
  });

  it('stores null base_model_path for library without baseModel', async () => {
    const rows = await client.execute(`SELECT base_model_path FROM libraries WHERE id = 'test-static-lib'`);
    const path = rows.rows[0]?.base_model_path as string | null;
    expect(path).toBeNull();
  });

  it('stores stl_file for item with stlFile', async () => {
    const rows = await client.execute(`SELECT stl_file FROM library_items WHERE library_id = 'test-static-lib' AND id = 'item-2'`);
    const stlFile = rows.rows[0]?.stl_file as string | null;
    expect(stlFile).not.toBeNull();
    expect(stlFile).toContain('item2.stl');
  });

  it('stores null stl_file for item without stlFile', async () => {
    const rows = await client.execute(`SELECT stl_file FROM library_items WHERE library_id = 'test-gen-lib' AND id = 'item-1'`);
    const stlFile = rows.rows[0]?.stl_file as string | null;
    expect(stlFile).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npm test -- --run reseedLibraries 2>&1 | tail -20`
Expected: FAIL — `base_model_path` and `stl_file` are null even when they should be set

- [ ] **Step 3: Update interfaces in `reseedLibraries.ts`**

In `packages/server/src/db/reseedLibraries.ts`, update the two interfaces:

```typescript
export interface LibraryItemJson {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  stlFile?: string;              // was already here as comment; now used
  imageUrl?: string;
  perspectiveImageUrl?: string;
}

export interface LibraryIndex {
  version: string;
  baseModel?: string;            // NEW
  customizableFields?: string[];
  gridfinityExtendedParams?: Record<string, unknown>;
  items: LibraryItemJson[];
}
```

- [ ] **Step 4: Add directory setup and baseModel copying in `reseedLibraries.ts`**

After the `mkdirSync(imageDir, ...)` line (around line 61), add:

```typescript
const generatorModelsDir = process.env.GENERATOR_MODELS_DIR ?? resolve(projectRoot, 'packages', 'server', 'data', 'generator-models');
const staticStlsDir = process.env.STATIC_STLS_DIR ?? resolve(projectRoot, 'packages', 'server', 'data', 'static-stls');
mkdirSync(generatorModelsDir, { recursive: true });
mkdirSync(staticStlsDir, { recursive: true });
```

- [ ] **Step 5: Copy baseModel during library insert in `reseedLibraries.ts`**

Inside the `for (let libIdx = 0; ...)` loop, after reading `libIndex`, add base model copying logic before the `INSERT INTO libraries` statement:

```typescript
let baseModelPath: string | null = null;
if (libIndex.baseModel) {
  const srcScad = resolve(libDir, libIndex.baseModel);
  if (existsSync(srcScad)) {
    const destScadDir = resolve(generatorModelsDir, lib.id);
    mkdirSync(destScadDir, { recursive: true });
    const destScad = resolve(destScadDir, libIndex.baseModel);
    copyFileSync(srcScad, destScad);
    baseModelPath = destScad;
    logger.info({ srcScad, destScad }, 'Copied base model');
  } else {
    logger.warn(`Base model not found: ${srcScad}`);
  }
}
```

Then update the library INSERT to include `base_model_path`:

```typescript
await client.execute({
  sql: `INSERT INTO libraries (id, name, description, version, is_active, sort_order, created_at, updated_at, base_model_path)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  args: [lib.id, lib.name, null, libIndex.version, libIdx, now, now, baseModelPath],
});
```

- [ ] **Step 6: Copy stlFile during item insert in `reseedLibraries.ts`**

Inside the `for (let itemIdx = 0; ...)` loop (item processing), after perspective image handling, add stl file copying before the `INSERT INTO library_items` statement:

```typescript
let stlFilePath: string | null = null;
if (item.stlFile) {
  const srcStl = resolve(libDir, item.stlFile);
  if (existsSync(srcStl)) {
    const destStlDir = resolve(staticStlsDir, lib.id);
    mkdirSync(destStlDir, { recursive: true });
    const destStl = resolve(destStlDir, item.stlFile);
    copyFileSync(srcStl, destStl);
    stlFilePath = destStl;
  } else {
    logger.warn(`Static STL not found: ${srcStl}`);
  }
}
```

Update the item INSERT to include `stl_file`:

```typescript
await client.execute({
  sql: `INSERT INTO library_items (library_id, id, name, width_units, height_units, color, image_path, perspective_image_path, is_active, sort_order, created_at, updated_at, stl_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  args: [lib.id, item.id, item.name, item.widthUnits, item.heightUnits, item.color, imagePath, perspectiveImagePath, itemIdx, now, now, stlFilePath],
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/server && npm test -- --run reseedLibraries 2>&1 | tail -20`
Expected: PASS — all 4 new tests

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/db/reseedLibraries.ts packages/server/tests/reseedLibraries.test.ts
git commit -m "feat(server): seeder copies base model and static STL files to data dirs"
```

---

## Task 4: Server Library Service — Expose `stlFile`

**Files:**
- Modify: `packages/server/src/services/library.service.ts`
- Modify: `packages/server/tests/libraries.test.ts`

- [ ] **Step 1: Write failing test**

In `packages/server/tests/libraries.test.ts`, find the existing `beforeAll` `seedTestData` function. The current INSERT for `library_items` does not include `stl_file`. Add a second item with a static STL:

In `seedTestData()`, after the existing item insert, add:

```typescript
await testClient.execute({
  sql: `INSERT INTO library_items (library_id, id, name, width_units, height_units, color, image_path, stl_file, is_active, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  args: ['bins_standard', 'utensil-1x3', 'Utensil 1x3', 1, 3, '#10B981', null, '/data/static-stls/bins_standard/utensil.stl', 1, now, now],
});
```

Then add a test asserting `stlFile` is returned in the API response. Find the existing test `it('GET /libraries/:id/items returns items', ...)` and add a check that items with `stl_file` have `stlFile` in the response, and items without have `stlFile: null`:

```typescript
it('GET /libraries/:id/items includes stlFile', async () => {
  const res = await request(app).get('/api/v1/libraries/bins_standard/items').set('Authorization', `Bearer ${authToken}`);
  expect(res.status).toBe(200);
  const items: Array<{ id: string; stlFile: string | null }> = res.body.data;
  const regularItem = items.find((i) => i.id === 'bin-1x1');
  const staticItem = items.find((i) => i.id === 'utensil-1x3');
  expect(regularItem?.stlFile).toBeNull();
  expect(staticItem?.stlFile).toBe('utensil.stl');
});
```

Note: `stlFile` in the response should be the **filename only** (not the full path), derived via `path.basename`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npm test -- --run libraries 2>&1 | tail -20`
Expected: FAIL — `stlFile` not present in response / response items don't have `stlFile` field

- [ ] **Step 3: Update SELECT in `library.service.ts`**

In `packages/server/src/services/library.service.ts`, in `getLibraryItems`, the Drizzle `select()` calls need to include `stlFile`. Find both SELECT blocks (the one with category join and the one without) and add `stlFile: libraryItems.stlFile` to the select object in both:

```typescript
// In both select blocks, add:
stlFile: libraryItems.stlFile,
```

Example for the non-filtered path:
```typescript
itemRows = await db
  .select({
    id: libraryItems.id,
    libraryId: libraryItems.libraryId,
    name: libraryItems.name,
    widthUnits: libraryItems.widthUnits,
    heightUnits: libraryItems.heightUnits,
    color: libraryItems.color,
    imagePath: libraryItems.imagePath,
    perspectiveImagePath: libraryItems.perspectiveImagePath,
    isActive: libraryItems.isActive,
    sortOrder: libraryItems.sortOrder,
    stlFile: libraryItems.stlFile,
  })
  .from(libraryItems)
  .where(and(...conditions))
  .orderBy(libraryItems.sortOrder);
```

Add the same `stlFile: libraryItems.stlFile` to the category-filtered `selectDistinct` block.

- [ ] **Step 4: Update format function in `library.service.ts`**

Add `path` import at the top if not present: `import path from 'path';`

In the `return itemRows.map((item) => ({...}))` block (around line 167), add `stlFile`:

```typescript
return itemRows.map((item) => ({
  id: item.id,
  libraryId: item.libraryId,
  name: item.name,
  widthUnits: item.widthUnits,
  heightUnits: item.heightUnits,
  color: item.color,
  imagePath: item.imagePath,
  perspectiveImagePath: item.perspectiveImagePath,
  isActive: item.isActive,
  sortOrder: item.sortOrder,
  categories: catMap.get(`${item.libraryId}:${item.id}`) ?? [],
  stlFile: item.stlFile ? path.basename(item.stlFile) : null,
}));
```

Also update `getLibraryItemById` similarly — add `stlFile` to its SELECT and return value.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npm test -- --run libraries 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/library.service.ts packages/server/tests/libraries.test.ts
git commit -m "feat(server): expose stlFile (filename only) in library item API responses"
```

---

## Task 5: Python `generate_bin.py` — Add `--model` Argument

**Files:**
- Modify: `tools/gridfinity-generator/generate_bin.py`
- Modify: `tools/gridfinity-generator/test_generate_bin.py`

- [ ] **Step 1: Write failing test**

In `tools/gridfinity-generator/test_generate_bin.py`, add a new test class:

```python
class TestBuildCommandModel:
    def test_uses_default_scad_file_when_no_model_arg(self):
        from generate_bin import SCAD_FILE
        params = {}
        cmd = build_command(params, 'out.stl')
        assert cmd[1] == SCAD_FILE

    def test_uses_custom_model_when_provided(self):
        params = {}
        cmd = build_command(params, 'out.stl', scad_file='/custom/path/model.scad')
        assert cmd[1] == '/custom/path/model.scad'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/gridfinity-generator && python -m pytest test_generate_bin.py::TestBuildCommandModel -v 2>&1 | tail -20`
Expected: FAIL — `build_command` does not accept `scad_file` parameter

- [ ] **Step 3: Update `build_command` in `generate_bin.py`**

Change the function signature and body to accept an optional `scad_file` parameter:

```python
def build_command(params, output_path, scad_file=None):
    """Build the OpenSCAD CLI command as a list of args."""
    scad = scad_file if scad_file else SCAD_FILE
    cmd = [
        OPENSCAD_PATH,
        scad,
        "--backend", OPENSCAD_BACKEND,
        "--export-format", "binstl",
        "--enable", "textmetrics",
        "-o", output_path,
    ]

    for name, value in params.items():
        if name not in PARAM_REGISTRY:
            print(f"Warning: unknown parameter '{name}', skipping")
            continue
        reg = PARAM_REGISTRY[name]
        if value == reg["default"]:
            continue
        formatted = format_value(value, reg["type"])
        cmd.extend(["-D", f"{name}={formatted}"])

    return cmd
```

- [ ] **Step 4: Add `--model` argument to `main()` and wire it up**

In the `main()` function, add the argument and pass it to `build_command`:

```python
def main():
    parser = argparse.ArgumentParser(description="Generate Gridfinity bin STL from JSON parameters")
    parser.add_argument("params_file", help="JSON file with bin parameters")
    parser.add_argument("--output", "-o", help="Output STL path (default: auto-generated)")
    parser.add_argument("--model", "-m", help="Path to .scad file (overrides SCAD_FILE env var)")
    parser.add_argument("--dry-run", action="store_true", help="Print command without running")
    args = parser.parse_args()

    with open(args.params_file) as f:
        params = json.load(f)

    output_path = args.output or auto_filename(params)
    scad_file = args.model or None

    cmd = build_command(params, output_path, scad_file=scad_file)
    # ... rest of main() unchanged
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd tools/gridfinity-generator && python -m pytest test_generate_bin.py -v 2>&1 | tail -20`
Expected: PASS — all existing tests plus the 2 new `TestBuildCommandModel` tests

- [ ] **Step 6: Commit**

```bash
git add tools/gridfinity-generator/generate_bin.py tools/gridfinity-generator/test_generate_bin.py
git commit -m "feat(generator): add --model argument to generate_bin.py"
```

---

## Task 6: BOM Generation Service — `resolveItemSources` + Updated Pipeline

**Files:**
- Modify: `packages/server/src/services/bomGeneration.service.ts`
- Modify: `packages/server/src/services/bomGeneration.service.test.ts`

Context: `extractUniqueConfigs` is currently exported and tested, but it cannot know the `baseModelPath` for each item (that requires a DB query). We will:
1. Remove `extractUniqueConfigs` as an export (the logic is inlined into `resolveItemSources`)
2. Add `StaticConfig` interface
3. Make `baseModelPath: string` required on `UniqueConfig`
4. Add `resolveItemSources(bomItems)` async function that queries DB and returns `{ staticConfigs, uniqueConfigs }`
5. Update `triggerGeneration` to call `resolveItemSources`
6. Update `runGenerationPipeline` to accept and process `staticConfigs`

- [ ] **Step 1: Write failing tests**

Replace the contents of `packages/server/src/services/bomGeneration.service.test.ts` with:

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { BOMItem } from '@gridfinity/shared';

// Use in-memory DB for resolveItemSources tests
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

const { runMigrations } = await import('../db/migrate.js');
const { client: testClient } = await import('../db/connection.js');
import {
  resolveItemSources,
  formatBomGeneration,
  buildGenerateParams,
} from './bomGeneration.service.js';
import type { UniqueConfig } from './bomGeneration.service.js';

// ── Seed helper ──────────────────────────────────────────────────────────────

async function seedLibrary(id: string, baseModelPath: string | null): Promise<void> {
  const now = new Date().toISOString();
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO libraries (id, name, version, is_active, sort_order, created_at, updated_at, base_model_path)
          VALUES (?, ?, '1.0.0', 1, 0, ?, ?, ?)`,
    args: [id, id, now, now, baseModelPath],
  });
}

async function seedItem(libraryId: string, itemId: string, stlFile: string | null): Promise<void> {
  const now = new Date().toISOString();
  await testClient.execute({
    sql: `INSERT OR IGNORE INTO library_items (library_id, id, name, width_units, height_units, color, is_active, sort_order, created_at, updated_at, stl_file)
          VALUES (?, ?, ?, 1, 1, '#000', 1, 0, ?, ?, ?)`,
    args: [libraryId, itemId, itemId, now, now, stlFile],
  });
}

const BASE_BOM_ITEM: Omit<BOMItem, 'libraryId' | 'itemId'> = {
  name: 'Test Bin',
  widthUnits: 2,
  heightUnits: 3,
  color: '#000',
  categories: [],
  quantity: 1,
};

beforeAll(async () => {
  await runMigrations(testClient);
  await seedLibrary('gen-lib', '/data/models/gen-lib/base.scad');
  await seedLibrary('static-lib', null);
  await seedLibrary('no-model-lib', null);
  await seedItem('gen-lib', 'bin-2x3', null);
  await seedItem('static-lib', 'utensil-1x3', '/data/static-stls/static-lib/utensil.stl');
  await seedItem('no-model-lib', 'unknown-item', null);
});

afterAll(() => testClient.close());

// ── resolveItemSources ───────────────────────────────────────────────────────

describe('resolveItemSources', () => {
  it('item with stl_file in DB goes to staticConfigs', async () => {
    const items: BOMItem[] = [{ ...BASE_BOM_ITEM, libraryId: 'static-lib', itemId: 'utensil-1x3' }];
    const { staticConfigs, uniqueConfigs } = await resolveItemSources(items);
    expect(staticConfigs).toHaveLength(1);
    expect(uniqueConfigs).toHaveLength(0);
    expect(staticConfigs[0].stlSourcePath).toBe('/data/static-stls/static-lib/utensil.stl');
    expect(staticConfigs[0].qty).toBe(1);
  });

  it('item without stl_file but library has base model goes to uniqueConfigs', async () => {
    const items: BOMItem[] = [{ ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3' }];
    const { staticConfigs, uniqueConfigs } = await resolveItemSources(items);
    expect(staticConfigs).toHaveLength(0);
    expect(uniqueConfigs).toHaveLength(1);
    expect(uniqueConfigs[0].baseModelPath).toBe('/data/models/gen-lib/base.scad');
    expect(uniqueConfigs[0].widthUnits).toBe(2);
    expect(uniqueConfigs[0].heightUnits).toBe(3);
  });

  it('mixes static and generated items correctly', async () => {
    const items: BOMItem[] = [
      { ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3' },
      { ...BASE_BOM_ITEM, libraryId: 'static-lib', itemId: 'utensil-1x3' },
    ];
    const { staticConfigs, uniqueConfigs } = await resolveItemSources(items);
    expect(staticConfigs).toHaveLength(1);
    expect(uniqueConfigs).toHaveLength(1);
  });

  it('deduplicates generated items with same dimensions+customization+baseModel', async () => {
    const items: BOMItem[] = [
      { ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3', quantity: 2 },
      { ...BASE_BOM_ITEM, libraryId: 'gen-lib', itemId: 'bin-2x3', quantity: 3 },
    ];
    const { uniqueConfigs } = await resolveItemSources(items);
    expect(uniqueConfigs).toHaveLength(1);
    expect(uniqueConfigs[0].qty).toBe(5);
  });

  it('throws when item has no static STL and library has no base model', async () => {
    const items: BOMItem[] = [{ ...BASE_BOM_ITEM, libraryId: 'no-model-lib', itemId: 'unknown-item' }];
    await expect(resolveItemSources(items)).rejects.toThrow('no base model');
  });
});

// ── formatBomGeneration ──────────────────────────────────────────────────────

describe('formatBomGeneration', () => {
  it('maps layoutId and status correctly', () => {
    const row = {
      id: 1, layoutId: 42, status: 'ready', fileManifest: null,
      threeMfPath: null, generatedAt: null, errorMessage: null,
    };
    const result = formatBomGeneration(row);
    expect(result.layoutId).toBe(42);
    expect(result.status).toBe('ready');
    expect(result.fileManifest).toBeNull();
  });
});

// ── buildGenerateParams ──────────────────────────────────────────────────────

const baseConfig = (overrides: Partial<UniqueConfig['customization']> = {}): UniqueConfig => ({
  widthUnits: 2,
  heightUnits: 3,
  qty: 1,
  filename: 'bin_2x3x8.stl',
  baseModelPath: '/data/models/gen-lib/base.scad',
  customization: {
    wallPattern: 'none',
    lipStyle: 'normal',
    fingerSlide: 'none',
    wallCutout: 'none',
    height: 8,
    ...overrides,
  },
});

describe('buildGenerateParams', () => {
  it('maps dimensions to OpenSCAD array format', () => {
    const params = buildGenerateParams(baseConfig());
    expect(params.width).toEqual([2, 0]);
    expect(params.depth).toEqual([3, 0]);
    expect(params.height).toEqual([8, 0]);
  });

  it('always sets label_style to disabled', () => {
    expect(buildGenerateParams(baseConfig()).label_style).toBe('disabled');
  });

  it('passes lip_style and fingerslide through', () => {
    const params = buildGenerateParams(baseConfig({ lipStyle: 'reduced', fingerSlide: 'rounded' }));
    expect(params.lip_style).toBe('reduced');
    expect(params.fingerslide).toBe('rounded');
  });

  it('does not set wallpattern_enabled when wallPattern is none', () => {
    expect(buildGenerateParams(baseConfig({ wallPattern: 'none' })).wallpattern_enabled).toBeUndefined();
  });

  it('enables wallpattern with style when wallPattern is set', () => {
    const params = buildGenerateParams(baseConfig({ wallPattern: 'hexgrid' }));
    expect(params.wallpattern_enabled).toBe(true);
    expect(params.wallpattern_style).toBe('hexgrid');
  });

  it('sets wallcutout_enabled to false when wallCutout is none', () => {
    expect(buildGenerateParams(baseConfig({ wallCutout: 'none' })).wallcutout_enabled).toBe(false);
  });

  it('sets wallcutout_enabled and vertical walls for vertical cutout', () => {
    const params = buildGenerateParams(baseConfig({ wallCutout: 'vertical' }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([1, 0, 1, 0]);
  });

  it('sets horizontal walls for horizontal cutout', () => {
    const params = buildGenerateParams(baseConfig({ wallCutout: 'horizontal' }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([0, 1, 0, 1]);
  });

  it('sets all walls for both cutout', () => {
    const params = buildGenerateParams(baseConfig({ wallCutout: 'both' }));
    expect(params.wallcutout_enabled).toBe(true);
    expect(params.wallcutout_walls).toEqual([1, 1, 1, 1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npm test -- --run bomGeneration.service 2>&1 | tail -20`
Expected: FAIL — `resolveItemSources` not exported, `UniqueConfig` missing `baseModelPath`, etc.

- [ ] **Step 3: Update `UniqueConfig` interface in `bomGeneration.service.ts`**

Replace the existing `UniqueConfig` interface:

```typescript
export interface UniqueConfig {
  widthUnits: number;
  heightUnits: number;
  customization: BinCustomization;
  qty: number;
  filename: string;
  gridfinityExtendedParams?: GeneratorParams;
  baseModelPath: string;
}
```

Add the new `StaticConfig` interface (just before or after `UniqueConfig`):

```typescript
export interface StaticConfig {
  stlSourcePath: string;
  filename: string;
  qty: number;
}
```

- [ ] **Step 4: Add `resolveItemSources` function in `bomGeneration.service.ts`**

Add after the `UniqueConfig` / `StaticConfig` interface definitions. Add necessary imports at the top: `import { libraries, libraryItems } from '../db/schema.js';` (they may already be imported). Add `and` to the drizzle import if needed.

```typescript
export async function resolveItemSources(bomItems: BOMItem[]): Promise<{
  staticConfigs: StaticConfig[];
  uniqueConfigs: UniqueConfig[];
}> {
  const staticConfigs: StaticConfig[] = [];
  const generatedMap = new Map<string, UniqueConfig>();

  for (const item of bomItems) {
    // Look up item in DB
    const itemRows = await db
      .select({ stlFile: libraryItems.stlFile })
      .from(libraryItems)
      .where(and(eq(libraryItems.libraryId, item.libraryId), eq(libraryItems.id, item.itemId)))
      .limit(1);

    const stlFile = itemRows.length > 0 ? itemRows[0].stlFile : null;

    if (stlFile) {
      // Static item — use pre-bundled STL
      const filename = path.basename(stlFile);
      const existing = staticConfigs.find((s) => s.stlSourcePath === stlFile);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        staticConfigs.push({ stlSourcePath: stlFile, filename, qty: item.quantity });
      }
    } else {
      // Generated item — look up library base model
      const libRows = await db
        .select({ baseModelPath: libraries.baseModelPath })
        .from(libraries)
        .where(eq(libraries.id, item.libraryId))
        .limit(1);

      const baseModelPath = libRows.length > 0 ? libRows[0].baseModelPath : null;
      if (!baseModelPath) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          `Library ${item.libraryId} has no base model and item ${item.itemId} has no static STL`,
        );
      }

      const c = item.customization ?? DEFAULT_CUSTOMIZATION;
      const defaultParams = item.gridfinityExtendedParams ?? {};
      const paramsHash = Object.keys(defaultParams).length > 0 ? hashGeneratorParams(defaultParams) : '';
      const key = `${item.widthUnits}x${item.heightUnits}::${customizationKey(item)}::${paramsHash}::${baseModelPath}`;

      const existing = generatedMap.get(key);
      if (existing) {
        existing.qty += item.quantity;
      } else {
        const filename = buildStlFilename(item.widthUnits, item.heightUnits, c, Object.keys(defaultParams).length > 0 ? defaultParams : undefined);
        generatedMap.set(key, {
          widthUnits: item.widthUnits,
          heightUnits: item.heightUnits,
          customization: c,
          qty: item.quantity,
          filename,
          gridfinityExtendedParams: Object.keys(defaultParams).length > 0 ? defaultParams : undefined,
          baseModelPath,
        });
      }
    }
  }

  return { staticConfigs, uniqueConfigs: Array.from(generatedMap.values()) };
}
```

Also add `libraries` and `libraryItems` to the schema imports at the top of the file if not already there:
```typescript
import { bomGenerations, libraries, libraryItems } from '../db/schema.js';
```

And add `and` to the drizzle import:
```typescript
import { eq, and } from 'drizzle-orm';
```

- [ ] **Step 5: Remove `extractUniqueConfigs` export, update `triggerGeneration`**

Remove (or make private) the `extractUniqueConfigs` function — it is no longer needed as a public API. The deduplication logic is now inside `resolveItemSources`.

Update `triggerGeneration` to call `resolveItemSources`:

```typescript
export async function triggerGeneration(layoutId: number, bomItems: BOMItem[]): Promise<ApiBomGeneration> {
  const { staticConfigs, uniqueConfigs } = await resolveItemSources(bomItems);

  const outDir = path.resolve(config.GENERATED_STL_DIR, `bom-layout-${layoutId}`);
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await db.delete(bomGenerations).where(eq(bomGenerations.layoutId, layoutId));
  const genRows = await db.insert(bomGenerations).values({
    layoutId,
    status: 'generating',
    exportJson: JSON.stringify(bomItems),
  }).returning();

  void runGenerationPipeline(layoutId, staticConfigs, uniqueConfigs, outDir);

  return formatBomGeneration(genRows[0]);
}
```

- [ ] **Step 6: Update `runGenerationPipeline` to handle static configs**

Replace the existing `runGenerationPipeline` signature and body:

```typescript
async function runGenerationPipeline(
  layoutId: number,
  staticConfigs: StaticConfig[],
  uniqueConfigs: UniqueConfig[],
  outDir: string,
): Promise<void> {
  const generatorDir = path.resolve(config.GRIDFINITY_GENERATOR_DIR);
  const generateBinScript = path.join(generatorDir, 'generate_bin.py');
  const bundleScript = path.join(generatorDir, 'bundle_3mf.py');

  try {
    // Step 1: Copy static STLs
    for (const cfg of staticConfigs) {
      await fs.copyFile(cfg.stlSourcePath, path.join(outDir, cfg.filename));
      logger.info({ filename: cfg.filename }, 'Copied static STL');
    }

    // Step 2: Generate parametric STLs
    for (const cfg of uniqueConfigs) {
      const stlPath = path.join(outDir, cfg.filename);
      const paramsPath = path.join(outDir, `params_${cfg.filename.replace('.stl', '')}.json`);

      const params = buildGenerateParams(cfg);
      await fs.writeFile(paramsPath, JSON.stringify(params));
      await runPython([generateBinScript, paramsPath, '--output', stlPath, '--model', cfg.baseModelPath]);
      logger.info({ stlPath }, 'Generated STL');
    }

    // Step 3: Bundle manifest + 3MF
    const manifest: BomGenerationManifestEntry[] = [
      ...staticConfigs.map((cfg) => ({
        filename: cfg.filename,
        widthUnits: 0,
        heightUnits: 0,
        customization: DEFAULT_CUSTOMIZATION,
        qty: cfg.qty,
      })),
      ...uniqueConfigs.map((cfg) => ({
        filename: cfg.filename,
        widthUnits: cfg.widthUnits,
        heightUnits: cfg.heightUnits,
        customization: cfg.customization,
        qty: cfg.qty,
      })),
    ];
    const manifestPath = path.join(outDir, 'manifest.json');
    const threeMfPath = path.join(outDir, `bom-${layoutId}.3mf`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await runPython([bundleScript, manifestPath, outDir, threeMfPath]);

    try {
      await db.update(bomGenerations)
        .set({ status: 'ready', fileManifest: JSON.stringify(manifest), threeMfPath, generatedAt: new Date().toISOString() })
        .where(eq(bomGenerations.layoutId, layoutId));
    } catch (dbErr) {
      logger.error({ layoutId, err: dbErr }, 'Failed to update generation status to ready');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ layoutId, err: msg }, 'BOM generation failed');
    await db.update(bomGenerations)
      .set({ status: 'error', errorMessage: msg })
      .where(eq(bomGenerations.layoutId, layoutId));
  }
}
```

Note: For static items in the manifest, the widthUnits/heightUnits/customization values are placeholders — the `bundle_3mf.py` script only needs `filename` and `qty`. If `bundle_3mf.py` requires valid dimensions, pass `cfg.widthUnits` from `StaticConfig` instead. Check `bundle_3mf.py` behavior — if it only uses `filename` and `qty`, the zeroes are fine. If not, add `widthUnits` and `heightUnits` to `StaticConfig`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/server && npm test -- --run bomGeneration.service 2>&1 | tail -20`
Expected: PASS — all `resolveItemSources`, `formatBomGeneration`, and `buildGenerateParams` tests

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/services/bomGeneration.service.ts packages/server/src/services/bomGeneration.service.test.ts
git commit -m "feat(server): resolveItemSources splits BOM into static/generated, update generation pipeline"
```

---

## Task 7: Library JSON Content + Copy SCAD File

**Files:**
- Modify: `packages/app/public/libraries/bins_standard/index.json`
- Modify: `packages/app/public/libraries/bins_labeled/index.json`
- Create: `packages/app/public/libraries/bins_standard/gridfinity_basic_cup.scad` (copy)
- Create: `packages/app/public/libraries/bins_labeled/gridfinity_basic_cup.scad` (copy)

No tests — these are data files. Verification is done visually/manually.

- [ ] **Step 1: Copy the SCAD file to both library directories**

```bash
cp tools/gridfinity-generator/gridfinity_basic_cup.scad packages/app/public/libraries/bins_standard/gridfinity_basic_cup.scad
cp tools/gridfinity-generator/gridfinity_basic_cup.scad packages/app/public/libraries/bins_labeled/gridfinity_basic_cup.scad
```

- [ ] **Step 2: Update `bins_standard/index.json`**

Add `"baseModel": "gridfinity_basic_cup.scad"` at the top level and remove `stlFile` from every item. The file currently has `customizableFields` and `items`. After changes it should look like:

```json
{
  "version": "1.0.0",
  "baseModel": "gridfinity_basic_cup.scad",
  "customizableFields": ["lipStyle", "wallPattern", "fingerSlide", "wallCutout"],
  "items": [
    {
      "id": "bin-1x1",
      "name": "1x1 bin_",
      "widthUnits": 1,
      "heightUnits": 1,
      "color": "#3B82F6",
      "categories": ["bin"],
      "imageUrl": "bin_1x1.png",
      "perspectiveImageUrl": "bin_1x1-perspective.png"
    }
  ]
}
```

Remove `"stlFile": "bin_1x1.stl"` (and all other `stlFile` fields) from every item.

- [ ] **Step 3: Update `bins_labeled/index.json`**

Same as step 2 — add `"baseModel": "gridfinity_basic_cup.scad"` at the library level, remove `stlFile` from all items.

- [ ] **Step 4: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/app/public/libraries/bins_standard/index.json', 'utf-8')); console.log('OK')" 2>&1`
Expected: `OK`

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/app/public/libraries/bins_labeled/index.json', 'utf-8')); console.log('OK')" 2>&1`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add packages/app/public/libraries/bins_standard/ packages/app/public/libraries/bins_labeled/
git commit -m "feat(libraries): add baseModel to bins libraries, remove pre-bundled STL refs"
```

---

## Task 8: Frontend `LibraryItem` Type + Adapters

**Files:**
- Modify: `packages/app/src/types/gridfinity.ts`
- Modify: `packages/app/src/api/adapters/static.adapter.ts`
- Modify: `packages/app/src/api/adapters/api.adapter.ts`

- [ ] **Step 1: Write failing tests**

The failing "test" here is TypeScript errors. After adding `libraryId: string` to `LibraryItem`, any `LibraryItem` literal without `libraryId` will fail compilation. Run to confirm current state compiles:

Run: `cd packages/app && npx tsc --noEmit 2>&1 | grep -c "error" || echo "0"`
Expected: small number (should be 0 or few pre-existing)

- [ ] **Step 2: Update `LibraryItem` in `gridfinity.ts`**

Add `libraryId: string` to `LibraryItem` (around line 48):

```typescript
export interface LibraryItem {
  id: string;
  libraryId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  stlFile?: string;
  imageUrl?: string;
  perspectiveImageUrl?: string;
  price?: number;
  gridfinityExtendedParams?: GeneratorParams;
}
```

Also update `LibraryIndex` (around line 188) to include `baseModel`:

```typescript
export interface LibraryIndex {
  version: string;
  items: LibraryItem[];
  customizableFields?: CustomizableField[];
  gridfinityExtendedParams?: GeneratorParams;
  baseModel?: string;
}
```

- [ ] **Step 3: Update `StaticAdapter.getLibraryItems` to include `libraryId`**

In `packages/app/src/api/adapters/static.adapter.ts`, in the `getLibraryItems` method, add `libraryId` to the mapped items:

```typescript
async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
  const manifest = await this.fetchManifest();
  const lib = manifest.libraries.find((l) => l.id === libraryId);
  if (!lib) return [];

  const response = await fetch(lib.path);
  if (!response.ok) throw new Error(`Failed to fetch library ${libraryId}`);
  const data: LibraryIndex = await response.json();
  const libraryDefaults = data.gridfinityExtendedParams ?? {};

  return (data.items ?? []).map((item) => ({
    ...item,
    libraryId,
    gridfinityExtendedParams: mergeGeneratorParams(libraryDefaults, item.gridfinityExtendedParams),
  }));
}
```

- [ ] **Step 4: Update `ApiAdapter.getLibraryItems` to include `libraryId` and `stlFile`**

In `packages/app/src/api/adapters/api.adapter.ts`, in `getLibraryItems`:

```typescript
async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
  const response = await fetch(`${this.baseUrl}/libraries/${libraryId}/items`);
  if (!response.ok) throw new Error(`Failed to fetch items for ${libraryId}`);
  const json = await response.json();

  const meta = await this.getLibraryMeta(libraryId);
  const libraryDefaults = meta.gridfinityExtendedParams;

  return json.data.map((item: Record<string, unknown>) => ({
    id: item.id as string,
    libraryId: item.libraryId as string,
    name: item.name as string,
    widthUnits: item.widthUnits as number,
    heightUnits: item.heightUnits as number,
    color: item.color as string,
    categories: item.categories as string[],
    stlFile: (item.stlFile as string | null) ?? undefined,
    imageUrl: item.imagePath as string | undefined,
    perspectiveImageUrl: item.perspectiveImagePath as string | undefined,
    gridfinityExtendedParams: mergeGeneratorParams(
      libraryDefaults,
      (item.gridfinityExtendedParams as Record<string, unknown> | undefined)
    ),
  }));
}
```

- [ ] **Step 5: Fix any remaining TypeScript errors in existing fixtures/tests**

Run: `cd packages/app && npx tsc --noEmit 2>&1 | head -40`

Any `LibraryItem` literal that's missing `libraryId` will error. Fix them in test files by adding `libraryId: 'test-lib'` (or the appropriate value). Common locations:
- `packages/app/src/hooks/useBillOfMaterials.test.ts` — `mockLibraryItems`
- `packages/app/src/components/PlacedItemOverlay.test.tsx` — `mockGetItemById` items

Update each literal: add `libraryId: 'bins_standard'` (or a fitting test library ID).

- [ ] **Step 6: Run unit tests**

Run: `cd packages/app && npm test -- --run 2>&1 | tail -10`
Expected: PASS (except tests that depend on `libraryId` being propagated into BOMItem — those will be fixed in Task 9)

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/types/gridfinity.ts packages/app/src/api/adapters/static.adapter.ts packages/app/src/api/adapters/api.adapter.ts
git commit -m "feat(app): add libraryId to LibraryItem type, propagate from both adapters"
```

---

## Task 9: `useBillOfMaterials` — Include `libraryId` in BOMItem

**Files:**
- Modify: `packages/app/src/hooks/useBillOfMaterials.ts`
- Modify: `packages/app/src/hooks/useBillOfMaterials.test.ts`

- [ ] **Step 1: Write failing test**

In `packages/app/src/hooks/useBillOfMaterials.test.ts`, find `mockLibraryItems`. Update it to add `libraryId` to each item (required by the type change from Task 8):

```typescript
const mockLibraryItems: LibraryItem[] = [
  { id: 'bin-1x1', libraryId: 'bins_standard', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#646cff', categories: ['bin'] },
  { id: 'bin-1x2', libraryId: 'bins_standard', name: '1x2 Bin', widthUnits: 1, heightUnits: 2, color: '#646cff', categories: ['bin'] },
  { id: 'bin-2x1', libraryId: 'bins_standard', name: '2x1 Bin', widthUnits: 2, heightUnits: 1, color: '#646cff', categories: ['bin'] },
  { id: 'bin-2x2', libraryId: 'bins_standard', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#646cff', categories: ['bin'] },
  { id: 'divider-1x1', libraryId: 'dividers', name: '1x1 Divider', widthUnits: 1, heightUnits: 1, color: '#22c55e', categories: ['divider'] },
  { id: 'organizer-1x3', libraryId: 'organizers', name: '1x3 Organizer', widthUnits: 1, heightUnits: 3, color: '#f59e0b', categories: ['organizer'] },
];
```

Then add a new test asserting `libraryId` propagates:

```typescript
it('includes libraryId from LibraryItem in BOMItem', () => {
  const placed: PlacedItem[] = [
    { instanceId: 'i1', itemId: 'bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  ];
  const { result } = renderHook(() => useBillOfMaterials(placed, mockLibraryItems));
  expect(result.current).toHaveLength(1);
  expect(result.current[0].libraryId).toBe('bins_standard');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npm test -- --run useBillOfMaterials 2>&1 | tail -20`
Expected: FAIL — `result.current[0].libraryId` is undefined

- [ ] **Step 3: Update `useBillOfMaterials.ts`**

In `packages/app/src/hooks/useBillOfMaterials.ts`, add `libraryId` to the pushed item:

```typescript
bomItems.push({
  libraryId: libraryItem.libraryId,
  itemId: libraryItem.id,
  name: libraryItem.name,
  widthUnits: libraryItem.widthUnits,
  heightUnits: libraryItem.heightUnits,
  color: libraryItem.color,
  categories: libraryItem.categories,
  quantity: count,
  customization,
  ...(libraryItem.price !== undefined ? { price: libraryItem.price } : {}),
  ...(libraryItem.gridfinityExtendedParams && Object.keys(libraryItem.gridfinityExtendedParams).length > 0
    ? { gridfinityExtendedParams: libraryItem.gridfinityExtendedParams }
    : {}),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/app && npm test -- --run useBillOfMaterials 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/hooks/useBillOfMaterials.ts packages/app/src/hooks/useBillOfMaterials.test.ts
git commit -m "feat(app): propagate libraryId into BOMItem from useBillOfMaterials"
```

---

## Task 10: `PlacedItemOverlay` — Hide Customize Controls for Static STL Items

**Files:**
- Modify: `packages/app/src/components/PlacedItemOverlay.tsx`
- Modify: `packages/app/src/components/PlacedItemOverlay.test.tsx`

Context: `PlacedItemOverlay` has a gear button (line ~305) that opens the customization popover. When the placed item's `LibraryItem` has `stlFile` set, this button must not appear (and the context menu's "Customize" option must also be suppressed).

- [ ] **Step 1: Write failing test**

In `packages/app/src/components/PlacedItemOverlay.test.tsx`:

First, update `mockGetItemById` to include `libraryId` on all items and add a static-STL item:

```typescript
const mockGetItemById = (id: string): LibraryItem | undefined => {
  const items: Record<string, LibraryItem> = {
    'bin-1x1': { id: 'bin-1x1', libraryId: 'bins_standard', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#3B82F6', categories: ['bin'] },
    'bin-2x2': { id: 'bin-2x2', libraryId: 'bins_standard', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#3B82F6', categories: ['bin'] },
    'utensil-1x3': { id: 'utensil-1x3', libraryId: 'simple-utensils', name: '1x3 Utensils', widthUnits: 1, heightUnits: 3, color: '#10B981', categories: ['utensil'], stlFile: 'Utensils 1x3.stl' },
    'testlib:bin-1x1': { id: 'testlib:bin-1x1', libraryId: 'testlib', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#3B82F6', categories: ['bin'] },
    'testlib:bin-2x2': { id: 'testlib:bin-2x2', libraryId: 'testlib', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#3B82F6', categories: ['bin'] },
  };
  return items[id];
};
```

Then add a new test:

```typescript
it('does not show customize gear button when item has stlFile', async () => {
  const item: PlacedItemWithValidity = {
    instanceId: 'test-utensil',
    itemId: 'utensil-1x3',
    x: 0, y: 0, width: 1, height: 3, rotation: 0, isValid: true,
  };

  render(
    <PlacedItemOverlay
      item={item}
      gridX={4}
      gridY={4}
      isSelected={true}
      onSelect={mockOnSelect}
      getItemById={mockGetItemById}
      onCustomizationChange={vi.fn()}
      getLibraryMeta={mockGetLibraryMeta}
    />
  );

  expect(screen.queryByTitle('Customize bin options')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/app && npm test -- --run PlacedItemOverlay 2>&1 | tail -20`
Expected: FAIL — gear button IS rendered even for the utensil item with `stlFile`

- [ ] **Step 3: Update `PlacedItemOverlay.tsx` to check `stlFile`**

In `packages/app/src/components/PlacedItemOverlay.tsx`:

After the `const [libraryMeta, setLibraryMeta] = useState<LibraryMeta>(...)` line (around line 49), add:

```typescript
const libraryItem = getItemById(item.itemId);
const hasStaticStl = !!libraryItem?.stlFile;
```

Then find the gear button render (around line 305):

```typescript
{onCustomizationChange && libraryMeta.customizableFields.length > 0 && (
```

Change it to:

```typescript
{onCustomizationChange && libraryMeta.customizableFields.length > 0 && !hasStaticStl && (
```

Also find the `BinContextMenu` render (around line 363) and conditionally suppress `onCustomize`:

```tsx
<BinContextMenu
  x={effectiveContextMenuPos.x}
  y={effectiveContextMenuPos.y}
  onRotateCw={() => onRotateCw?.(item.instanceId)}
  onRotateCcw={() => onRotateCcw?.(item.instanceId)}
  onDuplicate={() => onDuplicate?.()}
  onCustomize={hasStaticStl ? undefined : () => { computePopoverPos(); setShowPopover(true); }}
  onDelete={() => onDelete?.(item.instanceId)}
  onClose={handleCloseContextMenu}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/app && npm test -- --run PlacedItemOverlay 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Run full frontend test suite**

Run: `cd packages/app && npm test -- --run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/PlacedItemOverlay.tsx packages/app/src/components/PlacedItemOverlay.test.tsx
git commit -m "feat(app): hide customize controls for items with static STL files"
```

---

## Task 11: Lint + Full Test Suite

**Files:** None created — verification only

- [ ] **Step 1: Run lint**

Run from repo root: `npm run lint 2>&1 | tail -20`
Expected: No errors. Fix any errors before proceeding.

- [ ] **Step 2: Run full server test suite**

Run: `cd packages/server && npm test -- --run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 3: Run full frontend test suite**

Run: `cd packages/app && npm test -- --run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 4: Run Python tests**

Run: `cd tools/gridfinity-generator && python -m pytest -v 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "fix(lint): resolve any linting issues from feature implementation"
```

(Skip this step if there are no lint fixes needed.)

---

## Task 12: Docker Rebuild + Deploy

- [ ] **Step 1: Tear down existing containers**

Run from `infra/` directory: `docker compose down`

- [ ] **Step 2: Rebuild images with no cache**

Run: `docker compose build --no-cache 2>&1 | tail -30`
Expected: Both `frontend` and `backend` images build successfully

- [ ] **Step 3: Start containers**

Run: `docker compose up -d`
Expected: Both containers start healthy

- [ ] **Step 4: Verify containers are healthy**

Run: `docker compose ps`
Expected: Both `infra-frontend-1` and `infra-backend-1` show `healthy` status

- [ ] **Step 5: Smoke-test manually at localhost:32888**

Check:
- Utensil/modular library items: no gear icon (⚙) on placed items
- Bins/labeled-bins library items: gear icon appears, customization works
- BOM page: Generate button works, generation runs (even if OpenSCAD not present in Docker, it should show an error state, not crash)
- No TypeScript console errors in browser dev tools
