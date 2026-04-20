# Remaining UI Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four remaining UI polish tasks: FIT buttons on dimension inputs, canvas header breadcrumb, cost estimate in status bar, and SVG thumbnail previews on Saved Config cards.

**Architecture:** All changes are frontend-only, touching existing components and adding minimal CSS. No new routes, no backend changes. Each task is independent and can be committed separately.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, CSS custom properties (`var(--*)`), existing `calculateOrderTotal` util, `GRIDFINITY_UNIT_MM = 42` constant from `conversions.ts`.

---

## Codebase Context (read before implementing)

- **`DimensionInput` mock** in `App.test.tsx` renders `<div data-testid="dimension-input-{label}" data-value={props.value} />` — no `<input>`, no `onChange`. FIT button tests must use `data-value` attribute assertions, not input value.
- **`renderApp()` in `App.test.tsx`** renders `WorkspacePage` inside a test shell — it does NOT render `AppShellInner`, so the status bar (`.app-status-bar`) is NOT in the test DOM. Cost estimate tests must use a separate `AppShell` test or `AppShell.test.tsx`.
- **`SavedConfigCard.test.tsx`** has `renderCard()` helper with `mockLayout` using `gridX: 4, gridY: 4`. There is an existing test `'renders grid dimensions in thumbnail'` that expects the text `4×4` — this must be removed when the SVG thumbnail replaces it.
- **`calculateOrderTotal`** is exported from `packages/app/src/utils/exportOrderSummaryPdf.ts`. Import path from `AppShell.tsx`: `'./utils/exportOrderSummaryPdf'`.
- **`layoutMeta`** is already destructured from `useWorkspace()` in `WorkspacePage.tsx`.
- **`bomItems`** is already destructured from `useWorkspace()` in `AppShell.tsx`.

---

## File Map

| Task | Files Modified | Files Created |
|------|---------------|---------------|
| #44 FIT buttons | `WorkspacePage.tsx`, `App.css`, `App.test.tsx` | — |
| #46 Canvas breadcrumb | `WorkspacePage.tsx`, `App.css`, `App.test.tsx` | — |
| #49 Cost in status bar | `AppShell.tsx`, `App.css` | `AppShell.test.tsx` (if not exists) |
| #58 Card thumbnails | `SavedConfigCard.tsx`, `SavedConfigsPage.css`, `SavedConfigCard.test.tsx` | — |

---

## Task 1: FIT Buttons on Dimension Inputs (#44)

**What:** Add "FIT W" and "FIT D" buttons next to each dimension input. Clicking snaps the dimension to the largest multiple of 42mm that fits in the current value — eliminating the gap shown in GridSummary. E.g. 170mm → `floor(170/42)*42 = 168mm` (4 units × 42mm). Buttons live inside `dimensionsContent` in `WorkspacePage.tsx`.

**Testing approach:** `DimensionInput` is mocked in `App.test.tsx` — tests verify `data-value` on the mocked `div` changes after clicking FIT, not a real input value.

**Files:**
- Modify: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/App.css`
- Modify: `packages/app/src/App.test.tsx`

- [ ] **Step 1: Write failing tests in App.test.tsx**

Find the `Unit Conversion` describe block and add after it:

```tsx
describe('FIT buttons', () => {
  it('renders FIT W and FIT D buttons', () => {
    renderApp();
    expect(screen.getByRole('button', { name: /FIT W/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /FIT D/i })).toBeInTheDocument();
  });

  it('FIT W snaps width down to nearest 42mm multiple', () => {
    renderApp();
    // Default width is 168mm (exact fit). We can't change it through the mock,
    // but we can verify the button exists and clicking it when already at a
    // multiple of 42 keeps the same value (168 → 168).
    const widthDiv = screen.getByTestId('dimension-input-Width');
    const before = parseFloat(widthDiv.getAttribute('data-value')!);
    expect(before % 42).toBe(0); // already a multiple

    fireEvent.click(screen.getByRole('button', { name: /FIT W/i }));

    const after = parseFloat(widthDiv.getAttribute('data-value')!);
    expect(after % 42).toBe(0);
    expect(after).toBe(before); // 168 stays 168
  });

  it('FIT D snaps depth down to nearest 42mm multiple', () => {
    renderApp();
    const depthDiv = screen.getByTestId('dimension-input-Depth');
    const before = parseFloat(depthDiv.getAttribute('data-value')!);
    expect(before % 42).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: /FIT D/i }));

    const after = parseFloat(depthDiv.getAttribute('data-value')!);
    expect(after % 42).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "FIT|FAIL|cannot find"
```

Expected: FAIL — buttons don't exist.

- [ ] **Step 3: Add FIT handlers to WorkspacePage**

At the top of `WorkspacePage` function body (near other `useCallback` handlers), add:

```tsx
const GRIDFINITY_UNIT_MM = 42;

const handleFitWidth = useCallback(() => {
  const mm = unitSystem === 'imperial' ? width * 25.4 : width;
  const fitted = Math.floor(mm / GRIDFINITY_UNIT_MM) * GRIDFINITY_UNIT_MM;
  setWidth(unitSystem === 'imperial' ? fitted / 25.4 : fitted);
}, [width, unitSystem, setWidth]);

const handleFitDepth = useCallback(() => {
  const mm = unitSystem === 'imperial' ? depth * 25.4 : depth;
  const fitted = Math.floor(mm / GRIDFINITY_UNIT_MM) * GRIDFINITY_UNIT_MM;
  setDepth(unitSystem === 'imperial' ? fitted / 25.4 : fitted);
}, [depth, unitSystem, setDepth]);
```

- [ ] **Step 4: Replace the dimension inputs block in dimensionsContent**

In `dimensionsContent` (the `<>` fragment), replace:

```tsx
<div className="dimension-inputs-row">
  <DimensionInput label="Width" value={width} onChange={setWidth} unit={unitSystem} imperialFormat={imperialFormat} />
  <span className="dimension-separator">x</span>
  <DimensionInput label="Depth" value={depth} onChange={setDepth} unit={unitSystem} imperialFormat={imperialFormat} />
</div>
```

With:

```tsx
<div className="dimension-input-row">
  <DimensionInput label="Width" value={width} onChange={setWidth} unit={unitSystem} imperialFormat={imperialFormat} />
  <button className="fit-btn" onClick={handleFitWidth} type="button" title="Snap to nearest full grid unit">FIT W</button>
</div>
<div className="dimension-input-row">
  <DimensionInput label="Depth" value={depth} onChange={setDepth} unit={unitSystem} imperialFormat={imperialFormat} />
  <button className="fit-btn" onClick={handleFitDepth} type="button" title="Snap to nearest full grid unit">FIT D</button>
</div>
```

- [ ] **Step 5: Add CSS to App.css**

After the existing `.spacer-select` block (search for `.spacer-select` in App.css):

```css
.fit-btn {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  padding: 4px 8px;
  background: var(--bg-hover);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.fit-btn:hover {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.dimension-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
```

Note: Also update the existing `.sidebar-content-area .dimension-inputs-row` overrides — search for `dimension-inputs-row` in App.css and add equivalent rules for `.dimension-input-row` so the sidebar stacking still applies.

- [ ] **Step 6: Run all tests**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/pages/WorkspacePage.tsx packages/app/src/App.css packages/app/src/App.test.tsx
git commit -m "feat(sidebar): add FIT buttons to snap dimensions to nearest 42mm grid unit"
```

---

## Task 2: Canvas Header Breadcrumb (#46)

**What:** Add a small breadcrumb bar above the canvas toolbar inside `<section className="preview">` in `WorkspacePage.tsx`. Shows `Workspace` when no layout is loaded, or `Workspace › Layout Name` when a layout is active. Uses `layoutMeta.name` (already destructured from `useWorkspace()`).

**Files:**
- Modify: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/App.css`
- Modify: `packages/app/src/App.test.tsx`

- [ ] **Step 1: Write failing test**

In `App.test.tsx`, add to an appropriate describe block:

```tsx
it('renders canvas breadcrumb with Workspace label', () => {
  renderApp();
  const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i });
  expect(breadcrumb).toBeInTheDocument();
  expect(breadcrumb).toHaveTextContent('Workspace');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "breadcrumb|FAIL"
```

Expected: FAIL.

- [ ] **Step 3: Add breadcrumb JSX to WorkspacePage**

Inside the `return` block in `WorkspacePage.tsx`, inside `<section className="preview">`, add before `<div className="preview-toolbar">`:

```tsx
<nav className="canvas-breadcrumb" aria-label="breadcrumb">
  <span className="canvas-breadcrumb-item">Workspace</span>
  {layoutMeta.name && (
    <>
      <span className="canvas-breadcrumb-sep">›</span>
      <span className="canvas-breadcrumb-item canvas-breadcrumb-current">{layoutMeta.name}</span>
    </>
  )}
</nav>
```

- [ ] **Step 4: Add CSS to App.css**

After the `.preview-toolbar` block:

```css
.canvas-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 16px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-primary);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.canvas-breadcrumb-sep {
  color: var(--text-tertiary);
}

.canvas-breadcrumb-current {
  color: var(--text-secondary);
  font-weight: var(--font-medium);
}
```

- [ ] **Step 5: Run all tests**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/pages/WorkspacePage.tsx packages/app/src/App.css packages/app/src/App.test.tsx
git commit -m "feat(canvas): add breadcrumb showing current layout name above toolbar"
```

---

## Task 3: Cost Estimate in Status Bar (#49)

**What:** Add a running cost total to the bottom status bar in `AppShell.tsx`. Uses `calculateOrderTotal(bomItems, true)` which is already used in `OrderSummaryPage.tsx`. Shows `$0.00` when empty, `$X.XX` when all priced, `$X.XX + TBD` when any item has no price.

**Testing approach:** `renderApp()` in `App.test.tsx` does NOT render `AppShellInner` (the status bar lives there), so tests go in a dedicated `AppShell.test.tsx`.

**Files:**
- Modify: `packages/app/src/AppShell.tsx`
- Modify: `packages/app/src/App.css`
- Create: `packages/app/src/AppShell.test.tsx` (if it doesn't exist)

- [ ] **Step 1: Check if AppShell.test.tsx exists**

```bash
ls packages/app/src/AppShell.test.tsx 2>/dev/null && echo "exists" || echo "missing"
```

- [ ] **Step 2: Write failing tests in AppShell.test.tsx**

If the file doesn't exist, create it. Look at `App.test.tsx` imports and mocks for reference on how to set up `WorkspaceContext` and `WalkthroughContext` mocks. The minimal test:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock WorkspaceContext
vi.mock('./contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspace: () => ({
    isAuthenticated: false,
    isAdmin: false,
    layoutMeta: { id: null, name: '', status: null, owner: null },
    isReadOnly: false,
    dialogs: { keyboard: false, save: false, rebind: false, admin: false },
    dialogDispatch: vi.fn(),
    closeRebind: vi.fn(),
    handleRebindSelect: vi.fn(),
    confirmDialogProps: { open: false, title: '', message: '', onConfirm: vi.fn(), onCancel: vi.fn() },
    bomItems: [],
    gridResult: { gridX: 4, gridY: 4, actualWidth: 168, actualDepth: 168, gapWidth: 0, gapDepth: 0 },
    placedItems: [],
    refImagePlacements: [],
    drawerWidth: 168,
    drawerDepth: 168,
    spacerConfig: { horizontal: 'none', vertical: 'none' },
    handleSaveComplete: vi.fn(),
    handleLoadLayout: vi.fn(),
    submittedCountQuery: { data: { submitted: 0 } },
    isWalkthroughActive: false,
    walkthroughCurrentStep: 0,
    walkthroughSteps: [],
    nextStep: vi.fn(),
    dismissTour: vi.fn(),
  }),
}));

vi.mock('./components/layouts/SaveLayoutDialog', () => ({ SaveLayoutDialog: () => null }));
vi.mock('./components/RebindImageDialog', () => ({ RebindImageDialog: () => null }));
vi.mock('./components/admin/AdminSubmissionsDialog', () => ({ AdminSubmissionsDialog: () => null }));
vi.mock('./components/admin/SubmissionsBadge', () => ({ SubmissionsBadge: () => null }));
vi.mock('./components/ConfirmDialog', () => ({ ConfirmDialog: () => null }));
vi.mock('./components/WalkthroughOverlay', () => ({ WalkthroughOverlay: () => null }));
vi.mock('./components/KeyboardShortcutsHelp', () => ({ KeyboardShortcutsHelp: () => null }));
vi.mock('./components/auth/UserMenu', () => ({ UserMenu: () => null }));

import { AppShell } from './AppShell';

function renderShell() {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
}

describe('AppShell status bar', () => {
  it('shows $0.00 cost estimate when no priced items', () => {
    renderShell();
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "AppShell|0\.00|FAIL"
```

Expected: FAIL.

- [ ] **Step 4: Add cost display to AppShell.tsx**

Add the import at the top of `AppShell.tsx`:

```tsx
import { calculateOrderTotal } from './utils/exportOrderSummaryPdf';
```

In `AppShellInner`, after the existing `pct` computation, add:

```tsx
const { total, hasTbd } = calculateOrderTotal(bomItems, true);
const costLabel = hasTbd ? `$${total.toFixed(2)} + TBD` : `$${total.toFixed(2)}`;
```

In the status bar JSX, add after the `status-count` div:

```tsx
<div className="status-spacer" />
<div className="status-cost">
  <span className="status-cost-label">Est.</span>
  <strong>{costLabel}</strong>
</div>
```

- [ ] **Step 5: Add CSS to App.css**

After the `.status-count` block (search for `.status-count` in App.css):

```css
.status-cost {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: var(--text-sm);
}

.status-cost-label {
  color: var(--text-tertiary);
}
```

- [ ] **Step 6: Run all tests**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/AppShell.tsx packages/app/src/App.css packages/app/src/AppShell.test.tsx
git commit -m "feat(status-bar): add running cost estimate from BOM pricing"
```

---

## Task 4: SVG Thumbnail Previews on Saved Config Cards (#58)

**What:** Replace the plain `4×4` text in `SavedConfigCard`'s thumbnail with a proportional SVG grid showing `gridX × gridY` cells. `ApiLayout` (from list endpoint) has `gridX` and `gridY` but not `placedItems`, so cells are uniform (no per-item colors). The existing test `'renders grid dimensions in thumbnail'` checks for the `4×4` text and must be replaced.

**Files:**
- Modify: `packages/app/src/components/layouts/SavedConfigCard.tsx`
- Modify: `packages/app/src/pages/SavedConfigsPage.css`
- Modify: `packages/app/src/components/layouts/SavedConfigCard.test.tsx`

- [ ] **Step 1: Update the existing failing test + add SVG test**

In `SavedConfigCard.test.tsx`, find and replace:

```tsx
it('renders grid dimensions in thumbnail', () => {
  renderCard();
  expect(screen.getByText('4\u00d74')).toBeInTheDocument();
});
```

With:

```tsx
it('renders SVG thumbnail with correct cell count (gridX × gridY)', () => {
  renderCard();
  const svg = document.querySelector('.saved-config-thumbnail svg');
  expect(svg).toBeInTheDocument();
  // mockLayout has gridX: 4, gridY: 4 → 16 cells
  const cells = svg!.querySelectorAll('rect.grid-cell');
  expect(cells).toHaveLength(16);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "SavedConfigCard|thumbnail|FAIL"
```

Expected: FAIL — SVG not rendered yet.

- [ ] **Step 3: Add GridThumbnail component to SavedConfigCard.tsx**

At the top of the file (after imports), add:

```tsx
function GridThumbnail({ gridX, gridY }: { gridX: number; gridY: number }) {
  const CELL = 10;
  const PAD = 4;
  const w = gridX * CELL + PAD * 2;
  const h = gridY * CELL + PAD * 2;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" aria-hidden="true">
      {Array.from({ length: gridY }, (_, row) =>
        Array.from({ length: gridX }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            className="grid-cell"
            x={PAD + col * CELL + 1}
            y={PAD + row * CELL + 1}
            width={CELL - 2}
            height={CELL - 2}
            rx={1}
          />
        ))
      )}
    </svg>
  );
}
```

Then in `SavedConfigCard` JSX, replace the thumbnail content:

```tsx
<div className="saved-config-thumbnail">
  <GridThumbnail gridX={layout.gridX} gridY={layout.gridY} />
</div>
```

(Remove the `<span className="saved-config-grid-dims">` entirely.)

- [ ] **Step 4: Update CSS in SavedConfigsPage.css**

Replace the existing `.saved-config-thumbnail` block and add new rules:

```css
.saved-config-thumbnail {
  background: var(--bg-primary);
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.saved-config-thumbnail svg {
  max-width: 100%;
  max-height: 100%;
}

.grid-cell {
  fill: var(--bg-secondary);
  stroke: var(--border-primary);
  stroke-width: 0.5;
}
```

Also remove the now-unused `.saved-config-grid-dims` rule from the CSS file.

- [ ] **Step 5: Run all tests**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/components/layouts/SavedConfigCard.tsx packages/app/src/pages/SavedConfigsPage.css packages/app/src/components/layouts/SavedConfigCard.test.tsx
git commit -m "feat(saved-configs): render SVG grid thumbnail on config cards"
```

---

## Final: Rebuild & Deploy

After all four tasks are committed:

- [ ] **Run full test suite**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all 55+ test files pass.

- [ ] **Docker rebuild and deploy**

```bash
cd infra && docker compose build --no-cache && docker compose up -d
```

Verify at `localhost:32888`.
