# Saved Config Thumbnail Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a layout is saved, generate a shaded-grid SVG thumbnail and store it alongside the config so Saved Configs cards display a visual preview of the layout.

**Approach:** Server-side SVG generation at save time, stored as a file, served via an auth-gated route, URL included in the list API response. No live computation at page load.

---

## Storage

- New nullable column `thumbnail_path TEXT` added to the `layouts` table via migration.
- Thumbnail files live at `<DATA_DIR>/thumbnails/<layoutId>.svg`. The directory is created on server startup if absent (same pattern as `IMAGE_DIR`).
- A new `THUMBNAIL_DIR` config var is derived from `DATA_DIR` (e.g. `path.join(DATA_DIR, 'thumbnails')`). No new env var needed.
- The column stores only the filename (`<layoutId>.svg`); the full path is assembled at runtime.
- `ApiLayout` gains a new nullable field: `thumbnailUrl: string | null`. The list and detail endpoints set this to `/api/v1/thumbnails/<layoutId>` when a path is recorded, `null` otherwise.
- Existing layouts without a thumbnail return `thumbnailUrl: null` and render the fallback empty-grid SVG on the card.

---

## SVG Generation

A pure function `generateThumbnailSvg(gridX, gridY, placedItems, colorMap)` returns an SVG string. No external dependencies.

**Layout:**
- Cell size: 8px. Padding: 3px on all sides.
- ViewBox: `(gridX * 8 + 6) × (gridY * 8 + 6)`.
- All cards use a fixed 140px-tall container; the SVG scales to fit via its viewBox (large grids appear as compressed minimaps — consistent with current behavior).

**Rendering:**
1. Background: one light-gray rect per cell (matching existing `.grid-cell` styling).
2. For each placed item, draw a colored rect over the cells it occupies.
   - Fill: `LibraryItem.color` at 85% opacity (`fill-opacity="0.85"`) so cell borders remain faintly visible.
   - Border: a 1px rect stroke in the same color at full opacity.
   - `rx="1"` for slightly rounded corners.
3. **Rotation:** at 0°/180° the item occupies `width × height` cells starting at `(x, y)`; at 90°/270° it occupies `height × width` cells starting at `(x, y)`.

**Color lookup:** Before generating, the service queries `library_items` for all distinct `libraryId/itemId` pairs present in the placed items and builds a `Map<"libraryId:itemId", string>` (hex color). Items not found in the map fall back to `#3B82F6` (the app's default valid-item color).

---

## Server Changes

### New: `LayoutThumbnailService`

`packages/server/src/services/layoutThumbnail.service.ts`

```
ensureDir(): Promise<void>
  — creates THUMBNAIL_DIR if absent; called on server startup

generate(layoutId, gridX, gridY, placedItems): Promise<void>
  — queries library_items for colors
  — calls generateThumbnailSvg
  — writes <layoutId>.svg to THUMBNAIL_DIR
  — updates thumbnail_path on the layout row

delete(layoutId): Promise<void>
  — deletes <THUMBNAIL_DIR>/<layoutId>.svg if it exists (idempotent)
  — clears thumbnail_path on the layout row
```

### Modified: Layout Service / Controller

- **POST /layouts** (create): call `generate` after insert.
- **PATCH /layouts/:id** (update): call `generate` after update (overwrites existing file).
- **DELETE /layouts/:id** (delete): call `delete` before or after row deletion; must succeed even when no thumbnail exists.

### New route

`GET /api/v1/thumbnails/:layoutId`
- Auth-gated (user must own the layout, or be admin).
- Sends the `.svg` file from `THUMBNAIL_DIR`.
- Returns 404 if file not found.

---

## Client Changes

`SavedConfigCard` renders a `LayoutThumbnail` component:

```
LayoutThumbnail({ thumbnailUrl, gridX, gridY })
  — if thumbnailUrl is non-null:
      <img src={thumbnailUrl} alt="" aria-hidden
           style="width:100%; height:100%; object-fit:contain" />
  — if thumbnailUrl is null:
      existing empty-grid SVG fallback (unchanged)
```

No new API calls. `thumbnailUrl` arrives via the existing list query.

---

## Testing

### Unit — `generateThumbnailSvg`
- Correct viewBox dimensions for given gridX/gridY.
- Placed item rect covers the correct cells at 0° rotation.
- Placed item rect covers the correct (swapped) cells at 90° rotation.
- Falls back to default color when item not in colorMap.

### Unit — `LayoutThumbnailService`
- `generate` writes the SVG file and sets `thumbnail_path` in the DB.
- `generate` on update overwrites the existing file.
- **`delete` removes the thumbnail file when a layout is deleted.**
- **`delete` is idempotent — no error when no file exists** (covers null-thumbnail layouts).

### Integration — layout routes
- `POST /layouts` → thumbnail file exists on disk afterward.
- `PATCH /layouts/:id` → thumbnail file is updated.
- **`DELETE /layouts/:id` → returns 200 and thumbnail file no longer exists on disk.**
- `GET /api/v1/thumbnails/:layoutId` → serves SVG for owner; returns 403 for other users; returns 404 when no thumbnail.

### Unit — `LayoutThumbnail` component
- Renders `<img>` when `thumbnailUrl` is provided.
- Renders fallback SVG grid when `thumbnailUrl` is null.
