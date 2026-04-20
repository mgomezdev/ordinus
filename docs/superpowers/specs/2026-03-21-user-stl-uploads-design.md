# User STL/3MF Upload — Design Spec
**Date:** 2026-03-21
**Status:** Approved

---

## Overview

Replace the shadowbox creation feature with a personal STL/3MF upload system. Logged-in users can upload their own Gridfinity models, which are processed server-side to detect grid dimensions and generate preview images. Items appear in a personal orange-colored library section. Admins can retrigger processing and promote items to the shared static library.

---

## What Gets Removed

All shadowbox functionality is deleted:

**Frontend:**
- `ShadowboxUploadPage.tsx`, `ShadowboxEditorPage.tsx`, `ShadowboxLibrarySection.tsx`
- `/shadowbox/new`, `/shadowbox/edit` routes in `App.tsx`
- `useShadowboxes.ts` hook
- `shadowboxes.api.ts` client
- `shadowboxPhotoStore.ts` utility
- `navigate.ts` utility (was only used for shadowbox routing)
- Shadowbox-related code in `useLibraryData.ts`, `useBillOfMaterials.ts`, `PlacedItemOverlay.tsx`

**Backend:**
- `shadowboxes.routes.ts`, `adminShadowboxes.routes.ts`
- `shadowboxes.controller.ts`, `adminShadowboxes.controller.ts`
- `shadowboxes.service.ts`
- `shadowboxes` DB table (migration to drop)

**Shared types:**
- `ApiShadowbox`, `ApiShadowboxAdmin`
- `shadowboxId` field on `BOMItem`

**Infrastructure:**
- `shadowbox-sidecar/` — entire directory removed

---

## Data Model

### New table: `user_stl_uploads`

```sql
id               TEXT  NOT NULL PRIMARY KEY   -- UUID (server-generated)
userId           INT   NOT NULL REFERENCES users(id)
name             TEXT  NOT NULL               -- display name, user-editable
originalFilename TEXT  NOT NULL               -- original uploaded filename
filePath         TEXT  NOT NULL               -- absolute path to stored STL/3MF
imageUrl         TEXT                         -- orthographic preview filename (relative)
perspImageUrls   TEXT                         -- JSON array: 4 perspective filenames [p0, p90, p180, p270]
gridX            INT                          -- auto-detected or user-corrected
gridY            INT                          -- auto-detected or user-corrected
status           TEXT  NOT NULL               -- 'pending' | 'processing' | 'ready' | 'error'
errorMessage     TEXT                         -- populated on processing error
createdAt        TEXT  NOT NULL               -- ISO timestamp
updatedAt        TEXT  NOT NULL               -- ISO timestamp
```

**File storage:**
- Uploaded files: `packages/server/data/user-stls/{userId}/{id}.{ext}`
- Preview images: `packages/server/data/user-stl-images/{userId}/{id}.png` (ortho), `{id}-p0.png`, `{id}-p90.png`, `{id}-p180.png`, `{id}-p270.png` (perspective)

**Upload quota:** A `maxUserStls` field is added to `userStorage` (default: 50). Checked on `POST /api/v1/user-stls` — upload is rejected with 409 if the user's current upload count meets or exceeds the limit.

### Shared types (`packages/shared/src/types.ts`)

```typescript
export interface ApiUserStl {
  id: string;
  name: string;
  gridX: number | null;
  gridY: number | null;
  imageUrl: string | null;
  perspImageUrls: string[];      // up to 4 rotation previews: [p0, p90, p180, p270]
  status: 'pending' | 'processing' | 'ready' | 'error';
  errorMessage: string | null;
  createdAt: string;
}

export interface ApiUserStlAdmin extends ApiUserStl {
  userId: number;
  userName: string;
  originalFilename: string;
  updatedAt: string;             // useful for sorting by last-processed in admin table
}
```

**Color:** Always orange (`#F97316`). Not stored — hardcoded in `userStlToLibraryItem`.

---

## Processing Pipeline

### Python scripts: `packages/server/scripts/py/`

```
packages/server/scripts/py/
├── requirements.txt          # Python dependencies
├── process_stl.py            # CLI entry point — called by Node
└── lib/
    ├── detect_dimensions.py  # bounding box ÷ 42mm → gridX, gridY (STL + 3MF)
    └── render_previews.py    # STL/3MF → 1 ortho PNG + 4 perspective PNGs
```

**`process_stl.py` interface:**

```bash
python3 process_stl.py --input /path/to/file.stl --output-dir /path/to/images --id abc123
```

Outputs JSON to stdout on success:
```json
{
  "gridX": 2,
  "gridY": 1,
  "imageUrl": "abc123.png",
  "perspImageUrls": ["abc123-p0.png", "abc123-p90.png", "abc123-p180.png", "abc123-p270.png"]
}
```

Exits non-zero with error message to stderr on failure. Node reads stderr and stores it as `errorMessage` in the DB.

**`detect_dimensions.py`:**
Loads geometry via `numpy-stl` (STL) or `trimesh` (3MF), computes bounding box extents, applies `ceil(extent / 42.0)` for both axes. This is a geometry-based approach — works regardless of filename convention.

**`render_previews.py`:**
Adapted from `tools/library-builder/stl_to_png.py`. Renders:
- 1 orthographic (top-down) PNG: `{id}.png`
- 4 perspective PNGs at 0°, 90°, 180°, 270° Z-axis rotation: `{id}-p0.png`, `{id}-p90.png`, `{id}-p180.png`, `{id}-p270.png`

**File validation (magic bytes):**
`process_stl.py` validates the actual file header before processing:
- Binary STL: 80-byte header (no magic, but not starting with `solid` — checked by attempting ASCII parse fallback)
- ASCII STL: starts with `solid`
- 3MF: ZIP container, first bytes `PK\x03\x04`
Script exits non-zero immediately if the file header does not match an expected format, regardless of file extension. This prevents arbitrary files renamed to `.stl` from being processed.

**`requirements.txt`:**
```
numpy-stl>=3.0.0
trimesh>=4.0.0
lxml>=4.9.0
matplotlib>=3.5.0
numpy>=1.21.0
pillow>=9.0.0
networkx>=3.0
```

### Node.js services

**`stlProcessing.service.ts`:**
Spawns `process_stl.py` as a child process, pipes stdout/stderr, parses JSON result, updates DB row to `ready` (with image paths + grid dims) or `error` (with errorMessage).

**`stlQueue.service.ts`:**
Simple in-memory semaphore. Configurable via `MAX_STL_WORKERS` env var (default: 2). Jobs beyond the concurrency limit wait in an in-memory array.

```typescript
class StlQueue {
  private running = 0;
  private queue: Array<() => void> = [];
  enqueue(job: () => Promise<void>): void { ... }
}
```

**Startup recovery:** On server boot, rows with `status = 'processing'` or `status = 'pending'` are both reset to `'pending'` and re-enqueued. This handles graceful restarts (pending jobs lost from memory) and crash recovery (stuck processing jobs) identically. The in-memory queue is intentionally non-persistent; the DB is the source of truth.

### Container setup

Root-level `Dockerfile`:
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
COPY packages/server/scripts/py/requirements.txt /app/scripts/py/requirements.txt
RUN pip3 install --no-cache-dir -r /app/scripts/py/requirements.txt
# ... rest of Node app setup
WORKDIR /app
COPY . .
RUN npm ci && npm run build
CMD ["node", "packages/server/dist/index.js"]
```

`.env.example` documents: `MAX_STL_WORKERS=2`

---

## API Endpoints

### User endpoints (`/api/v1/user-stls`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/` | user | Upload STL/3MF (multipart, 50MB limit). Checks upload quota. Creates `pending` row, enqueues processing. Returns `ApiUserStl` immediately. |
| `GET` | `/` | user | List current user's uploads |
| `GET` | `/:id` | user | Get single upload |
| `PUT` | `/:id` | owner or admin | Edit name, gridX, gridY |
| `DELETE` | `/:id` | owner or admin | Delete record + all files on disk |
| `PUT` | `/:id/file` | owner or admin | Replace STL/3MF file. Resets status to `pending`, re-enqueues. |
| `POST` | `/:id/reprocess` | owner or admin | Retrigger image generation. Resets status to `pending`, re-enqueues. |
| `GET` | `/:id/file` | owner or admin | Stream original STL/3MF with `Content-Disposition: attachment`. |
| `GET` | `/:id/images/:filename` | owner or admin | Serve a preview image file. Applies path traversal guard (same pattern as existing `images.routes.ts`). |

**Ownership check (applied to all owner-or-admin endpoints):**
```typescript
if (req.user.userId !== upload.userId && req.user.role !== 'admin') {
  return res.status(403).json({ error: 'Forbidden' });
}
```
Note: `req.user.userId` (not `req.user.id`) matches the existing auth middleware shape.

**File upload validation:**
1. Extension must be `.stl` or `.3mf` (checked before writing to disk)
2. Magic-byte validation occurs inside `process_stl.py` before any processing; if it fails, the row is set to `error` immediately

**Image serving security:** `GET /:id/images/:filename` must apply the same traversal guard already in `images.routes.ts`:
```typescript
if (filename.includes('..') || filename.includes('/') || filename.includes('\0')) {
  return res.status(400).json({ error: 'Invalid filename' });
}
const resolved = path.join(imageDir, filename);
if (!resolved.startsWith(imageDir)) {
  return res.status(400).json({ error: 'Invalid path' });
}
```

### Admin endpoints (`/api/v1/admin/user-stls`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all users' uploads (`ApiUserStlAdmin[]`) |
| `POST` | `/:id/promote` | Export item to `public/libraries/user-uploads/`, update `index.json` |

**Promote flow (server-side):**
1. Copy STL/3MF + all images to `public/libraries/user-uploads/`
2. Read (or create) `public/libraries/user-uploads/index.json`
3. Append item entry: id, name, widthUnits, heightUnits, imageUrl, perspImageUrls (all 4 rotations)
4. Atomic write: write to temp file, rename over existing
5. Return success

---

## Frontend

### Removed
All shadowbox components, hooks, routes, and API client (listed in "What Gets Removed").

### Added

**`UserStlLibrarySection`** (sidebar, items tab, visible when authenticated):
- Lists user's uploads. Status badges: spinner for `pending`/`processing`, warning + error tooltip for `error`, draggable card for `ready`
- Empty state: "No models yet — upload your first one"
- "Upload model" button opens `UserStlUploadModal`
- Each item has an edit (pencil) button that opens `UserStlEditModal`

**`UserStlUploadModal`** (modal — no separate route, avoids page-reload auth issues):
- Fields: file picker (`.stl`/`.3mf`), name (pre-filled from filename, editable)
- Validation: file required, name required, file extension check client-side
- On submit: modal closes immediately, item appears in library with processing spinner
- Error state: if upload API call itself fails, modal shows inline error

**`UserStlEditModal`**:
- Fields: name, gridX, gridY (pre-filled from detected values, editable)
- Actions: Save, Replace file (file picker, re-uploads), Delete (confirm dialog)
- Admins additionally see: Reprocess button
- Error state shown inline if any action fails

**Hooks/API client:**
- `useUserStls.ts` — `useUserStlsQuery` (list), plus mutations: upload, edit, delete, reprocess, replaceFile
- `userStls.api.ts` — typed API client functions, image URL helper (`getUserStlImageUrl(id, filename)`)

**Library integration:**
`useLibraryData` calls `userStlToLibraryItem` to convert `ready` uploads to `LibraryItem` entries:
```typescript
function userStlToLibraryItem(item: ApiUserStl): LibraryItem {
  return {
    id: `user-stl:${item.id}`,
    name: item.name,
    widthUnits: item.gridX ?? 1,
    heightUnits: item.gridY ?? 1,
    color: '#F97316',   // orange, always
    categories: ['user-upload'],
    imageUrl: item.imageUrl ? getUserStlImageUrl(item.id, item.imageUrl) : undefined,
    perspectiveImageUrl: item.perspImageUrls[0]
      ? getUserStlImageUrl(item.id, item.perspImageUrls[0])
      : undefined,
  };
}
```

---

## Admin Panel

New "User Models" tab in `AdminSubmissionsDialog`:

- Table columns: username, filename, name, grid dimensions, status, updatedAt
- Error rows show `errorMessage` inline (truncated with tooltip for long messages)
- Per-row actions:
  - **Reprocess** — always available; resets to `pending` and re-enqueues
  - **Edit** — opens `UserStlEditModal` (same component, admin gets Reprocess button)
  - **Download** — streams original STL/3MF via `GET /:id/file`
  - **Delete** — removes record + files (confirm dialog)
  - **Promote** — visible only on `ready` items; writes to static library

The existing submissions badge and layout submissions tab are unchanged.

---

## Testing Strategy

**Unit tests:**
- `stlQueue.service.ts` — semaphore concurrency limit enforced, startup recovery resets `pending` + `processing` rows
- `stlProcessing.service.ts` — child process spawn, stdout JSON parsing, stderr captured as errorMessage (mock `child_process.spawn`)
- `userStls.service.ts` — DB CRUD, quota check
- `UserStlUploadModal` — renders fields, validates extension client-side, shows error on API failure, closes on success
- `UserStlLibrarySection` — renders pending/processing/error/ready states, empty state
- `UserStlEditModal` — pre-fills values, save/delete/reprocess actions

**E2E tests:**
- **Upload → ready flow:** select `.stl` file → modal closes → item shows processing → polling resolves to ready → item appears draggable in grid
- **Edit metadata:** correct gridX/gridY → item updates in grid with new dimensions
- **Error state + admin reprocess:** mock processing failure → item shows error badge with message → admin reprocesses → item eventually becomes ready
- **Admin promote:** ready item in admin tab → promote → item appears in shared library on reload
- **Quota enforcement:** uploading beyond `maxUserStls` returns 409 error shown in modal
