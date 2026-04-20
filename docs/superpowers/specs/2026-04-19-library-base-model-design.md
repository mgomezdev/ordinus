# Library Base Model & Static STL Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow libraries to declare an optional OpenSCAD base model for parametric generation, and allow items to declare a pre-bundled STL that is used directly (skipping generation). Items with static STLs have customization hidden entirely.

**Architecture:** The library `index.json` gains an optional `baseModel` filename pointing to a `.scad` file in the same directory. Items retain their existing optional `stlFile` field. The seeder copies `.scad` and `.stl` files to server-accessible directories at seed time and stores absolute paths in the DB. The generation pipeline splits items into "static" (copy STL) and "generated" (run OpenSCAD with explicit model path) groups. The Python script accepts an explicit `--model` argument.

**Tech Stack:** TypeScript (server + shared), Python (generate_bin.py), SQLite/Drizzle ORM, React (frontend)

---

## Precedence Rules

1. Item has `stlFile` → use pre-bundled STL, skip generation, hide customization UI
2. Item has no `stlFile` AND library has `baseModel` → generate via OpenSCAD with that model
3. Item has no `stlFile` AND library has no `baseModel` → generation error

## Library JSON Format

### Library-level additions (`index.json`)

```json
{
  "version": "1.0.0",
  "baseModel": "gridfinity_basic_cup.scad",
  "customizableFields": ["lipStyle", "wallPattern", "fingerSlide", "wallCutout"],
  "items": [...]
}
```

`baseModel` is optional. When present, it is a filename (not a path) of a `.scad` file located in the same directory as `index.json`.

### Item-level (no change to schema)

Items already have `stlFile?: string`. No new fields on items.

### Content migrations

- `bins_standard/index.json`: add `"baseModel": "gridfinity_basic_cup.scad"`, remove `stlFile` from all items
- `bins_labeled/index.json`: same
- Copy `tools/gridfinity-generator/gridfinity_basic_cup.scad` into `packages/app/public/libraries/bins_standard/` and `packages/app/public/libraries/bins_labeled/`
- All other libraries (simple-utensils, modular-utensil, shadowbox): unchanged — keep existing `stlFile` on items, no `baseModel`

---

## Database Schema

### `libraries` table — add column

```sql
ALTER TABLE libraries ADD COLUMN base_model_path TEXT;
```

`base_model_path`: absolute server-side filesystem path to the copied `.scad` file. Null if the library has no base model.

### `library_items` table — add column

```sql
ALTER TABLE library_items ADD COLUMN stl_file TEXT;
```

`stl_file`: absolute server-side filesystem path to the copied pre-bundled `.stl` file. Null if the item should be generated.

### Migration

Idempotent: probe for the column with `SELECT base_model_path FROM libraries LIMIT 1`, add it if missing. Same for `stl_file` on `library_items`.

---

## Seeder Changes (`reseedLibraries.ts`)

### New interfaces

```typescript
export interface LibraryIndex {
  version: string;
  baseModel?: string;           // NEW
  customizableFields?: string[];
  gridfinityExtendedParams?: Record<string, unknown>;
  items: LibraryItemJson[];
}

export interface LibraryItemJson {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  stlFile?: string;             // NEW (was ignored before)
  imageUrl?: string;
  perspectiveImageUrl?: string;
}
```

### New seeding logic

**For each library with `baseModel`:**
- Source: `LIBRARIES_DIR/{libId}/{baseModel}`
- Destination: `SERVER_DATA_DIR/generator-models/{libId}/{baseModel}`
- Store absolute destination path in `libraries.base_model_path`

**For each item with `stlFile`:**
- Source: `LIBRARIES_DIR/{libId}/{stlFile}`
- Destination: `SERVER_DATA_DIR/static-stls/{libId}/{stlFile}`
- Store absolute destination path in `library_items.stl_file`

The `SERVER_DATA_DIR` is the same directory already used for images (`config.IMAGE_DIR` parent, or a peer directory). Both `generator-models/` and `static-stls/` subdirectories are created with `mkdirSync(..., { recursive: true })`.

### Library insert

```typescript
await client.execute({
  sql: `INSERT INTO libraries (..., base_model_path) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  args: [..., baseModelPath],  // null if no baseModel
});
```

### Item insert

```typescript
await client.execute({
  sql: `INSERT INTO library_items (..., stl_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  args: [..., stlFilePath],  // null if no stlFile
});
```

---

## Shared Types (`packages/shared/src/types.ts`)

### `ApiLibraryItem`

Add `stlFile: string | null`:

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
  stlFile: string | null;   // NEW: filename only (not full path), null if generated
}
```

Note: `stlFile` exposed to frontend is the **filename only** (e.g., `"Utensils 1x3.stl"`), not the server's absolute path.

### `BOMItem`

Add `libraryId: string`:

```typescript
export interface BOMItem {
  libraryId: string;          // NEW
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

---

## Frontend Changes

### `LibraryItem` type (`packages/app/src/types/gridfinity.ts`)

Add `libraryId: string`:

```typescript
export interface LibraryItem {
  id: string;
  libraryId: string;     // NEW
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

### API Adapter (`ApiAdapter`)

Map `ApiLibraryItem.stlFile` → `LibraryItem.stlFile` (already a string on the item, just pass the filename through). Map `ApiLibraryItem.libraryId` → `LibraryItem.libraryId`.

### Static Adapter (`StaticAdapter`)

Already reads `stlFile` from JSON. Add `libraryId` from context (the library being processed).

### `useBillOfMaterials` hook

Include `libraryId` and `stlFile` from `LibraryItem` when building `BOMItem`:

```typescript
bomItems.push({
  libraryId: libraryItem.libraryId,   // NEW
  itemId: libraryItem.id,
  ...
});
```

### Customization panel / placed item editor

Wherever the customization controls (wallPattern, lipStyle, fingerSlide, wallCutout, height) are rendered for a placed item, check `libraryItem.stlFile`:

```typescript
if (libraryItem.stlFile) return null; // hide entire customization section
```

The component receiving this check already has access to `libraryItem` via `libraryItems` from context. The check happens in the customization panel component (likely `BinCustomizationPanel` or equivalent).

---

## Server: Library Service (`library.service.ts`)

### `formatLibraryItem`

Include `stlFile` (filename only, derived from the stored absolute path using `path.basename`):

```typescript
stlFile: row.stlFile ? path.basename(row.stlFile) : null,
```

---

## Server: Generation Pipeline (`bomGeneration.service.ts`)

### New `StaticConfig` interface

```typescript
export interface StaticConfig {
  stlSourcePath: string;   // absolute path to pre-bundled STL
  filename: string;         // filename to use in outDir
  qty: number;
}
```

### Updated `UniqueConfig`

```typescript
export interface UniqueConfig {
  widthUnits: number;
  heightUnits: number;
  customization: BinCustomization;
  qty: number;
  filename: string;
  gridfinityExtendedParams?: GeneratorParams;
  baseModelPath: string;   // CHANGED: now required (not optional)
}
```

### New function: `resolveItemSources`

```typescript
export async function resolveItemSources(bomItems: BOMItem[]): Promise<{
  staticConfigs: StaticConfig[];
  uniqueConfigs: UniqueConfig[];
}>
```

For each `BOMItem`:
1. Query `library_items` by `(libraryId, itemId)` → get `stl_file`
2. If `stl_file` is set → add to `staticConfigs`
3. If `stl_file` is null → query `libraries` by `libraryId` → get `base_model_path`
4. If `base_model_path` is null → throw error: `"Library {libraryId} has no base model and item {itemId} has no static STL"`
5. Group into `UniqueConfig` (deduplication key includes `baseModelPath`)

The deduplication key for generated items:
```
`${widthUnits}x${heightUnits}::${customizationKey}::${paramsHash}::${baseModelPath}`
```

### Updated `runGenerationPipeline`

```typescript
async function runGenerationPipeline(
  layoutId: number,
  staticConfigs: StaticConfig[],
  uniqueConfigs: UniqueConfig[],
  outDir: string,
): Promise<void>
```

Step 1 — copy static STLs:
```typescript
for (const cfg of staticConfigs) {
  await fs.copyFile(cfg.stlSourcePath, path.join(outDir, cfg.filename));
}
```

Step 2 — generate parametric STLs (same as before, but with explicit `--model` arg):
```typescript
await runPython([generateBinScript, paramsPath, '--output', stlPath, '--model', cfg.baseModelPath]);
```

Step 3 — build manifest from both static and generated configs, then bundle 3MF (unchanged).

### Updated `triggerGeneration`

```typescript
export async function triggerGeneration(layoutId: number, bomItems: BOMItem[]): Promise<ApiBomGeneration> {
  const { staticConfigs, uniqueConfigs } = await resolveItemSources(bomItems);
  // ... rest unchanged
  void runGenerationPipeline(layoutId, staticConfigs, uniqueConfigs, outDir);
}
```

---

## Python: `generate_bin.py`

Add `--model` CLI argument:

```python
parser.add_argument('--model', '-m', help='Path to .scad file (overrides SCAD_FILE env var)')
```

In `build_command`:
```python
scad_file = args.model if args.model else SCAD_FILE
cmd = [OPENSCAD_PATH, scad_file, ...]
```

The `SCAD_FILE` env var and default path remain as fallback for backward compatibility.

---

## BomGenerationManifest

The `BomGenerationManifestEntry` used for the 3MF manifest should cover both static and generated items. No change needed — filename + qty is sufficient regardless of source.

---

## Error Handling

- Item has no static STL AND library has no base model → `AppError(ErrorCodes.INTERNAL_ERROR, 'Library {id} has no base model and item {id} has no static STL')` — generation fails early, before any files are written
- `.scad` or `.stl` source file missing at seed time → warn (same as current image behavior), store null in DB
- Static STL source path not found at generation time → fail the generation pipeline with a clear error message

---

## Testing

- **`reseedLibraries.test.ts`**: add cases for `baseModel` copying and `stlFile` copying; assert DB rows have correct paths
- **`bomGeneration.service.test.ts`**: add `resolveItemSources` unit tests — static item, generated item, mixed, missing base model error
- **`useBillOfMaterials.test.ts`**: assert `libraryId` is propagated into `BOMItem`
- **Customization panel test**: when `libraryItem.stlFile` is set, customization section is not rendered
