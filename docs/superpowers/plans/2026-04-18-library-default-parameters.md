# Library Default Parameters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow library `index.json` files to define gridfinity generator parameters at the library and item level, which are merged into a precedence chain (system → library → item → user) and passed to the STL generator.

**Architecture:** A new `GeneratorParams` type flows from `index.json` → adapters → `LibraryItem.defaultParameters` → `PlacedItem.defaultParameters` → `BOMItem.defaultParameters` → `buildGenerateParams()`. BinCustomization-mappable params pre-fill the UI at placement time; all params (including non-UI ones like `label_style`) flow to the generator. User customization always wins over defaults.

**Tech Stack:** TypeScript, React 19, Vitest, Express/Node.js; Python generator (`generate_bin.py`) unchanged.

---

## File Map

### New files
- `packages/app/src/utils/generatorParams.ts` — merge + translation utilities
- `packages/app/src/utils/generatorParams.test.ts` — unit tests

### Modified files
- `packages/app/src/types/gridfinity.ts` — add `GeneratorParams`, update `LibraryMeta`, `LibraryItem`, `LibraryIndex`, `PlacedItem`, `BOMItem`
- `packages/shared/src/types.ts` — add `GeneratorParams`, update `BOMItem`
- `packages/app/src/api/adapters/static.adapter.ts` — read `defaultParameters`, merge library+item at item fetch time
- `packages/app/src/api/adapters/api.adapter.ts` — same as static adapter
- `packages/app/src/hooks/useGridItems.ts` — pre-fill `PlacedItem.customization` and `.defaultParameters` in `addItem()`
- `packages/app/src/hooks/useBillOfMaterials.ts` — carry `defaultParameters` from `LibraryItem` to `BOMItem`
- `packages/app/src/components/BinCustomizationPanel.tsx` — replace `customizationDefaults` prop with `defaultParameters`
- `packages/app/src/components/PlacedItemOverlay.tsx` — pass `item.defaultParameters` to panel; update reset handler
- `packages/app/src/contexts/WorkspaceContext.tsx` — update `selectedLibraryMeta` initial state
- `packages/server/src/services/bomGeneration.service.ts` — update `UniqueConfig`, `extractUniqueConfigs`, `buildStlFilename`, `buildGenerateParams`
- `packages/server/src/services/bomGeneration.service.test.ts` — add tests for `defaultParameters` merge
- `packages/app/public/libraries/shadowbox/index.json` — migrate `customizationDefaults` → `defaultParameters`
- `packages/app/public/libraries/bins_labeled/index.json` — add library-level `defaultParameters`
- Test files — update all `customizationDefaults: {}` references

---

## Task 1: Update frontend types

**Files:**
- Modify: `packages/app/src/types/gridfinity.ts`

- [ ] **Step 1: Add `GeneratorParams` type and update `LibraryMeta`**

In `packages/app/src/types/gridfinity.ts`, make these changes:

After the export of `DEFAULT_BIN_CUSTOMIZATION` (around line 132), add:
```typescript
export type GeneratorParams = Record<string, unknown>;
```

Replace the `LibraryMeta` interface (lines 156-159):
```typescript
export interface LibraryMeta {
  customizableFields: CustomizableField[];
  defaultParameters: GeneratorParams;
}
```

- [ ] **Step 2: Update `LibraryItem`, `PlacedItem`, `BOMItem`, `LibraryIndex`**

In `packages/app/src/types/gridfinity.ts`:

Replace `LibraryItem` interface (lines 46-57):
```typescript
export interface LibraryItem {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  stlFile?: string;
  imageUrl?: string;
  perspectiveImageUrl?: string;
  price?: number;
  defaultParameters?: GeneratorParams;
}
```

Replace `PlacedItem` interface (lines 59-69):
```typescript
export interface PlacedItem {
  instanceId: string;
  itemId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: Rotation;
  customization?: BinCustomization;
  shadowBoxId?: string | null;
  defaultParameters?: GeneratorParams;
}
```

Replace `BOMItem` interface (lines 84-95):
```typescript
export interface BOMItem {
  itemId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  quantity: number;
  customization?: BinCustomization;
  shadowboxId?: string;
  price?: number;
  defaultParameters?: GeneratorParams;
}
```

Replace `LibraryIndex` interface (lines 183-188):
```typescript
export interface LibraryIndex {
  version: string;
  items: LibraryItem[];
  customizableFields?: CustomizableField[];
  defaultParameters?: GeneratorParams;
}
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd packages/app && npx tsc --noEmit
```
Expected: Errors only about `customizationDefaults` usages — that's fine, we'll fix them in later tasks.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/types/gridfinity.ts
git commit -m "feat(types): add GeneratorParams, update LibraryMeta/LibraryItem/PlacedItem/BOMItem/LibraryIndex"
```

---

## Task 2: Update shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add `GeneratorParams` and update `BOMItem`**

In `packages/shared/src/types.ts`, after the `BinCustomization` interface definition (find it — around the top of the file), add:
```typescript
export type GeneratorParams = Record<string, unknown>;
```

Find `BOMItem` interface (line 98) and replace:
```typescript
export interface BOMItem {
  itemId: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  quantity: number;
  customization?: BinCustomization;
  defaultParameters?: GeneratorParams;
}
```

- [ ] **Step 2: Verify shared package compiles**

```bash
cd packages/shared && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared/types): add GeneratorParams, update BOMItem"
```

---

## Task 3: Create generatorParams utility (TDD)

**Files:**
- Create: `packages/app/src/utils/generatorParams.ts`
- Create: `packages/app/src/utils/generatorParams.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/app/src/utils/generatorParams.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { mergeGeneratorParams, generatorParamsToBinCustomization } from './generatorParams';

describe('mergeGeneratorParams', () => {
  it('returns empty object with no args', () => {
    expect(mergeGeneratorParams()).toEqual({});
  });

  it('returns copy of single layer', () => {
    expect(mergeGeneratorParams({ lip_style: 'none' })).toEqual({ lip_style: 'none' });
  });

  it('later layers override earlier layers', () => {
    expect(mergeGeneratorParams(
      { lip_style: 'none', label_style: 'normal' },
      { lip_style: 'reduced' }
    )).toEqual({ lip_style: 'reduced', label_style: 'normal' });
  });

  it('skips undefined layers', () => {
    expect(mergeGeneratorParams(undefined, { lip_style: 'none' }, undefined)).toEqual({ lip_style: 'none' });
  });

  it('later undefined does not clear earlier values', () => {
    expect(mergeGeneratorParams({ lip_style: 'none' }, undefined)).toEqual({ lip_style: 'none' });
  });
});

describe('generatorParamsToBinCustomization', () => {
  it('maps lip_style to lipStyle when in customizableFields', () => {
    const result = generatorParamsToBinCustomization({ lip_style: 'reduced' }, ['lipStyle']);
    expect(result.lipStyle).toBe('reduced');
  });

  it('ignores lip_style when lipStyle not in customizableFields', () => {
    const result = generatorParamsToBinCustomization({ lip_style: 'reduced' }, ['wallPattern']);
    expect(result.lipStyle).toBeUndefined();
  });

  it('maps fingerslide to fingerSlide', () => {
    const result = generatorParamsToBinCustomization({ fingerslide: 'rounded' }, ['fingerSlide']);
    expect(result.fingerSlide).toBe('rounded');
  });

  it('maps wallpattern_enabled: true + style to wallPattern', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: true, wallpattern_style: 'hexgrid' },
      ['wallPattern']
    );
    expect(result.wallPattern).toBe('hexgrid');
  });

  it('maps wallpattern_enabled: true with no style to grid (default)', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: true },
      ['wallPattern']
    );
    expect(result.wallPattern).toBe('grid');
  });

  it('maps wallpattern_enabled: false to none', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: false },
      ['wallPattern']
    );
    expect(result.wallPattern).toBe('none');
  });

  it('ignores wallPattern params when wallPattern not in customizableFields', () => {
    const result = generatorParamsToBinCustomization(
      { wallpattern_enabled: true, wallpattern_style: 'grid' },
      ['lipStyle']
    );
    expect(result.wallPattern).toBeUndefined();
  });

  it('maps height array [n, offset] to height n', () => {
    const result = generatorParamsToBinCustomization({ height: [4, 0] }, ['height']);
    expect(result.height).toBe(4);
  });

  it('maps height as plain number', () => {
    const result = generatorParamsToBinCustomization({ height: 6 }, ['height']);
    expect(result.height).toBe(6);
  });

  it('maps wallcutout_enabled: true + [1,0,1,0] to vertical', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [1, 0, 1, 0] },
      ['wallCutout']
    );
    expect(result.wallCutout).toBe('vertical');
  });

  it('maps wallcutout_enabled: true + [0,1,0,1] to horizontal', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [0, 1, 0, 1] },
      ['wallCutout']
    );
    expect(result.wallCutout).toBe('horizontal');
  });

  it('maps wallcutout_enabled: true + [1,1,1,1] to both', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [1, 1, 1, 1] },
      ['wallCutout']
    );
    expect(result.wallCutout).toBe('both');
  });

  it('maps wallcutout_enabled: false to none', () => {
    const result = generatorParamsToBinCustomization({ wallcutout_enabled: false }, ['wallCutout']);
    expect(result.wallCutout).toBe('none');
  });

  it('ignores wallCutout params when wallCutout not in customizableFields', () => {
    const result = generatorParamsToBinCustomization(
      { wallcutout_enabled: true, wallcutout_walls: [1, 1, 1, 1] },
      ['lipStyle']
    );
    expect(result.wallCutout).toBeUndefined();
  });

  it('returns empty object for empty params', () => {
    const result = generatorParamsToBinCustomization({}, ['lipStyle', 'wallPattern', 'fingerSlide', 'wallCutout', 'height']);
    expect(result).toEqual({});
  });

  it('maps multiple fields at once', () => {
    const result = generatorParamsToBinCustomization(
      { lip_style: 'none', fingerslide: 'chamfered', height: [4, 0] },
      ['lipStyle', 'fingerSlide', 'height']
    );
    expect(result).toEqual({ lipStyle: 'none', fingerSlide: 'chamfered', height: 4 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/app && npx vitest run src/utils/generatorParams.test.ts
```
Expected: FAIL — `generatorParams` module not found.

- [ ] **Step 3: Implement the utility**

Create `packages/app/src/utils/generatorParams.ts`:
```typescript
import type { GeneratorParams, BinCustomization, CustomizableField, WallPattern, LipStyle, FingerSlide, WallCutout } from '../types/gridfinity';

export function mergeGeneratorParams(...layers: (GeneratorParams | undefined)[]): GeneratorParams {
  return Object.assign({}, ...layers.filter((l): l is GeneratorParams => l !== undefined));
}

export function generatorParamsToBinCustomization(
  params: GeneratorParams,
  customizableFields: CustomizableField[]
): Partial<BinCustomization> {
  const result: Partial<BinCustomization> = {};

  if (customizableFields.includes('lipStyle') && params.lip_style !== undefined) {
    result.lipStyle = params.lip_style as LipStyle;
  }

  if (customizableFields.includes('fingerSlide') && params.fingerslide !== undefined) {
    result.fingerSlide = params.fingerslide as FingerSlide;
  }

  if (customizableFields.includes('wallPattern')) {
    if (params.wallpattern_enabled === true) {
      result.wallPattern = ((params.wallpattern_style ?? 'grid') as WallPattern);
    } else if (params.wallpattern_enabled === false) {
      result.wallPattern = 'none';
    }
  }

  if (customizableFields.includes('wallCutout')) {
    if (params.wallcutout_enabled === false) {
      result.wallCutout = 'none';
    } else if (params.wallcutout_enabled === true) {
      const walls = params.wallcutout_walls as number[] | undefined;
      if (!walls) {
        result.wallCutout = 'none';
      } else if (walls[0] === 1 && walls[1] === 1) {
        result.wallCutout = 'both';
      } else if (walls[0] === 1) {
        result.wallCutout = 'vertical';
      } else if (walls[1] === 1) {
        result.wallCutout = 'horizontal';
      } else {
        result.wallCutout = 'none';
      }
    }
  }

  if (customizableFields.includes('height') && params.height !== undefined) {
    if (Array.isArray(params.height)) {
      result.height = params.height[0] as number;
    } else if (typeof params.height === 'number') {
      result.height = params.height;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/app && npx vitest run src/utils/generatorParams.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/utils/generatorParams.ts packages/app/src/utils/generatorParams.test.ts
git commit -m "feat(utils): add generatorParams merge and translation utilities"
```

---

## Task 4: Update adapters to read defaultParameters

**Files:**
- Modify: `packages/app/src/api/adapters/static.adapter.ts`
- Modify: `packages/app/src/api/adapters/api.adapter.ts`

- [ ] **Step 1: Update `static.adapter.ts`**

Replace the entire content of `packages/app/src/api/adapters/static.adapter.ts`:
```typescript
import type { LibraryManifest, LibraryIndex, LibraryItem, LibraryMeta } from '../../types/gridfinity';
import { mergeGeneratorParams } from '../../utils/generatorParams';
import type { DataSourceAdapter, LibraryInfo } from './types';

const MANIFEST_PATH = '/libraries/manifest.json';

export class StaticAdapter implements DataSourceAdapter {
  private manifestCache: LibraryManifest | null = null;
  private metaCache = new Map<string, LibraryMeta>();

  async getLibraries(): Promise<LibraryInfo[]> {
    const manifest = await this.fetchManifest();

    const libraries = await Promise.all(
      manifest.libraries.map(async (lib) => {
        try {
          const response = await fetch(lib.path);
          const data: LibraryIndex = await response.json();
          return {
            id: lib.id,
            name: lib.name,
            path: lib.path,
            itemCount: data.items?.length ?? 0,
          };
        } catch {
          return { id: lib.id, name: lib.name, path: lib.path, itemCount: undefined };
        }
      })
    );

    return libraries;
  }

  async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
    const manifest = await this.fetchManifest();
    const lib = manifest.libraries.find((l) => l.id === libraryId);
    if (!lib) return [];

    const response = await fetch(lib.path);
    if (!response.ok) throw new Error(`Failed to fetch library ${libraryId}`);
    const data: LibraryIndex = await response.json();
    const libraryDefaults = data.defaultParameters ?? {};

    return (data.items ?? []).map((item) => ({
      ...item,
      defaultParameters: mergeGeneratorParams(libraryDefaults, item.defaultParameters),
    }));
  }

  async getLibraryMeta(libraryId: string): Promise<LibraryMeta> {
    if (this.metaCache.has(libraryId)) return this.metaCache.get(libraryId)!;
    const manifest = await this.fetchManifest();
    const lib = manifest.libraries.find((l) => l.id === libraryId);
    if (!lib) return { customizableFields: [], defaultParameters: {} };
    try {
      const response = await fetch(lib.path);
      if (!response.ok) return { customizableFields: [], defaultParameters: {} };
      const data: LibraryIndex = await response.json();
      const meta: LibraryMeta = {
        customizableFields: data.customizableFields ?? [],
        defaultParameters: data.defaultParameters ?? {},
      };
      this.metaCache.set(libraryId, meta);
      return meta;
    } catch {
      return { customizableFields: [], defaultParameters: {} };
    }
  }

  resolveImageUrl(libraryId: string, imagePath: string): string {
    if (imagePath.startsWith('/libraries/') || imagePath.startsWith('http')) {
      return imagePath;
    }
    return `/libraries/${libraryId}/${imagePath}`;
  }

  private async fetchManifest(): Promise<LibraryManifest> {
    if (this.manifestCache) return this.manifestCache;
    const response = await fetch(MANIFEST_PATH);
    if (!response.ok) throw new Error('Failed to fetch library manifest');
    this.manifestCache = await response.json();
    return this.manifestCache!;
  }

  clearCache(): void {
    this.manifestCache = null;
    this.metaCache.clear();
  }
}
```

- [ ] **Step 2: Update `api.adapter.ts`**

Replace the entire content of `packages/app/src/api/adapters/api.adapter.ts`:
```typescript
import type { LibraryItem, LibraryMeta } from '../../types/gridfinity';
import { mergeGeneratorParams } from '../../utils/generatorParams';
import type { DataSourceAdapter, LibraryInfo } from './types';

export class ApiAdapter implements DataSourceAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getLibraries(): Promise<LibraryInfo[]> {
    const response = await fetch(`${this.baseUrl}/libraries`);
    if (!response.ok) throw new Error('Failed to fetch libraries');
    const json = await response.json();
    return json.data.map((lib: Record<string, unknown>) => ({
      id: lib.id as string,
      name: lib.name as string,
      path: '',
      description: lib.description as string | undefined,
      itemCount: lib.itemCount as number | undefined,
    }));
  }

  async getLibraryItems(libraryId: string): Promise<LibraryItem[]> {
    const response = await fetch(`${this.baseUrl}/libraries/${libraryId}/items`);
    if (!response.ok) throw new Error(`Failed to fetch items for ${libraryId}`);
    const json = await response.json();

    // Fetch library-level defaultParameters to merge with item-level
    const meta = await this.getLibraryMeta(libraryId);
    const libraryDefaults = meta.defaultParameters;

    return json.data.map((item: Record<string, unknown>) => ({
      id: item.id as string,
      name: item.name as string,
      widthUnits: item.widthUnits as number,
      heightUnits: item.heightUnits as number,
      color: item.color as string,
      categories: item.categories as string[],
      imageUrl: item.imagePath as string | undefined,
      perspectiveImageUrl: item.perspectiveImagePath as string | undefined,
      defaultParameters: mergeGeneratorParams(
        libraryDefaults,
        (item.defaultParameters as Record<string, unknown> | undefined)
      ),
    }));
  }

  async getLibraryMeta(libraryId: string): Promise<LibraryMeta> {
    try {
      const manifestResponse = await fetch('/libraries/manifest.json');
      if (!manifestResponse.ok) return { customizableFields: [], defaultParameters: {} };
      const manifest = await manifestResponse.json();
      const lib = manifest.libraries?.find((l: { id: string }) => l.id === libraryId);
      if (!lib) return { customizableFields: [], defaultParameters: {} };
      const indexResponse = await fetch(lib.path);
      if (!indexResponse.ok) return { customizableFields: [], defaultParameters: {} };
      const data = await indexResponse.json();
      return {
        customizableFields: data.customizableFields ?? [],
        defaultParameters: data.defaultParameters ?? {},
      };
    } catch {
      return { customizableFields: [], defaultParameters: {} };
    }
  }

  resolveImageUrl(_libraryId: string, imagePath: string): string {
    if (imagePath.startsWith('http')) return imagePath;
    return `${this.baseUrl}/images/${imagePath}`;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/api/adapters/static.adapter.ts packages/app/src/api/adapters/api.adapter.ts
git commit -m "feat(adapters): read defaultParameters from index.json, merge library+item at fetch time"
```

---

## Task 5: Update index.json files

**Files:**
- Modify: `packages/app/public/libraries/shadowbox/index.json`
- Modify: `packages/app/public/libraries/bins_labeled/index.json`

- [ ] **Step 1: Migrate shadowbox — replace `customizationDefaults` with `defaultParameters`**

In `packages/app/public/libraries/shadowbox/index.json`, replace:
```json
"customizationDefaults": { "height": 4 },
```
with:
```json
"defaultParameters": { "height": [4, 0] },
```

The height generator param takes `[units, offset]` format, so 4 units → `[4, 0]`.

- [ ] **Step 2: Add library-level `defaultParameters` to bins_labeled**

In `packages/app/public/libraries/bins_labeled/index.json`, after the `"customizableFields"` line, add:
```json
"defaultParameters": {
  "label_style": "normal",
  "label_walls": [0, 1, 0, 0]
},
```

The full start of the file should look like:
```json
{
  "version": "1.0.0",
  "customizableFields": ["lipStyle", "wallPattern", "fingerSlide", "wallCutout"],
  "defaultParameters": {
    "label_style": "normal",
    "label_walls": [0, 1, 0, 0]
  },
  "items": [
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/public/libraries/shadowbox/index.json packages/app/public/libraries/bins_labeled/index.json
git commit -m "feat(libraries): add defaultParameters to bins_labeled and shadowbox"
```

---

## Task 6: Update `addItem()` in useGridItems.ts

**Files:**
- Modify: `packages/app/src/hooks/useGridItems.ts`

- [ ] **Step 1: Update imports**

In `packages/app/src/hooks/useGridItems.ts`, update the import at line 2:
```typescript
import type { PlacedItem, PlacedItemWithValidity, DragData, LibraryItem, Rotation, BinCustomization } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';
import { ROTATION_CW, ROTATION_CCW } from '../utils/constants';
import { mergeGeneratorParams, generatorParamsToBinCustomization } from '../utils/generatorParams';
```

(Check the current import — `BinCustomization` and `DEFAULT_BIN_CUSTOMIZATION` may already be imported; adjust as needed to avoid duplicates.)

- [ ] **Step 2: Update `addItem()` to pre-fill customization and set defaultParameters**

Find the `addItem` callback (line 198) and replace it:
```typescript
const addItem = useCallback((itemId: string, x: number, y: number) => {
    const libraryItem = getItemById(itemId);
    if (!libraryItem) return;

    const allFields = ['wallPattern', 'lipStyle', 'fingerSlide', 'wallCutout', 'height'] as const;
    const prefilledDefaults = libraryItem.defaultParameters
      ? generatorParamsToBinCustomization(libraryItem.defaultParameters, [...allFields])
      : {};
    const hasCustomDefaults = Object.keys(prefilledDefaults).length > 0;

    const newItem: PlacedItem = {
      instanceId: generateInstanceId(),
      itemId,
      x,
      y,
      width: libraryItem.widthUnits,
      height: libraryItem.heightUnits,
      rotation: 0,
      customization: hasCustomDefaults
        ? { ...DEFAULT_BIN_CUSTOMIZATION, ...prefilledDefaults }
        : undefined,
      defaultParameters: libraryItem.defaultParameters
        ? mergeGeneratorParams(libraryItem.defaultParameters)
        : undefined,
    };

    updateItems([...itemsRef.current, newItem]);
    updateSelected(new Set([newItem.instanceId]));
  }, [getItemById, updateItems, updateSelected]);
```

- [ ] **Step 3: Run the frontend unit tests to check for regressions**

```bash
cd packages/app && npx vitest run src/hooks/useGridItems.test.ts
```
Expected: All tests PASS (the change only adds fields, doesn't remove behavior).

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/hooks/useGridItems.ts
git commit -m "feat(useGridItems): pre-fill customization and defaultParameters from library item at placement"
```

---

## Task 7: Update BinCustomizationPanel

**Files:**
- Modify: `packages/app/src/components/BinCustomizationPanel.tsx`

- [ ] **Step 1: Update imports in BinCustomizationPanel**

At the top of `packages/app/src/components/BinCustomizationPanel.tsx`, add the import:
```typescript
import type { GeneratorParams } from '../types/gridfinity';
import { generatorParamsToBinCustomization } from '../utils/generatorParams';
```

- [ ] **Step 2: Update `BinCustomizationPanelProps` interface**

Find the interface (around line 95):
```typescript
interface BinCustomizationPanelProps {
  customization: BinCustomization | undefined;
  onChange: (customization: BinCustomization) => void;
  onReset: () => void;
  customizableFields: CustomizableField[];
  customizationDefaults?: Partial<BinCustomization>;
  idPrefix?: string;
}
```

Replace with:
```typescript
interface BinCustomizationPanelProps {
  customization: BinCustomization | undefined;
  onChange: (customization: BinCustomization) => void;
  onReset: () => void;
  customizableFields: CustomizableField[];
  defaultParameters?: GeneratorParams;
  idPrefix?: string;
}
```

- [ ] **Step 3: Update the component function signature and effectiveDefaults logic**

Find the component function (around line 111):
```typescript
export function BinCustomizationPanel({
  customization,
  onChange,
  onReset,
  customizableFields,
  customizationDefaults,
  idPrefix = '',
}: BinCustomizationPanelProps) {
  if (customizableFields.length === 0) return null;

  const effectiveDefaults = { ...DEFAULT_BIN_CUSTOMIZATION, ...customizationDefaults };
  const current: BinCustomization = customization ?? effectiveDefaults;
  const isDefault = isDefaultCustomization(customization)
    && (!customizationDefaults || Object.entries(customizationDefaults).every(
      ([k, v]) => current[k as keyof BinCustomization] === v
    ));
```

Replace with:
```typescript
export function BinCustomizationPanel({
  customization,
  onChange,
  onReset,
  customizableFields,
  defaultParameters,
  idPrefix = '',
}: BinCustomizationPanelProps) {
  if (customizableFields.length === 0) return null;

  const libraryDefaults = defaultParameters
    ? generatorParamsToBinCustomization(defaultParameters, customizableFields)
    : {};
  const effectiveDefaults = { ...DEFAULT_BIN_CUSTOMIZATION, ...libraryDefaults };
  const current: BinCustomization = customization ?? effectiveDefaults;
  const isDefault =
    current.wallPattern === effectiveDefaults.wallPattern &&
    current.lipStyle === effectiveDefaults.lipStyle &&
    current.fingerSlide === effectiveDefaults.fingerSlide &&
    current.wallCutout === effectiveDefaults.wallCutout &&
    current.height === effectiveDefaults.height;
```

- [ ] **Step 4: Run BinCustomizationPanel tests**

```bash
cd packages/app && npx vitest run src/components/BinCustomizationPanel.test.tsx
```
Expected: Some tests FAIL because they pass `customizationDefaults` prop. Note which tests fail — they will be fixed in Task 11.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/BinCustomizationPanel.tsx
git commit -m "feat(BinCustomizationPanel): replace customizationDefaults prop with defaultParameters"
```

---

## Task 8: Update PlacedItemOverlay and WorkspaceContext

**Files:**
- Modify: `packages/app/src/components/PlacedItemOverlay.tsx`
- Modify: `packages/app/src/contexts/WorkspaceContext.tsx`

- [ ] **Step 1: Update `PlacedItemOverlay` initial state**

In `packages/app/src/components/PlacedItemOverlay.tsx`, find line 48:
```typescript
const [libraryMeta, setLibraryMeta] = useState<LibraryMeta>({ customizableFields: [], customizationDefaults: {} });
```
Replace with:
```typescript
const [libraryMeta, setLibraryMeta] = useState<LibraryMeta>({ customizableFields: [], defaultParameters: {} });
```

- [ ] **Step 2: Update the `BinCustomizationPanel` usage in PlacedItemOverlay**

Find the `BinCustomizationPanel` usage (around line 341-348):
```typescript
<BinCustomizationPanel
  customization={item.customization}
  onChange={handlePopoverChange}
  onReset={handlePopoverReset}
  idPrefix="inline-"
  customizableFields={libraryMeta.customizableFields}
  customizationDefaults={libraryMeta.customizationDefaults}
/>
```
Replace with:
```typescript
<BinCustomizationPanel
  customization={item.customization}
  onChange={handlePopoverChange}
  onReset={handlePopoverReset}
  idPrefix="inline-"
  customizableFields={libraryMeta.customizableFields}
  defaultParameters={item.defaultParameters}
/>
```

- [ ] **Step 3: Fix handlePopoverReset in PlacedItemOverlay**

`handlePopoverReset` currently calls `onCustomizationReset?.(item.instanceId)`, which sets `PlacedItem.customization = undefined`. This bypasses library defaults — e.g., a shadowbox with `height: [4, 0]` in `defaultParameters` would reset to height=8 (system default) instead of height=4.

First, add imports at the top of `PlacedItemOverlay.tsx` (update existing import lines):
```typescript
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';
import { generatorParamsToBinCustomization } from '../utils/generatorParams';
```

Then replace `handlePopoverReset` (around line 169):
```typescript
const handlePopoverReset = useCallback(() => {
  const allFields = ['wallPattern', 'lipStyle', 'fingerSlide', 'wallCutout', 'height'] as const;
  const libraryDefaults = item.defaultParameters
    ? generatorParamsToBinCustomization(item.defaultParameters, [...allFields])
    : {};
  const hasLibraryDefaults = Object.keys(libraryDefaults).length > 0;
  if (hasLibraryDefaults) {
    onCustomizationChange?.(item.instanceId, { ...DEFAULT_BIN_CUSTOMIZATION, ...libraryDefaults });
  } else {
    onCustomizationReset?.(item.instanceId);
  }
}, [item, onCustomizationChange, onCustomizationReset]);
```

This restores to library defaults when they exist, and falls back to system defaults (via `onCustomizationReset`) when none are defined.

- [ ] **Step 4: Update WorkspaceContext initial state**

In `packages/app/src/contexts/WorkspaceContext.tsx`, find lines 212-215:
```typescript
const [selectedLibraryMeta, setSelectedLibraryMeta] = useState<LibraryMeta>({
    customizableFields: [],
    customizationDefaults: {},
  });
```
Replace with:
```typescript
const [selectedLibraryMeta, setSelectedLibraryMeta] = useState<LibraryMeta>({
    customizableFields: [],
    defaultParameters: {},
  });
```

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/PlacedItemOverlay.tsx packages/app/src/contexts/WorkspaceContext.tsx
git commit -m "feat(PlacedItemOverlay): pass item.defaultParameters to panel; update WorkspaceContext"
```

---

## Task 9: Update useBillOfMaterials

**Files:**
- Modify: `packages/app/src/hooks/useBillOfMaterials.ts`

- [ ] **Step 1: Update useBillOfMaterials to carry defaultParameters**

Replace the entire content of `packages/app/src/hooks/useBillOfMaterials.ts`:
```typescript
import { useMemo } from 'react';
import type { PlacedItem, BOMItem, LibraryItem, BinCustomization } from '../types/gridfinity';
import { isDefaultCustomization, getBOMKey } from '../types/gridfinity';

export function useBillOfMaterials(placedItems: PlacedItem[], libraryItems: LibraryItem[]): BOMItem[] {
  return useMemo(() => {
    const itemCounts = new Map<string, { count: number; customization: BinCustomization | undefined }>();

    placedItems.forEach(placedItem => {
      const groupKey = getBOMKey(placedItem.itemId, placedItem.customization);
      const existing = itemCounts.get(groupKey);
      if (existing) {
        existing.count++;
      } else {
        itemCounts.set(groupKey, {
          count: 1,
          customization: isDefaultCustomization(placedItem.customization) ? undefined : placedItem.customization,
        });
      }
    });

    const bomItems: BOMItem[] = [];

    itemCounts.forEach(({ count, customization }, groupKey) => {
      const itemId = groupKey.split('::')[0];
      const libraryItem = libraryItems.find(item => item.id === itemId);
      if (libraryItem) {
        bomItems.push({
          itemId: libraryItem.id,
          name: libraryItem.name,
          widthUnits: libraryItem.widthUnits,
          heightUnits: libraryItem.heightUnits,
          color: libraryItem.color,
          categories: libraryItem.categories,
          quantity: count,
          customization,
          ...(libraryItem.price !== undefined ? { price: libraryItem.price } : {}),
          ...(libraryItem.defaultParameters && Object.keys(libraryItem.defaultParameters).length > 0
            ? { defaultParameters: libraryItem.defaultParameters }
            : {}),
        });
      }
    });

    return bomItems.sort((a, b) => a.name.localeCompare(b.name));
  }, [placedItems, libraryItems]);
}
```

- [ ] **Step 2: Run useBillOfMaterials tests**

```bash
cd packages/app && npx vitest run src/hooks/useBillOfMaterials.test.ts
```
Expected: All tests PASS (new `defaultParameters` field is additive).

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/hooks/useBillOfMaterials.ts
git commit -m "feat(useBillOfMaterials): carry defaultParameters from LibraryItem to BOMItem"
```

---

## Task 10: Update bomGeneration.service.ts (TDD)

**Files:**
- Modify: `packages/server/src/services/bomGeneration.service.ts`
- Modify: `packages/server/src/services/bomGeneration.service.test.ts`

- [ ] **Step 1: Write new failing tests for defaultParameters**

Open `packages/server/src/services/bomGeneration.service.test.ts` and add a new describe block after the existing `buildGenerateParams` tests:

```typescript
describe('buildGenerateParams with defaultParameters', () => {
  const DEFAULT_CUSTOMIZATION: BinCustomization = {
    wallPattern: 'none',
    lipStyle: 'normal',
    fingerSlide: 'none',
    wallCutout: 'none',
    height: 8,
  };

  it('passes through non-BinCustomization params from defaultParameters', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION },
      qty: 1,
      filename: 'bin_1x1x8.stl',
      defaultParameters: { label_style: 'normal', label_walls: [0, 1, 0, 0] },
    };
    const params = buildGenerateParams(cfg);
    expect(params.label_style).toBe('normal');
    expect(params.label_walls).toEqual([0, 1, 0, 0]);
  });

  it('BinCustomization lip_style overrides defaultParameters lip_style', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION, lipStyle: 'reduced' },
      qty: 1,
      filename: 'bin_1x1x8.stl',
      defaultParameters: { lip_style: 'none' },
    };
    const params = buildGenerateParams(cfg);
    expect(params.lip_style).toBe('reduced');
  });

  it('BinCustomization height overrides defaultParameters height', () => {
    const cfg: UniqueConfig = {
      widthUnits: 2,
      heightUnits: 2,
      customization: { ...DEFAULT_CUSTOMIZATION, height: 6 },
      qty: 1,
      filename: 'bin_2x2x6.stl',
      defaultParameters: { height: [4, 0] },
    };
    const params = buildGenerateParams(cfg);
    expect(params.height).toEqual([6, 0]);
  });

  it('system default label_style: disabled is overridden by defaultParameters', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION },
      qty: 1,
      filename: 'bin_1x1x8.stl',
      defaultParameters: { label_style: 'normal' },
    };
    const params = buildGenerateParams(cfg);
    expect(params.label_style).toBe('normal');
  });

  it('uses label_style: disabled when no defaultParameters override', () => {
    const cfg: UniqueConfig = {
      widthUnits: 1,
      heightUnits: 1,
      customization: { ...DEFAULT_CUSTOMIZATION },
      qty: 1,
      filename: 'bin_1x1x8.stl',
    };
    const params = buildGenerateParams(cfg);
    expect(params.label_style).toBe('disabled');
  });
});

describe('extractUniqueConfigs with defaultParameters', () => {
  const DEFAULT_CUSTOMIZATION: BinCustomization = {
    wallPattern: 'none',
    lipStyle: 'normal',
    fingerSlide: 'none',
    wallCutout: 'none',
    height: 8,
  };

  it('groups items with same dimensions, customization, and defaultParameters together', () => {
    const items: BOMItem[] = [
      {
        itemId: 'bins_labeled:bin-1x1-labeled',
        name: 'A',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 2,
        defaultParameters: { label_style: 'normal' },
      },
      {
        itemId: 'bins_labeled:bin-1x1-labeled',
        name: 'A',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 3,
        defaultParameters: { label_style: 'normal' },
      },
    ];
    const configs = extractUniqueConfigs(items);
    expect(configs).toHaveLength(1);
    expect(configs[0].qty).toBe(5);
  });

  it('separates items with same dimensions but different defaultParameters', () => {
    const items: BOMItem[] = [
      {
        itemId: 'bins_labeled:bin-1x1-labeled',
        name: 'Labeled',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 1,
        defaultParameters: { label_style: 'normal' },
      },
      {
        itemId: 'bins_standard:bin-1x1',
        name: 'Standard',
        widthUnits: 1,
        heightUnits: 1,
        color: '#fff',
        categories: [],
        quantity: 1,
        defaultParameters: {},
      },
    ];
    const configs = extractUniqueConfigs(items);
    expect(configs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/server && npx vitest run src/services/bomGeneration.service.test.ts
```
Expected: New tests FAIL because `UniqueConfig` doesn't have `defaultParameters` yet.

- [ ] **Step 3: Update `UniqueConfig` and `buildGenerateParams`**

Replace the relevant sections in `packages/server/src/services/bomGeneration.service.ts`:

First, add the import at the top (after existing imports):
```typescript
import type { GeneratorParams } from '@gridfinity/shared';
```

Update `UniqueConfig` interface (around line 32):
```typescript
export interface UniqueConfig {
  widthUnits: number;
  heightUnits: number;
  customization: BinCustomization;
  qty: number;
  filename: string;
  defaultParameters?: GeneratorParams;
}
```

Add a helper function after `customizationKey` (before `extractUniqueConfigs`):
```typescript
function hashGeneratorParams(params: GeneratorParams): string {
  const sorted = Object.fromEntries(Object.entries(params).sort((a, b) => a[0].localeCompare(b[0])));
  const str = JSON.stringify(sorted);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
```

Update `extractUniqueConfigs` to include `defaultParameters` in the key:
```typescript
export function extractUniqueConfigs(bomItems: BOMItem[]): UniqueConfig[] {
  const map = new Map<string, UniqueConfig>();

  for (const item of bomItems) {
    const c = item.customization ?? DEFAULT_CUSTOMIZATION;
    const defaultParams = item.defaultParameters ?? {};
    const paramsHash = Object.keys(defaultParams).length > 0 ? hashGeneratorParams(defaultParams) : '';
    const key = `${item.widthUnits}x${item.heightUnits}::${customizationKey(item)}::${paramsHash}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty += item.quantity;
    } else {
      const filename = buildStlFilename(item.widthUnits, item.heightUnits, c, defaultParams);
      map.set(key, {
        widthUnits: item.widthUnits,
        heightUnits: item.heightUnits,
        customization: c,
        qty: item.quantity,
        filename,
        defaultParameters: Object.keys(defaultParams).length > 0 ? defaultParams : undefined,
      });
    }
  }

  return Array.from(map.values());
}
```

Update `buildStlFilename` to accept and use `defaultParameters`:
```typescript
function buildStlFilename(w: number, d: number, c: BinCustomization, defaultParams?: GeneratorParams): string {
  const parts = [`bin_${w}x${d}x${c.height}`];
  if (c.lipStyle !== 'normal') parts.push(c.lipStyle);
  if (c.fingerSlide !== 'none') parts.push('fingerslid');
  if (c.wallPattern !== 'none') parts.push('patterned');
  if (c.wallCutout !== 'none') parts.push('cutout');
  if (defaultParams && Object.keys(defaultParams).length > 0) {
    parts.push(hashGeneratorParams(defaultParams));
  }
  return parts.join('_') + '.stl';
}
```

Update `buildGenerateParams` to merge `defaultParameters`:
```typescript
export function buildGenerateParams(cfg: UniqueConfig): Record<string, unknown> {
  const c = cfg.customization;

  // System defaults (lowest priority) → defaultParameters → BinCustomization (highest)
  const params: Record<string, unknown> = {
    label_style: 'disabled',           // system default, overridable by defaultParameters
    ...(cfg.defaultParameters ?? {}),  // library/item defaults
    // BinCustomization — always wins
    width: [cfg.widthUnits, 0],
    depth: [cfg.heightUnits, 0],
    height: [c.height, 0],
    lip_style: c.lipStyle,
    fingerslide: c.fingerSlide,
  };

  // wallPattern: BinCustomization always controls wallpattern_enabled/style
  if (c.wallPattern !== 'none') {
    params.wallpattern_enabled = true;
    params.wallpattern_style = c.wallPattern;
  } else {
    delete params.wallpattern_enabled;
    delete params.wallpattern_style;
  }

  // wallCutout: BinCustomization always controls wallcutout_enabled/walls
  if (c.wallCutout !== 'none') {
    params.wallcutout_enabled = true;
    if (c.wallCutout === 'vertical') params.wallcutout_walls = [1, 0, 1, 0];
    else if (c.wallCutout === 'horizontal') params.wallcutout_walls = [0, 1, 0, 1];
    else if (c.wallCutout === 'both') params.wallcutout_walls = [1, 1, 1, 1];
  } else {
    params.wallcutout_enabled = false;
    delete params.wallcutout_walls;
  }

  return params;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run src/services/bomGeneration.service.test.ts
```
Expected: All tests PASS including the new ones.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/bomGeneration.service.ts packages/server/src/services/bomGeneration.service.test.ts
git commit -m "feat(bomGeneration): merge defaultParameters in buildGenerateParams, include in dedup key"
```

---

## Task 11: Fix all broken tests

**Files:**
- Modify: `packages/app/src/test/testWrapper.tsx`
- Modify: `packages/app/src/App.test.tsx`
- Modify: `packages/app/src/AppShell.test.tsx`
- Modify: `packages/app/src/hooks/useLibraryData.test.ts`
- Modify: `packages/app/src/components/BinCustomizationPanel.test.tsx`
- Modify: `packages/app/src/components/PlacedItemOverlay.test.tsx`

- [ ] **Step 1: Run the full frontend test suite and capture failures**

```bash
cd packages/app && npx vitest run 2>&1 | grep -E "FAIL|●" | head -60
```
Note every failing test file.

- [ ] **Step 2: Fix `customizationDefaults` → `defaultParameters` in test helpers**

In `packages/app/src/test/testWrapper.tsx`, find every occurrence of `customizationDefaults: {}` and replace with `defaultParameters: {}`.

In `packages/app/src/App.test.tsx`, find:
```typescript
const mockGetLibraryMeta = vi.fn().mockResolvedValue({ customizableFields: [], customizationDefaults: {} });
```
Replace with:
```typescript
const mockGetLibraryMeta = vi.fn().mockResolvedValue({ customizableFields: [], defaultParameters: {} });
```

In `packages/app/src/AppShell.test.tsx`, find:
```typescript
selectedLibraryMeta: { customizableFields: [], customizationDefaults: {} },
```
Replace with:
```typescript
selectedLibraryMeta: { customizableFields: [], defaultParameters: {} },
```

- [ ] **Step 3: Fix useLibraryData tests**

In `packages/app/src/hooks/useLibraryData.test.ts`, replace all occurrences of `customizationDefaults: {}` with `defaultParameters: {}`, and any specific `customizationDefaults` assertions:

Find:
```typescript
expect(meta.customizationDefaults).toEqual({});
```
Replace with:
```typescript
expect(meta.defaultParameters).toEqual({});
```

Find (line 47):
```typescript
return options?.metaByLibrary?.[libraryId] ?? { customizableFields: [], customizationDefaults: {} };
```
Replace with:
```typescript
return options?.metaByLibrary?.[libraryId] ?? { customizableFields: [], defaultParameters: {} };
```

- [ ] **Step 4: Fix BinCustomizationPanel tests**

In `packages/app/src/components/BinCustomizationPanel.test.tsx`, find the test section using `customizationDefaults` prop (around line 752):

```typescript
describe('customizationDefaults for reset', () => {
```

This describe block uses `customizationDefaults={{ height: 4 }}`. Replace the prop name with `defaultParameters` and update the value to use generator param format. Search the entire file for `customizationDefaults=` and replace:

```typescript
customizationDefaults={{ height: 4 }}
```
→
```typescript
defaultParameters={{ height: [4, 0] }}
```

Also replace any prop in the test file:
```typescript
customizationDefaults={...}
```
→
```typescript
defaultParameters={...}
```

For any test that checks the "reset" behavior with library defaults, ensure the test asserts `effectiveDefaults` derived from `defaultParameters`.

- [ ] **Step 5: Fix PlacedItemOverlay tests**

In `packages/app/src/components/PlacedItemOverlay.test.tsx`, find all occurrences of:
```typescript
getLibraryMeta={async () => ({ customizableFields: ['lipStyle'], customizationDefaults: {} })}
```
Replace with:
```typescript
getLibraryMeta={async () => ({ customizableFields: ['lipStyle'], defaultParameters: {} })}
```

Also find:
```typescript
customizationDefaults: {},
```
(in mock objects) and replace with:
```typescript
defaultParameters: {},
```

- [ ] **Step 6: Run the full frontend test suite**

```bash
cd packages/app && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 7: Run server tests**

```bash
cd packages/server && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/test/testWrapper.tsx packages/app/src/App.test.tsx packages/app/src/AppShell.test.tsx packages/app/src/hooks/useLibraryData.test.ts packages/app/src/components/BinCustomizationPanel.test.tsx packages/app/src/components/PlacedItemOverlay.test.tsx
git commit -m "fix(tests): update customizationDefaults → defaultParameters across all test fixtures"
```

---

## Task 12: Run full test suite and lint

- [ ] **Step 1: Run lint**

```bash
npm run lint
```
Expected: No errors. Fix any that appear before proceeding.

- [ ] **Step 2: Run all unit tests**

```bash
npm run test:run
```
Expected: All tests pass. Count shown at end: should be 1211+ tests passing, 0 failing.

- [ ] **Step 3: Fix any remaining failures**

If any test fails at this point, read the error output carefully. Common issues:
- TypeScript import of `GeneratorParams` missing in a file
- A test file that mocks `getLibraryMeta` and still returns `customizationDefaults`
- A component that passes `customizationDefaults` to `BinCustomizationPanel`

Search for any remaining `customizationDefaults` references:
```bash
cd packages/app && grep -r "customizationDefaults" src/ --include="*.ts" --include="*.tsx"
```
Each result is a missed replacement. Fix them, then re-run tests.

- [ ] **Step 4: Final commit if any fixes made**

```bash
git add -u
git commit -m "fix: resolve remaining customizationDefaults references after rename"
```

---

## Task 13: Docker rebuild and deploy

- [ ] **Step 1: Verify app builds successfully**

```bash
npm run build
```
Expected: No TypeScript or build errors.

- [ ] **Step 2: Rebuild Docker containers**

```bash
docker compose down && docker compose build --no-cache && docker compose up -d
```
Expected: All containers start. App accessible at localhost:32888.

- [ ] **Step 3: Verify the container is running**

```bash
docker compose ps
```
Expected: All services show as "Up".

- [ ] **Step 4: Manual verification checklist**

1. Open localhost:32888
2. Place a bin from **bins_labeled** library → open the customization panel → verify no UI change (label params are not in customizableFields, so panel looks the same as before)
3. Place a bin from **shadowbox** library → open the customization panel → verify **height shows 4** (not 8, which is the global default)
4. Change the shadowbox height to 6 → verify it changes correctly
5. Place a bin from **bins_standard** library → open customization panel → verify height shows 8 (unchanged)
