# On-Demand STL Generation & Live Customization Preview

## Context

When a user tweaks bin customizations (wall pattern, lip style, cutout, height), the UI needs updated images reflecting those changes. The generated STL must also be used when the user exports a 3MF file. Library items backed by a `baseModel` (rather than a pre-built STL) need their assets generated on server start rather than being bundled statically.

---

## Directory Structure

Two subdirectories under the configured `GENERATED_DIR`:

```
generated/
  library/{param_hash}/     # permanent; written at seed time
    bin.stl
    ortho.png
    perspective_0.png
    perspective_90.png
    perspective_180.png
    perspective_270.png
  custom/{param_hash}/      # user customizations; subject to cleanup
    bin.stl
    ortho.png
    perspective_0.png
    perspective_90.png
    perspective_180.png
    perspective_270.png
    .accessed               # mtime updated each time assets are served
```

### Lookup order (both library and 3MF generation)

1. `library/{hash}` — exists → serve directly (covers exact-match-to-library case, no duplicate)
2. `custom/{hash}` — exists → serve directly
3. Neither → generate into `custom/{hash}`

---

## Param Hash

`sha256(canonicalJSON(allParams))` where `allParams` is the complete merged parameter set — library defaults plus user customization — not just the user-changeable fields. This ensures the hash reflects what OpenSCAD actually receives, so a library default change between server starts produces a new hash and triggers regeneration.

The hash is stored in the `param_hash` column on `library_items` (nullable) for library-seeded items.

---

## Library Seeding (server start)

For every library item that has a `baseModel` path but no explicit `stlFile`:

1. Compute `param_hash` from the item's full merged params.
2. Check `library/{hash}/ortho.png` — if present, skip (already done).
3. If missing, enqueue generation into `library/{hash}/`.
4. Store `param_hash` on the `library_items` row.
5. Delete any pre-existing static image/STL files for these items from the library's public folder (they are replaced by generated assets going forward).

**Seed-time cleanup of stale library hashes:**  
After all current items are processed, delete any `library/{hash}` directories whose hash is not present in the `param_hash` column of any current `library_items` row. This handles library default changes between server restarts.

---

## Generation Pipeline Service

`GenerationPipelineService extends EventEmitter` — single shared instance.

### State model (filesystem-as-state)

| Condition | Meaning |
|-----------|---------|
| Directory absent | Not started |
| Directory present, no `ortho.png`, no `error.txt` | In progress |
| `ortho.png` present | Done (all images and STL ready) |
| `error.txt` present | Failed |

### Job deduplication

In-memory `Map<hash, Promise<void>>`. If a request arrives for a hash already in the map, the caller awaits the existing promise. Promises are removed from the map on settle (success or failure).

### Pipeline steps

1. Spawn `generate_bin.py` with the full params JSON → `bin.stl`
2. Spawn `stl_to_png.py` → 5 images (ortho + 4 perspective rotations)
3. Write `error.txt` with the error message on any failure

### Events emitted

- `generation:complete` `{ hash, targetDir }` — both images and STL ready
- `generation:failed` `{ hash, targetDir, error }` — pipeline failed

---

## Server-Sent Events (SSE)

Single persistent SSE connection per client at `GET /api/v1/generation/events`.

The server pushes an event when any generation job settles:

```json
{ "type": "generation:complete", "hash": "abc123" }
{ "type": "generation:failed",   "hash": "abc123", "error": "OpenSCAD exited 1" }
```

The frontend maps `hash` back to the affected placed items or library items and updates state accordingly. No polling — clients subscribe on mount, unsubscribe on unmount.

---

## REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/generation/generate` | Enqueue generation for a param set; returns `{ hash }` immediately |
| `GET`  | `/api/v1/generation/status/:hash` | Current state: `pending \| complete \| failed` |
| `GET`  | `/api/v1/generation/image/:hash/:filename` | Serve image, touch `.accessed` |
| `GET`  | `/api/v1/generation/stl/:hash` | Serve STL, touch `.accessed` |
| `GET`  | `/api/v1/generation/events` | SSE stream |

---

## Frontend: Placed Item Overlay

When a user changes a customization:

1. Dismiss the customization panel immediately.
2. Compute the new full params (library defaults merged with customization).
3. `POST /api/v1/generation/generate` → get `hash`.
4. Store `{ instanceId → { hash, status: 'pending' } }` in transient layout context (`generatedImages` map).
5. Overlay renders a spinner for any placed item whose hash status is `pending`.
6. SSE `generation:complete` → update status to `complete`, swap spinner for generated image.
7. SSE `generation:failed` → update status to `failed`, show red ✕ icon.

The `generatedImages` map is transient (not persisted to localStorage). On page reload, placed items with a customization re-request their images, which are served from cache if the hash already exists on disk.

---

## Frontend: Library Panel

Library items backed by `baseModel` show a spinner as their preview image until `library/{hash}/ortho.png` is available. The same SSE stream drives the update — when `generation:complete` fires for a hash matching a library item's `param_hash`, the library panel swaps the spinner for the generated image.

---

## Auth Gate

Opening the customization panel requires authentication. If `isAuthenticated` is false:

1. Redirect (or navigate) with `?authRequired=1`.
2. `AppShell` reads the param → opens `AuthModal`.
3. After successful login, the user is returned to their layout and may open the panel.

Anonymous users see the library and can place items; they cannot customize.

---

## 3MF Export

When building the 3MF archive, for each placed item that has a customization:

1. Compute `param_hash` for the item's full params.
2. Check `library/{hash}/bin.stl` then `custom/{hash}/bin.stl`.
3. If found, include in the 3MF.
4. If not found (e.g. user exported before generation finished), generate synchronously before packaging — or exclude with a warning if generation fails.

---

## Cleanup

### Custom dir — time-based (no server-start dependency)

`setInterval` runs every 24 hours. For each directory under `generated/custom/`:

- Read `.accessed` mtime.
- If older than 30 days → delete the directory.
- If `.accessed` is absent → fall back to the directory's own mtime.

### Library dir — seed-time only

Stale `library/{hash}` dirs (hash not present in any `library_items.param_hash`) are deleted during the seeding pass on server start. No time-based cleanup runs against `library/`.

---

## Key Files

| File | Change |
|------|--------|
| `packages/server/src/services/generationPipeline.service.ts` | New — `GenerationPipelineService`, job map, events |
| `packages/server/src/services/generationCleanup.service.ts` | New — `setInterval` cleanup of `custom/` |
| `packages/server/src/routes/generation.routes.ts` | New — REST + SSE endpoints |
| `packages/server/src/db/reseedLibraries.ts` | Modified — generate library assets, seed-time cleanup, store `param_hash` |
| `packages/server/src/db/schema.ts` | Modified — add `param_hash` column to `library_items` |
| `packages/app/src/contexts/WorkspaceContext.tsx` (or layout context) | Modified — `generatedImages` transient map |
| `packages/app/src/hooks/useGenerationEvents.ts` | New — SSE subscription hook |
| `packages/app/src/components/PlacedItemOverlay.tsx` | Modified — spinner/error state driven by generation status |
| `packages/app/src/components/LibraryItemCard.tsx` | Modified — spinner while library hash pending |
| `packages/app/src/components/BinCustomizationPanel.tsx` | Modified — auth gate before opening |
