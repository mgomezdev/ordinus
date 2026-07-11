# Ordinus — Contributor Reference

Ordinus is the gridfinity bin layout tool. Users arrange library bins on a configurable grid, generate 3MF print files, and optionally send jobs to Themis for printing.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20 / TypeScript / Express 4 |
| Database | SQLite via `@libsql/client` (raw) + `drizzle-orm/libsql` (ORM) |
| Frontend | React 19 / TypeScript / Vite |
| Bin generation | Python 3 + OpenSCAD (AppImage in Docker) |
| Container | nginx (port 80) → Express (port 3001), single Docker image |

---

## Repo Layout

```
gridfinity-customizer/
├── app/                        # React frontend (Vite)
│   └── src/
│       ├── api/                # Fetch-based API clients
│       ├── contexts/           # React context providers
│       ├── components/         # Shared UI components
│       └── App.tsx             # Routes + SettingsProvider root
├── server/                     # Express backend
│   └── src/
│       ├── index.ts            # Entry point — startup sequence
│       ├── app.ts              # createApp() — middleware + routes
│       ├── config.ts           # Zod-validated env vars
│       ├── db/
│       │   ├── connection.ts   # libsql client + drizzle instance
│       │   ├── migrate.ts      # Migration runner (versioned)
│       │   ├── migrate-cli.ts  # CLI entry for db:migrate / db:rollback
│       │   └── migrations/
│       │       ├── 001_baseline.ts
│       │       └── 002_settings.ts
│       ├── routes/             # Express routers (one file per resource)
│       ├── controllers/        # Request validation + handler logic
│       └── services/           # DB access + business logic
├── shared/                     # @gridfinity/shared — types used by both sides
│   └── src/
│       ├── types.ts            # BOMItem, ApiLayout, BinCustomization, etc.
│       └── errors.ts
├── generator/                  # Python + OpenSCAD bin generation
│   ├── generate_bin.py         # Single bin STL generation
│   ├── bundle_3mf.py           # BOM → full 3MF archive
│   └── gridfinity_basic_cup.scad
├── infra/
│   ├── Dockerfile              # Multi-stage: build → nginx+node+openscad runtime
│   └── nginx.conf              # / → frontend, /api/v1 → Express :3001
└── tools/
    └── library-builder/        # Python tool: builds library catalog JSON from assets
```

---

## Running Locally

```bash
# Install all workspaces from repo root
npm install

# Terminal 1 — backend (hot reload)
cd server && npm run dev

# Terminal 2 — frontend (hot reload)
cd app && npm run dev

# DB migrations (run once, or after pulling new migrations)
cd server && npm run db:migrate
```

Backend runs on `:3001`. Frontend proxies `/api/v1` to `:3001` via Vite config.

Docker (production image):
```bash
cd infra && docker compose up
# or from Concordia:
docker compose -f docker-compose.yml -f docker-compose.local.yml up
```

---

## Architecture

### Request → Response flow

```
Browser
  └─ fetch /api/v1/<resource>
       └─ nginx (port 80, Docker only)
            └─ Express app (port 3001)
                 └─ route file (routes/<resource>.routes.ts)
                      └─ controller (controllers/<resource>.controller.ts)
                           ├─ Zod validation of request body
                           └─ service call (services/<resource>.service.ts)
                                └─ DB query via drizzle `db` or raw `client`
```

### DB access

`server/src/db/connection.ts` exports two things:
- `db` — Drizzle ORM instance (used by most services for typed queries)
- `client` — raw libsql `Client` (used for migrations and a few raw SQL operations)

Most service files import `db`. The migration runner uses `client`.

### Frontend state model

```
App
└─ SettingsProvider          (polls service health every 15s)
   └─ BrowserRouter
      └─ AppShell
         └─ WorkspaceProvider    (master context: all workspace state)
            ├─ GridDimensionsContext   (dimensions, spacer config, grid result)
            ├─ LibraryContext          (library items, categories)
            └─ CustomerContext         (customer CRUD, persisted selection)
```

`WorkspaceContext` is the central store for the workspace screen. It composes ~15 internal hooks and re-exports focused slices via `GridDimensionsContext` and `LibraryContext`. Always use `useWorkspace()` for workspace operations; use the narrower contexts only when a component provably doesn't need the full workspace.

---

## Routes Reference

All routes mount under `/api/v1`. Route files live in `server/src/routes/`.

| Resource | File | Key operations |
|---|---|---|
| Health | `health.routes.ts` | `GET /health`, `GET /health/ready` |
| Libraries | `libraries.routes.ts` | CRUD for library definitions + items + image upload |
| Categories | `categories.routes.ts` | `GET /categories` |
| Layouts | `layouts.routes.ts` | CRUD + clone + reference image attach |
| Shared | `shared.routes.ts` | Slug-based public layout sharing |
| BOM | `bom.routes.ts` | Generate 3MF, poll status, serve files, send to Themis |
| Generation | `generation.routes.ts` | Per-item preview generation + SSE progress stream |
| Ref images | `refImages.routes.ts` | Global reusable reference image library |
| User STLs | `userStls.routes.ts` | Upload, reprocess, download user-provided STL/3MF parts |
| Favorites | `favorites.routes.ts` | Saved bin configurations |
| Customers | `customers.routes.ts` | Customer profiles + part/image associations |
| Settings | `settings.routes.ts` | `GET/PATCH /settings`, `GET /settings/health` |

---

## Key Code Paths

### 1. Generating a BOM 3MF

```
POST /api/v1/bom/generate/:layoutId
  → bomGeneration.controller.ts :: generateHandler()
  → bomGeneration.service.ts :: triggerGeneration()
      → resolveItemSources()         (decide: copy static STL vs generate parametric)
      → runGenerationPipeline()      (spawn generate_bin.py per item, then bundle_3mf.py)
      → writes to GENERATED_STL_DIR
      → updates bom_generations table (status: pending → complete)
```

Polling: `GET /api/v1/bom/generation/:layoutId` reads the `bom_generations` row.

### 2. Sending a layout to Themis

```
POST /api/v1/bom/send-to-themis/:layoutId
  → themis.controller.ts :: sendToThemisHandler()
      → reads BOM generation + generated STL files
      → themis.service.ts :: uploadStlToThemis()    (POST file to Themis /api/v1/files/upload)
      → themis.service.ts :: createThemisProject()  (POST /api/v1/projects)
      → themis.service.ts :: addThemisProjectItem() (POST /api/v1/projects/:id/items per STL)
      → writes themisProjectId back to bom_generations row
```

Themis URL is read from the `settings` DB table (key: `themis_url`), not from env. This is set via `PATCH /api/v1/settings`.

### 3. Per-item bin preview generation

```
POST /api/v1/generation/generate
  → generationPipeline.service.ts :: GenerationPipelineService
      → hash params → check cache (GENERATED_STL_DIR/custom/<hash>/)
      → if miss: spawn Python process (server/scripts/py/generate_preview.py)
                  which calls OpenSCAD → produces .stl + ortho/persp PNGs
      → emits 'generation:complete' event → SSE pushed to browser
```

SSE stream: `GET /api/v1/generation/events` — clients listen here for completion signals.

### 4. Service health polling

```
GET /api/v1/settings/health
  → settings.routes.ts
  → reads themis_url + laminus_url from settings table
  → server-side fetch to <url>/api/v1/health (Themis) and <url>/api/health (Laminus)
  → returns { themis: 'up'|'down'|'unconfigured', laminus: 'up'|'down'|'unconfigured' }
```

The frontend `SettingsContext` polls this every 15 seconds. Health status gates the Generate and Send to Themis buttons in `BomGenerationPanel.tsx`.

---

## Adding a New Route

1. Create `server/src/routes/widgets.routes.ts`:
```ts
import { Router } from 'express';
import { listWidgets, createWidget } from '../controllers/widgets.controller.js';

const router = Router();
router.get('/', listWidgets);
router.post('/', createWidget);
export default router;
```

2. Create `server/src/controllers/widgets.controller.ts` with Zod validation and calls to services.

3. Create `server/src/services/widgets.service.ts` with DB logic using `db` from `../db/connection.js`.

4. Register in `server/src/app.ts`:
```ts
import widgetsRoutes from './routes/widgets.routes.js';
app.use('/api/v1/widgets', widgetsRoutes);
```

5. Add API client in `app/src/api/widgets.api.ts` using `apiFetch` from `apiClient.ts`.

---

## DB Migrations

### How it works

- `schema_migrations` table tracks applied versions (version, name, applied_at)
- Runner in `server/src/db/migrate.ts` applies pending migrations in version order at startup
- Each migration file in `server/src/db/migrations/` exports `version`, `name`, `up()`, `down()`

### Adding a migration

1. Create `server/src/db/migrations/003_my_change.ts`:
```ts
import type { Client } from '@libsql/client';

export const version = 3;
export const name = 'my_change';

export async function up(client: Client): Promise<void> {
  await client.execute(`ALTER TABLE layouts ADD COLUMN priority INTEGER DEFAULT 0`);
}

export async function down(client: Client): Promise<void> {
  // SQLite 3.35+: ALTER TABLE layouts DROP COLUMN priority
  // Or recreate the table if needed
}
```

2. Register it in `server/src/db/migrate.ts`:
```ts
import * as m003 from './migrations/003_my_change.js';
const MIGRATIONS: Migration[] = [m001, m002, m003].sort((a, b) => a.version - b.version);
```

3. Run:
```bash
cd server && npm run db:migrate   # apply pending
cd server && npm run db:rollback  # roll back latest (dev only)
```

Migrations auto-apply on server startup — no manual step needed in production.

### Rules
- Never edit an applied migration file — add a new one instead
- `up()` should be idempotent where possible (`IF NOT EXISTS`, `try/catch` on ALTER)
- `down()` for destructive drops is acceptable (rollbacks are dev-only operations)
- Version numbers must be globally unique integers within this repo

---

## Environment Variables

Defined and validated in `server/src/config.ts` via Zod:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Express listen port |
| `DB_PATH` | `./data/gridfinity.db` | SQLite file path (`/config/gridfinity.db` in Docker) |
| `IMAGE_DIR` | `./data/images` | Library item images |
| `USER_STL_DIR` | `./data/user-stls` | Uploaded STL files |
| `USER_STL_IMAGE_DIR` | `./data/user-stl-images` | STL preview renders |
| `GENERATED_STL_DIR` | `./data/generated` | Generated bin STLs + 3MF archives |
| `THUMBNAIL_DIR` | `./data/thumbnails` | Layout SVG thumbnails |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `THEMIS_URL` | *(unset)* | Deprecated — use settings DB table instead |
| `MAX_STL_WORKERS` | `2` | Python generation worker concurrency |
| `LOG_LEVEL` | `info` | Pino log level |

Frontend env (in `app/.env` or `app/.env.local`):
| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001/api/v1` | API base URL |

---

## Shared Types

`shared/src/types.ts` (`@gridfinity/shared`) defines types used by both the server and frontend:

- `BOMItem` — a bin entry in the bill of materials
- `ApiLayout` / `ApiLayoutDetail` — layout API response shapes
- `BinCustomization` — per-placed-item OpenSCAD parameter overrides
- `GridSpacerConfig` — spacer configuration for grid dimensions
- `ApiBomGeneration` — BOM generation status response
- `ApiUserStl` — user-uploaded STL metadata

Import these from `@gridfinity/shared` in both server and frontend code rather than duplicating type definitions.

---

## Known Gotchas

- **No active auth.** The `users` and `refresh_tokens` tables and JWT env vars exist for backward compatibility but all routes are unauthenticated.
- **Two generation systems.** Per-item preview (`/api/v1/generation`) and full BOM 3MF export (`/api/v1/bom`) are separate pipelines. Don't confuse them.
- **Settings not env.** Themis URL and Laminus URL are stored in the `settings` DB table, not env vars. `THEMIS_URL` env is still read as a seed value for the initial row but the DB value takes precedence afterward.
- **Docker DB path.** In Docker, the DB lives at `/config/gridfinity.db` (named volume `ordinus-config`). Locally it defaults to `./data/gridfinity.db`.
