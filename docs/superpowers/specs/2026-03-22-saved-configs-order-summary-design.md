# Saved Configs Full Page & Order Summary Page — Design Spec

**Date:** 2026-03-22
**Tasks:** #50 (Saved Configs full page), #51 (Order Summary / BOM full page)
**Design system:** DrawerArchitect (Inter, #007AFF, #f8f9fa, 4px radius, dark status bar)

---

## Goal

Convert two existing modal flows into full-page views accessible via React Router:

1. **Saved Configs** (`/configs`) — browse, edit, duplicate, delete, and submit saved layouts
2. **Order Summary** (`/order`) — review BOM with pricing, export PDF, and submit the current layout

---

## Architecture

### New Dependency

`react-router-dom` v6 must be added to `packages/app/package.json`. Install with:
```bash
npm install react-router-dom --workspace=packages/app
```

### Route Structure

Three routes under a persistent `AppShell`:

| Route | Component | Auth required |
|-------|-----------|---------------|
| `/` | `WorkspacePage` | No |
| `/configs` | `SavedConfigsPage` | Yes |
| `/order` | `OrderSummaryPage` | Yes |

`App.tsx` becomes thin: sets up `<BrowserRouter>` + `<Routes>` + `<AppShell>`.

### AppShell (`src/AppShell.tsx`)

Sits **inside** `<BrowserRouter>` (so it can use router hooks). Renders:
- Top nav bar with `<NavLink>` tabs
- `<WorkspaceProvider>` wrapping `<Outlet>` and the status bar
- Bottom status bar
- All global dialogs (SaveLayoutDialog, RebindImageDialog, AdminSubmissionsDialog, ConfirmDialog, WalkthroughOverlay, KeyboardShortcutsHelp) — moved here from App.tsx

**Component tree:**
```
<BrowserRouter>
  <AppShell>                   ← nav bar + status bar + global dialogs
    <WorkspaceProvider>        ← workspace state + dialog state
      <Outlet />               ← WorkspacePage | SavedConfigsPage | OrderSummaryPage
    </WorkspaceProvider>
  </AppShell>
</BrowserRouter>
```

### Auth Guard (`src/components/RequireAuth.tsx`)

Wraps auth-required routes. Unauthenticated users are redirected to `/` with a `?authRequired=1` query param; `AppShell` detects this param and auto-opens the auth modal, so users see a "Please sign in" prompt rather than a silent redirect.

### WorkspaceContext (`src/contexts/WorkspaceContext.tsx`)

Extracts all workspace state currently in `App.tsx` into a context + provider, so it persists when navigating between routes. Provides:

- All grid state: `placedItems`, `selectedItemIds`, grid dimensions, `spacerConfig`, `unitSystem`, `bomItems`, `layoutMeta`, `refImagePlacements`, `libraryItems`, `categories`
- All action callbacks: `handleDrop`, `handleClearAll`, `handleReset`, `handleSubmitClick`, `handleLoadLayout`, `handleWithdrawLayout`, `handleCloneCurrentLayout`, `handleExportPdf`, ref image handlers, etc.
- Dialog state (`dialogs` + `dialogDispatch`) — moved here from `App.tsx` so dialogs rendered in `AppShell` can be opened from any page
- **`loadLayout(id: number): Promise<void>`** — new async action that fetches a full `ApiLayoutDetail` from the API (using the same logic currently in `LoadLayoutDialog.handleSelect`), then hydrates `placedItems`, `refImagePlacements`, `spacerConfig`, dimensions, and `layoutMeta`. Called by `SavedConfigCard` Edit action; on completion the caller navigates to `/`.

This is a structural refactor of `App.tsx` — no behaviour changes, only state lifted out.

---

## Saved Configs Page (`src/pages/SavedConfigsPage.tsx`)

### Layout

Full-width page inside the shell `<main>`. No sidebar or library panel.

### Content

**Page header**
- Title: "My Saved Configs"
- Subtitle: "Review and manage your gridfinity layouts."

**Card grid**
- CSS: `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`
- One `SavedConfigCard` component per layout

**SavedConfigCard** (`src/components/layouts/SavedConfigCard.tsx`)
- Thumbnail area: placeholder showing grid dimensions (e.g. `4×4`) and item count badge; no thumbnail generation yet (see todo #58)
- Layout name (bold)
- Last-saved date (secondary text)
- Status badge — reuses existing `.layout-status-badge` / `.layout-status-{status}` CSS classes
- Action row:
  - **Edit** — calls `loadLayout(id)` from `WorkspaceContext`, then navigates to `/`
  - **Duplicate** — calls existing clone mutation, stays on `/configs`, refreshes list
  - **Delete** — two-step confirm (click once to arm, click again to confirm); hidden for `delivered` layouts; reuses existing delete mutation
  - **Submit** — visible on `draft` layouts only; calls submit mutation
  - **Withdraw** — visible on `submitted` layouts only; calls withdraw mutation

**Retirement of `LoadLayoutDialog` and `LayoutList`**
- `LoadLayoutDialog` is retired. Its fetch/hydrate logic moves into `WorkspaceContext.loadLayout()`.
- `LayoutList` is retired. Its display and action logic moves into `SavedConfigCard`.
- Both files are deleted.

**New Configuration card** (dashed border)
- `+` icon + "New Configuration" label + "Start fresh" subtitle
- Clears workspace state via `WorkspaceContext`, navigates to `/`

**Empty state**
- Friendly message + "Start your first layout" CTA linking to `/`

### Data

Uses the existing `useLayouts` hook (currently used by `LoadLayoutDialog`). The hook is kept as-is.

---

## Order Summary Page (`src/pages/OrderSummaryPage.tsx`)

### Trigger

"Review & Submit →" in the status bar navigates to `/order` (via `useNavigate`) instead of calling submit directly. Submission happens from this page.

If the layout has no saved ID, the page shows an inline "Save your layout first" prompt with a "Save Now" button (opens `SaveLayoutDialog` via `dialogDispatch`), and the Submit button is disabled until saved.

### Layout

Two-column layout:
- **Left (main):** BOM table + drawer info (grows to fill available width)
- **Right (panel, fixed ~300px):** Order total + actions

### Left Column

**Breadcrumb:** `WORKSPACE › ORDER SUMMARY` — "WORKSPACE" is a `<Link to="/">` using DrawerArchitect caption style (all-caps, `var(--text-secondary)`)

**Title:** "Order Summary & BOM"

**Subtitle:** "Review your layout before submitting. Items marked 'Price TBD' will receive a confirmed quote before any build or shipment."

**BOM table** (columns: Component Item | Qty | Unit Price | Total)
- Component Item: color swatch + item name + size (e.g. `2×3`)
- Unit Price:
  - Known price: formatted as currency (e.g. `$12.50`)
  - Unknown: "Price TBD" chip (amber background `#fef3c7`, text `#b45309`, pill shape)
- Total: `qty × unit price` when price is known; `—` when TBD
- Empty state: "No items placed — return to the workspace to add items."

**Drawer Dimensions section**
- `{W}mm × {D}mm` and grid units `{gridX} × {gridY}`

**Capacity section**
- Percentage bar (items placed ÷ total grid cells, same calculation as status bar)

### Right Column (Order Panel)

**ORDER TOTAL card**
- Subtotal: sum of all known-price line totals
- TBD disclaimer (shown when any item has no price): "† One or more items are Price TBD. A confirmed quote will follow before any build or shipment."
- Total line: shows subtotal if no TBD items; "Pending quote" if any TBD items

**Action buttons (stacked, full-width)**

1. **Download PDF** — exports a BOM summary PDF using a dedicated `exportOrderSummaryPdf(bomItems, { gridResult, spacerConfig, unitSystem, layoutName })` function. This does **not** require a grid DOM element — it generates a data-only document (BOM table + drawer dimensions + capacity). This is distinct from the existing `exportToPdf` (which captures a canvas screenshot of the grid). The new function lives in `src/utils/exportOrderSummaryPdf.ts`.

2. **Submit Layout** (blue, full-width) — calls submit mutation via `WorkspaceContext.handleSubmitLayout()`; on success navigates to `/configs`; disabled when `totalPlaced === 0`, mutation is pending, or layout has no saved ID.

3. **Save & Exit** — calls `dialogDispatch({ type: 'OPEN', dialog: 'save' })` (dialog rendered in AppShell); on save-complete navigates to `/configs`.

**Read-only state** (delivered layouts): Submit button hidden; "This layout has been fulfilled." message shown.

### Pricing Data

Add optional `price?: number` to:
- `LibraryItem` type (`src/types/gridfinity.ts`)
- `BOMItem` type (`src/types/gridfinity.ts`)

`useBillOfMaterials` hook propagates `price` from `LibraryItem` → `BOMItem` (pass through if present, omit if not).

No backend schema changes in this task — prices default to `undefined` for all items. Backend price management is a future task.

---

## Files Created / Modified

| File | Action |
|------|--------|
| `packages/app/package.json` | Add `react-router-dom` v6 dependency |
| `packages/app/src/App.tsx` | Refactor: thin router setup only (`<BrowserRouter>` + `<Routes>`) |
| `packages/app/src/AppShell.tsx` | **Create**: nav bar + status bar + global dialogs + `<Outlet>` |
| `packages/app/src/AppShell.css` | **Create**: shell-level layout styles (nav, status bar) |
| `packages/app/src/contexts/WorkspaceContext.tsx` | **Create**: extract all workspace state + `loadLayout(id)` async action |
| `packages/app/src/pages/WorkspacePage.tsx` | **Create**: current workspace UI (sidebar + canvas + library panel) |
| `packages/app/src/pages/SavedConfigsPage.tsx` | **Create**: full-page saved configs |
| `packages/app/src/pages/SavedConfigsPage.css` | **Create**: card grid styles |
| `packages/app/src/pages/OrderSummaryPage.tsx` | **Create**: full-page order summary |
| `packages/app/src/pages/OrderSummaryPage.css` | **Create**: two-column layout + table styles |
| `packages/app/src/components/layouts/SavedConfigCard.tsx` | **Create**: card for one saved layout |
| `packages/app/src/components/RequireAuth.tsx` | **Create**: auth guard; redirects with `?authRequired=1` |
| `packages/app/src/utils/exportOrderSummaryPdf.ts` | **Create**: BOM-only PDF export (no grid screenshot required) |
| `packages/app/src/components/layouts/LoadLayoutDialog.tsx` | **Delete** (replaced by `/configs` page + `WorkspaceContext.loadLayout`) |
| `packages/app/src/components/layouts/LayoutList.tsx` | **Delete** (replaced by `SavedConfigCard`) |
| `packages/app/src/types/gridfinity.ts` | Add `price?: number` to `LibraryItem` + `BOMItem` |
| `packages/app/src/hooks/useBillOfMaterials.ts` | Propagate `price` from `LibraryItem` → `BOMItem` |
| `packages/app/src/App.css` | Remove nav/status-bar styles (moved to `AppShell.css`) |

---

## Testing

**Unit tests:**
- `SavedConfigCard` — renders name, date, status badge, correct action buttons per status (draft/submitted/delivered), two-step delete flow
- `OrderSummaryPage` — renders BOM table, TBD chips for unpriced items, price calculations for priced items, disables Submit when no items
- `WorkspaceContext` — `loadLayout` hydrates state correctly (mock API); state persists across navigation using `MemoryRouter` (WorkspaceProvider is inside the router tree, wrapped around `<Outlet>`)
- `RequireAuth` — unauthenticated users redirected to `/?authRequired=1`; authenticated users render children

**E2E tests (Playwright):**
- Authenticated user navigates to `/configs` → sees saved layouts card grid
- Click Edit on a card → lands on `/`, workspace loads that layout
- Click "Review & Submit →" in status bar → navigates to `/order`, BOM visible
- Price TBD chip visible for items without price
- Click "Download PDF" → PDF download triggered
- Click "Submit Layout" → submit mutation called, navigates to `/configs`
- Click "Save & Exit" → SaveLayoutDialog opens, on complete navigates to `/configs`
- Unauthenticated user visiting `/configs` → redirected to `/?authRequired=1`, auth modal opens

---

## Out of Scope

- Thumbnail generation for Saved Configs cards (todo #58)
- Backend price management / admin pricing UI
- Actual payment processing
- SSR / server-side rendering
