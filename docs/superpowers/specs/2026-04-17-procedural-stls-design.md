# Procedural STLs — Design Spec

**Date:** 2026-04-17
**Branch:** develop (feature branch: `feat/procedural-stls`)
**Status:** Approved for implementation

## Overview

Admin-only order fulfillment feature. When an admin views a submitted BOM, they can trigger on-demand STL generation for each unique bin configuration in that BOM, then download either individual STL files or a single 3MF that fully satisfies the BOM (correct quantities of each unique bin type as mesh instances).

Generation runs locally via Node child process → `generate_bin.py` → OpenSCAD. Production deployment is out of scope for this iteration.

---

## 1. Customization Schema

The `customization` JSON field on `placed_items` will be populated with default values on item placement. Initial schema:

```typescript
interface PlacedItemCustomization {
  heightUnits: number;                          // default: 10
  lipStyle: 'none' | 'normal' | 'reduced';      // default: 'none'
  labelStyle: 'disabled' | 'normal';            // default: 'disabled'
  verticalChambers: number;                     // default: 1
  horizontalChambers: number;                   // default: 1
}
```

Width and depth come from `placed_items.width` / `placed_items.height` (already persisted) and are not duplicated in the customization JSON.

---

## 2. Backend Generation Pipeline

### Endpoint

```
POST /api/v1/admin/bom/:submissionId/generate
Authorization: Bearer <admin JWT>
```

Protected by existing admin middleware. Returns 401 for unauthenticated requests, 403 for non-admin authenticated requests.

### Dependency: exportJson Format

The BOM submission's `exportJson` must include per-item customization data. The BOM export logic will be updated to snapshot each placed item's `customization` JSON alongside its width/depth/qty. Existing BOM submissions without customization data will use the `PlacedItemCustomization` defaults at generation time.

### Flow

1. Load BOM submission by `submissionId` from `bom_submissions.exportJson`
2. Parse `exportJson` to extract `(width, depth, customization)` tuples with quantities; fall back to `PlacedItemCustomization` defaults for any missing fields
3. Deduplicate by effective config → produce `Map<configKey, { params, qty }>`
4. Create or update a `bom_generations` record with `status: 'generating'`
5. For each unique config: spawn `generate_bin.py` as a child process, output to `server/data/generated/bom-{submissionId}/`
6. After all STLs complete: run 3MF bundler — one `<object>` per unique STL, N `<item>` instances per object (where N = BOM quantity); items are given sequential X-axis offsets in their transform matrices (spaced by bin width + 5mm gap) so the slicer receives them pre-arranged in a row rather than all stacked at the origin
7. Update `bom_generations` record: `status: 'ready'`, populate `fileManifest` and `threeMfPath`
8. Return generation record

### File Storage

```
server/data/generated/
  bom-{submissionId}/
    bin_2x3x10.stl
    bin_1x2x6_labeled.stl
    ...
    bom-{submissionId}.3mf
```

### File Serving

```
GET /api/v1/admin/bom/:submissionId/files/:filename
Authorization: Bearer <admin JWT>
```

Same admin auth guard. Streams file from `server/data/generated/bom-{submissionId}/:filename`.

### 3MF Bundling

Built with Python's `zipfile` + a minimal 3MF XML template (no external library required). 3MF structure:

```
bom-{submissionId}.3mf  (ZIP)
  [Content_Types].xml
  _rels/.rels
  3D/
    model.model       ← one <object> per unique STL, N <item> entries per object
    bin_2x3x10.stl    ← mesh files embedded
    ...
```

---

## 3. Data Model

New table: `bom_generations`

| Column        | Type    | Notes                                              |
|---------------|---------|----------------------------------------------------|
| id            | integer | PK autoincrement                                   |
| submissionId  | integer | FK → bom_submissions.id, unique                    |
| status        | text    | `'pending' \| 'generating' \| 'ready' \| 'error'` |
| fileManifest  | text    | JSON: `[{filename, config, qty, stlPath}]`         |
| threeMfPath   | text    | Path to bundled .3mf                               |
| generatedAt   | text    | ISO timestamp                                      |
| errorMessage  | text    | Populated on error status                          |

The `fileManifest` drives the per-item download chips in the UI without requiring the frontend to re-derive config details.

---

## 4. Admin UI

Admin-only panel injected at the top of the existing BOM submission view (hidden from non-admin users via role check in frontend + enforced at API level).

### States

**Idle** — no generation record exists
- Blue info panel
- "Generate Files" button

**Generating** — `status: 'generating'`
- Amber panel
- "Generating… N of M configs complete" status line
- Button disabled

**Ready** — `status: 'ready'`
- Blue panel with timestamp ("Files generated · N unique configs · M items total · [date]")
- "↺ Regenerate" button
- Per-item STL download chips: `⬇ bin_2x3x10.stl ×4`
- Green "⬇ Download 3MF (M items)" button

**Error** — `status: 'error'`
- Red panel with error message
- "↺ Retry" button

---

## 5. Testing

### Unit Tests

- **`bom.service` — config extraction:** given `exportJson`, produces correct unique config list with quantities
- **`stlBundler` utility:** given STL paths + qty map, produces valid 3MF ZIP with correct `<object>` and `<item>` counts
- **Generation endpoint — subprocess args:** mocks child process spawner, asserts correct `generate_bin.py` argument construction per config

### Security Tests (direct API, not UI)

| Request | Expected |
|---------|----------|
| `POST /generate` — no auth | 401 |
| `POST /generate` — valid non-admin JWT | 403 |
| `POST /generate` — valid admin JWT | 202 |
| `GET /files/:filename` — no auth | 401 |
| `GET /files/:filename` — valid non-admin JWT | 403 |
| `GET /files/:filename` — valid admin JWT | 200 |

### E2E Tests

- Admin BOM page: panel visible to admin, hidden to regular users
- State transitions render correctly (mocked generation endpoint)
- Non-admin user: no Generate button visible; direct API call returns 403

### Integration Tests (`RUN_INTEGRATION_TESTS=1`)

- Full round-trip: submit BOM → trigger generation → verify STL files exist on disk → verify 3MF is a valid ZIP containing correct mesh count and item instances

---

## 6. Out of Scope

- Production Docker configuration for OpenSCAD
- User-facing STL downloads (admin only)
- Real-time generation progress (polling is sufficient for now)
- Per-item customization UI (defaults on placement only)
