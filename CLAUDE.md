# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication style
When reporting information, be extremely concise and sacrifice grammar for the sake of concision.


## Project Overview

Ordinus is a web application for customizing Gridfinity modular storage system components. Users can configure bin dimensions, drag-and-drop library items, manage reference images, generate a bill of materials, and export designs for 3D printing. The app supports user accounts, saved layouts, favorites, and on-demand STL generation.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Routing**: React Router v7
- **Data Fetching**: TanStack Query v5
- **Backend**: Express + TypeScript (Node 24)
- **Database**: SQLite via `@libsql/client` + drizzle-orm
- **Auth**: Customer profiles (no password auth — JWT/Argon2 removed)
- **Image Processing**: `sharp` (server), `html2canvas` (client)
- **PDF Generation**: jspdf + jspdf-autotable
- **Unit Testing**: Vitest + React Testing Library
- **E2E Testing**: Playwright
- **Linting**: ESLint

## Monorepo Structure

This is an npm workspaces monorepo:

```
app/        # React frontend (@gridfinity/app)
server/     # Express backend (@gridfinity/server)
shared/     # Shared types and utilities (@gridfinity/shared)
infra/      # Docker, Nginx, docker-compose
tools/      # Dev tools (gridfinity-generator)
```

## Commands

```bash
# Install dependencies
npm install

# Start frontend dev server (localhost:5173)
npm run dev

# Start backend dev server (separate terminal)
npm run server:dev

# Start backend in test mode (disables rate limiting)
npm run server:dev:test

# Build all packages for production
npm run build

# Seed the database
npm run server:seed

# Run linter
npm run lint

# Run all unit tests (frontend + server)
npm run test:run

# Run unit tests in watch mode
npm test

# Run E2E tests (against dev/preview server)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in debug mode
npm run test:e2e:debug

# Run E2E tests against Docker container (TARGET=docker)
npm run test:e2e:docker
```

## Frontend Architecture

```
app/src/
├── api/            # API client layer
│   ├── adapters/   # DataSourceAdapter pattern (api.adapter.ts, types.ts)
│   ├── generation.api.ts
│   ├── layouts.api.ts
│   └── ...         # Per-domain API modules
├── components/     # React components
│   └── share/      # Share feature components
├── contexts/       # React contexts (Customer, DataSource, Grid, Library, Settings, Workspace)
├── hooks/          # Custom React hooks
├── pages/          # Route-level page components
├── reducers/       # useReducer-based state (dialog, layoutMeta)
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── test/           # Test setup
```

### DataSourceAdapter Pattern

The frontend abstracts data fetching behind a `DataSourceAdapter` interface (`app/src/api/adapters/types.ts`). Only `ApiAdapter` exists — `StaticAdapter` was removed. The active adapter is provided via `DataSourceContext`; the `adapter?` prop is kept as a test seam. Providers are configured in `main.tsx` (not `App.tsx`). Hooks use `useDataSource()` combined with TanStack Query (`useQuery`/`useQueries`).

## Backend Architecture

```
server/src/
├── controllers/    # Route handlers (customers, library, layout, generation, favorites, ...)
├── db/             # drizzle schema, connection, migrations, seeding
├── middleware/     # CORS, rate limiting, error handling, validation, requestId
├── routes/         # Express router definitions
├── services/       # Business logic (STL pipeline, image, BOM generation, thumbnails, ...)
├── types/          # Server-side type definitions
└── utils/          # Server utilities
```

- API prefix: `/api/v1/`
- Endpoints: `libraries`, `items`, `categories`, `images`, `layouts`, `favorites`, `generation`, `customers`, `refImages`, `userStls`, `thumbnails`, `share`, `settings`, `health`, `bom`
- Logger: pino + pino-http. Tests mock logger with `pino({ level: 'silent' })` (NOT a plain object — pino-http requires a real pino instance)
- Drizzle `COUNT(*)` subqueries can fail with libsql; use a separate GROUP BY query + Map instead
- DB client: import `{ db }` from `server/src/db/connection.ts` (the `client.ts` shim was removed)

## Docker Deployment

The production stack runs via Docker Compose:

```bash
# Build and deploy
docker compose down && docker compose build --no-cache && docker compose up -d

# App available at localhost:32888
```

- `infra/Dockerfile` builds the full app
- `infra/nginx.conf` serves the frontend and proxies `/api` to the Express server
- `infra/docker-compose.yml` is the production compose file; `docker-compose.sample.yml` is the template

## Coding Standards

### TypeScript
- Use strict types; avoid `any`
- Define interfaces for component props
- Export shared types from `packages/shared/src/types.ts`; frontend-only types in `packages/app/src/types/`

### React Components
- Functional components only
- Props interface above component: `interface FooProps { ... }`
- Derive state when possible; avoid redundant state
- No setState during render or in useEffect (use derived state pattern)

### Naming Conventions
- Components: `PascalCase` (e.g., `GridPreview.tsx`)
- Hooks: `camelCase` with `use` prefix (e.g., `useGridItems.ts`)
- Utils: `camelCase` (e.g., `conversions.ts`)
- Tests: `*.test.ts(x)` for unit, `*.spec.ts` for E2E
- CSS classes: `kebab-case` (e.g., `.grid-container`)

### Code Style
- Keep functions small and focused
- Prefer early returns over nested conditionals
- Extract magic numbers to named constants
- No commented-out code; delete unused code

### Testing
- **Write tests first**: Create/update test cases before writing implementation code
- Unit test hooks and utilities
- E2E test user workflows
- Use page objects for E2E tests
- Mock external dependencies, not internal modules
- Tests mock logger with `pino({ level: 'silent' })` — NOT a plain object

## Git Workflow

Always follow gitflow conventions: never commit directly to main. Create feature branches off `develop`, open PRs to `develop`, and merge via PR. Only merge `develop` into `main` for releases. **Before merging `develop` into `main`, always pull both branches first** (`git pull origin main` and `git pull origin develop`) to ensure you have the latest remote state. When committing, verify all changed files are staged before committing (run `git status` to check for unstaged changes). No cherry-picking. **Never delete `main` or `develop` branches (local or remote).** If `develop` is missing, recreate it from `main` before creating any feature branches.

```bash
# Create feature branch
git checkout -b feat/description

# Create fix branch
git checkout -b fix/description

# Commit format
type(scope): description

# Examples:
feat(grid): add zoom controls
fix(library): resolve drag-drop on touch devices
refactor(hooks): simplify state management
```

## Testing

After any code change, run the full test suite before committing. When fixing test failures, avoid hardcoded mock data counts — use dynamic assertions where possible. After fixing tests, run them again to confirm no regressions.

Integration tests (e.g. `user-stl-processing.spec.ts`) are skipped unless `TARGET=docker` or `RUN_INTEGRATION_TESTS=1` is set — they run automatically via `npm run test:e2e:docker`.

## Bug Fixes & Debugging

When debugging rendering or visual issues, verify assumptions about the underlying data/model before implementing fixes. Ask clarifying questions about geometry, structure, or expected output rather than assuming. Don't dismiss differences as 'cosmetic' without verifying.

## Before Committing

1. Run `npm run lint` — fix all errors
2. Run `npm run test:run` — all unit tests pass
3. Keep commits focused; one logical change per commit

## Quality Gate for Merges

Before merging into `develop` or `main`:

1. `npm run test:run` — all unit tests pass
2. Docker rebuild: `docker compose down && docker compose build --no-cache && docker compose up -d`
3. Full E2E against container: `npm run test:e2e:docker` (needs `NODE_ENV=test` in docker-compose.yml temporarily to disable rate limiter)

## Key Files

### Frontend
- `app/src/components/GridPreview.tsx` — Main grid rendering and drop target
- `app/src/components/GridViewport.tsx` — Viewport with zoom/pan
- `app/src/hooks/useGridItems.ts` — Placed item state management
- `app/src/hooks/useGridTransform.ts` — Zoom and pan transform state
- `app/src/hooks/useLayouts.ts` — Saved layout management
- `app/src/api/adapters/types.ts` — DataSourceAdapter interface (ApiAdapter is the only impl)
- `app/src/contexts/DataSourceContext.tsx` — Adapter provider
- `app/src/contexts/CustomerContext.tsx` — Customer profile state (replaces AuthContext)
- `app/src/types/gridfinity.ts` — Core type definitions

### Backend
- `server/src/index.ts` — Express app entry point
- `server/src/db/schema.ts` — drizzle-orm database schema
- `server/src/db/connection.ts` — drizzle client (use this, not the removed client.ts shim)
- `server/src/services/generationPipeline.service.ts` — STL generation pipeline
- `server/src/services/stlProcessing.service.ts` — STL file processing

### Shared
- `shared/src/types.ts` — Shared TypeScript types
- `shared/src/errors.ts` — Shared error definitions
