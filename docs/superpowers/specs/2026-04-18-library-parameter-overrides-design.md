# Library Default Parameters Design

**Date:** 2026-04-18  
**Branch:** feat/procedural-stls  
**Status:** Approved

## Overview

Library items should be able to define gridfinity generator parameters that act as defaults, allowing pre-configured items (e.g., `bins_labeled`) to express their identity without requiring users to manually apply common customizations. Parameters can be set library-wide (root of `index.json`) and/or per item. The most specific tier wins.

**Precedence chain (lowest → highest):**
```
system defaults → library defaultParameters → item defaultParameters → user customization
```

## Data Schema

Two new optional fields in `index.json`:

```json
{
  "version": "1.0.0",
  "customizableFields": ["lipStyle", "wallPattern"],
  "defaultParameters": {
    "lip_style": "none",
    "label_style": "normal",
    "label_walls": [0, 1, 0, 0]
  },
  "items": [
    {
      "id": "bin-2x4-labeled",
      "name": "2x4 Labeled",
      "widthUnits": 2,
      "heightUnits": 4,
      "color": "#3B82F6",
      "categories": ["labeled"],
      "defaultParameters": {
        "label_size": [2, 14, 0, 0.6]
      }
    }
  ]
}
```

- Keys in `defaultParameters` are raw `PARAM_REGISTRY` names from `generate_bin.py`
- Any valid generator parameter may be set; invalid keys are ignored at generation time
- Existing `customizationDefaults` is deprecated and migrated into `defaultParameters` using generator param names
- `defaultParameters` at the item level is optional; library-level is also optional

## Merge Logic

### UI Pre-fill (at item placement)

When an item is placed on the grid:

```
effectiveDefaults = merge(
  systemDefaults,
  library.defaultParameters,
  item.defaultParameters
)
```

For each field in `customizableFields`, if `effectiveDefaults` contains a matching generator param, translate it back to a `BinCustomization` field and pre-fill the customization panel. The user remains free to change any pre-filled value.

Param → BinCustomization mapping (representative examples):
| Generator param | BinCustomization field |
|---|---|
| `lip_style` | `lipStyle` |
| `wallpattern_enabled` + `wallpattern_style` | `wallPattern` |
| `fingerslide` | `fingerSlide` |
| `wallcutout_enabled` | `wallCutout` |

### Generator Call (STL production)

```
finalParams = merge(
  PROJECT_DEFAULTS,               // system level (configurator.py)
  library.defaultParameters,      // library level
  item.defaultParameters,         // item level
  userCustomization (mapped)      // user level — always wins
)
```

The merged object is passed directly to `generate_bin.py`. No generator-side changes needed.

## Type Changes

```typescript
// New shared type for raw generator params
type GeneratorParams = Record<string, unknown>;

// LibraryMeta updated
interface LibraryMeta {
  customizableFields: CustomizableField[];
  customizationDefaults: Partial<BinCustomization>; // deprecated, kept for back-compat
  defaultParameters: GeneratorParams;               // new — empty object if absent
}

// LibraryItem updated
interface LibraryItem {
  id: string;
  name: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  categories: string[];
  imageUrl?: string;
  perspectiveImageUrl?: string;
  defaultParameters?: GeneratorParams;              // new — optional, item-level overrides
}
```

## Files to Change

| File | Change |
|---|---|
| `public/libraries/*/index.json` | Add `defaultParameters` at root and per item |
| `src/types/gridfinity.ts` | Add `GeneratorParams`, update `LibraryMeta` and `LibraryItem` |
| `packages/shared/src/types.ts` | Mirror type updates for shared types |
| `src/api/adapters/static.adapter.ts` | Read `defaultParameters` from index JSON |
| `src/api/adapters/api.adapter.ts` | Pass `defaultParameters` through from API response |
| `src/hooks/useGridItems.ts` | Apply effective defaults at item placement |
| `src/utils/bomGeneration.ts` | Merge `defaultParameters` into generator params before STL call |
| Server Zod schemas | Add `defaultParameters` field to library/item validation |

## Out of Scope

- No new UI — only existing customization fields are pre-filled
- No generator changes — `generate_bin.py` already accepts any `PARAM_REGISTRY` key
- No database schema changes — `defaultParameters` lives in JSON files only
- No validation of param keys at the frontend — invalid keys are silently ignored by the generator

## Testing

- Unit tests: merge utility function covering all four tiers and conflict resolution
- Unit tests: BinCustomization pre-fill from effectiveDefaults for each mappable field
- Unit tests: adapter reads `defaultParameters` correctly when present/absent
- E2E: place a `bins_labeled` item — customization panel shows label-on defaults pre-filled
- E2E: user overrides a pre-filled field — generator receives user value, not library default
