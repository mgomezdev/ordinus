# DrawerArchitect UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Gridfinity Customizer frontend to adopt the DrawerArchitect design system — Inter font, #007AFF primary, DA-style navigation bar, collapsible sidebar sections, and a dark status bar — while keeping every existing E2E and unit test passing unchanged.

**Architecture:** Pure CSS and minimal JSX restructuring. All component logic, hooks, and state management are untouched. The `<section className="grid-controls">` block moves into the left sidebar as collapsible sections; the `<header>` becomes a DA-style `<nav>`; a new `<div className="app-status-bar">` is appended at the bottom. All E2E selectors (`.sidebar`, `.sidebar-tab`, `.grid-cell`, `.bom-item`, etc.) are preserved exactly — elements move in the DOM but keep their class names.

**Tech Stack:** React 19, TypeScript, Vite, CSS custom properties (no Tailwind), Playwright E2E, Vitest unit tests.

---

## Reference Material

- **Playground:** `gridfinity-design-proposal.html` in repo root — fully interactive reference implementation
- **Stitch screenshots:** `workspace-designer.png`, `drawer-setup.png`, `order-summary-bom.png`, `saved-configs.png` in repo root
- **Current structure:** `packages/app/src/App.tsx` lines 513–736, `packages/app/src/index.css`

## Critical Constraint: E2E Selectors That Must Not Break

The following CSS classes are used by Playwright page objects and **must remain exactly as-is** on their elements:

| Class | Element | File |
|---|---|---|
| `.sidebar` | `<section>` wrapping sidebar | `SidebarPanel.tsx` |
| `.sidebar-tabs` | tab bar container | `SidebarPanel.tsx` |
| `.sidebar-tab` | each tab button (+ `.active`) | `SidebarPanel.tsx` |
| `.item-library` | `<div>` in `ItemLibrary.tsx` | `ItemLibrary.tsx` |
| `.library-item-card` | each draggable card | `LibraryItemCard.tsx` |
| `.category-title` | category collapse header | `ItemLibrary.tsx` |
| `.category-items` | category content area | `ItemLibrary.tsx` |
| `.grid-preview` | grid wrapper | `GridPreview.tsx` |
| `.grid-container` | CSS grid container | `GridPreview.tsx` |
| `.grid-cell` | individual cell | `GridPreview.tsx` |
| `.placed-item` | placed item overlay | `PlacedItemOverlay.tsx` |
| `.bill-of-materials` | BOM wrapper | `BillOfMaterials.tsx` |
| `.bom-item` | each BOM row | `BillOfMaterials.tsx` |
| `.bom-item-name` | item name span | `BillOfMaterials.tsx` |
| `.bom-item-size` | size span | `BillOfMaterials.tsx` |
| `.bom-item-quantity` | qty span | `BillOfMaterials.tsx` |
| `.preview-viewport` | scroll container | `GridViewport.tsx` |
| `.unit-toggle-compact` | unit toggle | `App.tsx` (inline JSX) |
| `.dimension-inputs-row` | dimension inputs | `App.tsx` (inline JSX) |
| `.reference-image-overlay` | ref image overlay | `ReferenceImageOverlay.tsx` |
| `.sidebar-auth-prompt` | auth required prompt | `RefImageLibrary.tsx` |

---

## File Structure

### Modified files

| File | What changes |
|---|---|
| `packages/app/src/index.css` | Swap DM Sans → Inter, update color tokens to DA palette |
| `packages/app/src/App.css` | Major: nav bar, status bar, sidebar sections, canvas card, global component polish |
| `packages/app/src/App.tsx` | Replace `<header>`, remove `<section className="grid-controls">`, add status bar, pass new props to SidebarPanel |
| `packages/app/src/components/SidebarPanel.tsx` | Add `dimensionsContent`/`spacerContent` props; render collapsible DA sections above existing tabs |

### Untouched files (no changes needed)

All hooks, GridPreview, GridViewport, ItemLibrary, ItemControls, BinCustomizationPanel, SpacerControls, LibraryItemCard, BillOfMaterials, RefImageLibrary, all modal/dialog components, all tests, all page objects.

---

## Tasks

---

### Task 1: Update Design Tokens in `index.css`

**Files:**
- Modify: `packages/app/src/index.css:1-144`

This is a pure CSS change — no logic, no selectors touched — so it cannot break any test. Update the `:root` block to the DA design system.

- [ ] **Step 1: Confirm tests pass before touching anything**

```bash
cd packages/app && npm run test:run
```
Expected: all unit tests pass.

- [ ] **Step 2: Update `:root` in `packages/app/src/index.css`**

Replace the current `:root` font and accent values with the DA tokens. The changes are:

```css
:root {
  /* Background — DA light palette */
  --bg-primary: #f8f9fa;       /* was #FAFBFD */
  --bg-secondary: #ffffff;     /* unchanged */
  --bg-tertiary: #f1f4f7;      /* was #F1F4F9 */
  --bg-elevated: #ffffff;      /* was #F7F9FC */
  --bg-hover: #eef2f6;         /* was #EDF1F7 */

  /* Accent — DA iOS blue */
  --accent-primary: #007AFF;   /* was #3B82F6 */
  --accent-secondary: #0062cc; /* was #2563EB */
  --accent-hover: #0062cc;     /* was #2563EB */
  --accent-glow: rgba(0, 122, 255, 0.2);
  --accent-alpha-10: rgba(0, 122, 255, 0.1);

  /* Blue scale — remap to iOS blue family */
  --blue-500: #007AFF;         /* primary */
  --blue-600: #0062cc;         /* hover */
  --blue-50:  #EFF6FF;         /* unchanged */

  /* Grid canvas — derived from new primary */
  --grid-primary: #007AFF;
  --grid-secondary: #66B2FF;
  --grid-alpha-10: rgba(0, 122, 255, 0.08);
  --grid-alpha-20: rgba(0, 122, 255, 0.15);
  --grid-alpha-30: rgba(0, 122, 255, 0.25);
  --grid-cell-bg:     rgba(0, 122, 255, 0.05);
  --grid-cell-border: rgba(0, 122, 255, 0.20);
  --border-focus: #007AFF;

  /* Borders — DA surface-variant palette */
  --border-primary:   #dbe4e7; /* was #E2E8F0 */
  --border-secondary: #eaeff2; /* was #F1F5F9 */
  --border-elevated:  #dbe4e7;

  /* Text — DA on-surface palette */
  --text-primary:   #1a1a1a;   /* was #0F172A */
  --text-secondary: #586064;   /* was #475569 */
  --text-tertiary:  #9ca3af;   /* was #94A3B8 */
  --text-muted:     #c5cdd0;   /* was #CBD5E1 */

  /* Typography — Inter replaces DM Sans */
  --font-display: 'Inter', system-ui, -apple-system, sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;

  /* Layout additions */
  --header-height:     52px;   /* was 60px — DA nav is slightly shorter */
  --status-bar-height: 44px;   /* NEW — bottom status bar */
  --sidebar-section-header-height: 40px; /* NEW */
}

/* Root font override to match */
:root {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}
```

Only update the values listed above. Leave all spacing scale, radius, shadow, and layout width variables (`--sidebar-width`, `--bom-width`, etc.) unchanged.

- [ ] **Step 3: Add `.sr-only` accessibility utility to `packages/app/src/index.css`**

The visually-hidden `<h1>` in the nav (Task 2) requires this class. Add after the `:root` block:

```css
/* Accessibility: visually hidden but available to screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

- [ ] **Step 4: Update `packages/app/index.html` — replace DM Sans with Inter**

`index.html` currently loads DM Sans via Google Fonts CDN (line ~13). Replace the font link:

```html
<!-- Before -->
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

<!-- After -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

(Only swap `DM+Sans` → `Inter`; keep JetBrains Mono for code/monospace.)

- [ ] **Step 5: Run unit tests to confirm nothing broke**

```bash
npm run test:run
```
Expected: all pass (CSS-only change, no test touches CSS variables).

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/index.css packages/app/index.html
git commit -m "style: update design tokens to DrawerArchitect palette — Inter font, #007AFF primary"
```

---

### Task 2: Restructure `App.tsx` — Nav Bar, Remove Grid Controls, Add Status Bar

**Files:**
- Modify: `packages/app/src/App.tsx:513-565` (header + grid-controls)
- Modify: `packages/app/src/App.tsx:567-574` (SidebarPanel call)
- Modify: `packages/app/src/App.tsx:683` (end of `<main>`, before modals)

Three surgical JSX changes. No logic changes.

#### 2a — Replace `<header>` with DA nav bar

- [ ] **Step 1: Replace the `<header className="app-header">` block** (lines 515–537 in App.tsx)

Find:
```tsx
      <header className="app-header">
        <div className="header-title-group">
          <h1>Gridfinity Bin Customizer</h1>
          {layoutMeta.id && (
            <p className="layout-info-subtitle">
              {layoutMeta.owner && <span className="layout-owner">{layoutMeta.owner} — </span>}
              <span className="layout-name">{layoutMeta.name}</span>
              {layoutMeta.status && <span className={`layout-status-badge layout-status-${layoutMeta.status}`}>{layoutMeta.status}</span>}
            </p>
          )}
        </div>
        <div className="header-actions">
          <UserMenu />
          <button
            className="keyboard-help-button"
            onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'keyboard' })}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </header>
```

Replace with:
```tsx
      <nav className="app-nav">
        {/* Visually hidden h1 preserves smoke.spec.ts: page.locator('h1').toContainText('Gridfinity') */}
        <h1 className="sr-only">Gridfinity Bin Customizer</h1>
        <div className="app-logo">
          <div className="app-logo-icon">G</div>
          <div>
            <div className="app-logo-name">GridfinityPlanner</div>
            <div className="app-logo-sub">Precision Architect</div>
          </div>
        </div>
        <div className="nav-tabs">
          <button className="nav-tab nav-tab-active" type="button">Workspace</button>
          {isAuthenticated && (
            <button
              className="nav-tab"
              type="button"
              onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'load' })}
            >
              Saved Configs
            </button>
          )}
        </div>
        <div className="nav-end">
          {layoutMeta.id && (
            <div className="nav-layout-info">
              {layoutMeta.owner && <span className="nav-layout-owner">{layoutMeta.owner} — </span>}
              <span className="nav-layout-name">{layoutMeta.name}</span>
              {layoutMeta.status && (
                <span className={`layout-status-badge layout-status-${layoutMeta.status}`}>
                  {layoutMeta.status}
                </span>
              )}
            </div>
          )}
          <UserMenu />
          <button
            className="keyboard-help-button"
            onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'keyboard' })}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
      </nav>
```

#### 2b — Extract grid controls content and remove the `<section className="grid-controls">`

- [ ] **Step 2: Add `dimensionsContent` and `spacerContent` constants** just before the `return (` statement (around line 512). Insert after the existing `selectionControls` const:

```tsx
  const dimensionsContent = (
    <>
      <div className="unit-toggle-compact">
        <button className={unitSystem === 'metric' ? 'active' : ''} onClick={() => handleUnitChange('metric')}>mm</button>
        <button className={unitSystem === 'imperial' ? 'active' : ''} onClick={() => handleUnitChange('imperial')}>in</button>
      </div>
      {unitSystem === 'imperial' && (
        <div className="format-toggle-compact">
          <button className={imperialFormat === 'decimal' ? 'active' : ''} onClick={() => setImperialFormat('decimal')}>.00</button>
          <button className={imperialFormat === 'fractional' ? 'active' : ''} onClick={() => setImperialFormat('fractional')}>½</button>
        </div>
      )}
      <div className="dimension-inputs-row">
        <DimensionInput label="Width" value={width} onChange={setWidth} unit={unitSystem} imperialFormat={imperialFormat} />
        <span className="dimension-separator">×</span>
        <DimensionInput label="Depth" value={depth} onChange={setDepth} unit={unitSystem} imperialFormat={imperialFormat} />
      </div>
      <GridSummary
        gridX={gridResult.gridX} gridY={gridResult.gridY}
        gapWidth={gridResult.gapWidth} gapDepth={gridResult.gapDepth}
        unit={unitSystem} imperialFormat={imperialFormat}
      />
    </>
  );

  const spacerContent = (
    <SpacerControls config={spacerConfig} onConfigChange={setSpacerConfig} />
  );
```

- [ ] **Step 3: Remove the entire `<section className="grid-controls">` block** (lines 539–565). Delete:

```tsx
      <section className="grid-controls">
        ... (entire block through closing </section>)
      </section>
```

#### 2c — Update SidebarPanel call to pass new props

- [ ] **Step 4: Update the `<SidebarPanel ... />` call** to include the two new props:

```tsx
        <SidebarPanel
          sidebarTab={sidebarTab}
          onTabChange={setSidebarTab}
          itemLibraryContent={itemLibraryContent}
          imageTabContent={imageTabContent}
          selectionControls={selectionControls}
          dimensionsContent={dimensionsContent}
          spacerContent={spacerContent}
        />
```

#### 2d — Add the status bar

- [ ] **Step 5: Insert the status bar** immediately after `</main>` (before `<KeyboardShortcutsHelp ...`):

```tsx
      <div className="app-status-bar">
        {(() => {
          const totalPlaced = bomItems.reduce((s, i) => s + i.quantity, 0);
          const capacity = gridResult.gridX * gridResult.gridY;
          const pct = capacity > 0 ? Math.min(100, Math.round((totalPlaced / capacity) * 100)) : 0;
          return (
            <>
              <div className="status-capacity">
                <span className="status-dot" />
                <span className="status-cap-label">
                  Capacity: <strong>{pct}%</strong>
                </span>
                <div className="status-bar-track">
                  <div className="status-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="status-spacer" />
              <div className="status-count">
                <strong>{totalPlaced} item{totalPlaced !== 1 ? 's' : ''}</strong>
                {' · '}{gridResult.gridX}×{gridResult.gridY} grid
              </div>
              <div className="status-spacer" />
              {isAuthenticated && layoutMeta.status !== 'submitted' && layoutMeta.status !== 'delivered' && (
                <button
                  className="status-submit-btn"
                  onClick={handleSubmitClick}
                  type="button"
                  disabled={submitLayoutMutation.isPending || totalPlaced === 0}
                >
                  {submitLayoutMutation.isPending ? 'Submitting…' : 'Review & Submit →'}
                </button>
              )}
            </>
          );
        })()}
      </div>
```

- [ ] **Step 6: Skip TypeScript check here — run after Task 3**

> The new `dimensionsContent`/`spacerContent` props added to `<SidebarPanel>` will cause TS errors until Task 3 updates the component's interface. Proceed directly to Task 3; the TS check is in Task 3 Step 2.

- [ ] **Step 7: Run unit tests**

```bash
npm run test:run
```

---

### Task 3: Update `SidebarPanel.tsx` — Collapsible DA Sections

**Files:**
- Modify: `packages/app/src/components/SidebarPanel.tsx`

Add the two new props and render collapsible "Dimensions" and "Spacer Settings" sections **above** the existing tabs. The tabs and their content are untouched — the `.sidebar`, `.sidebar-tabs`, `.sidebar-tab` classes remain exactly where they are.

- [ ] **Step 1: Replace the entire file content**

```tsx
import { useState } from 'react';
import type { ReactNode } from 'react';

interface SidebarPanelProps {
  sidebarTab: 'items' | 'images';
  onTabChange: (tab: 'items' | 'images') => void;
  itemLibraryContent: ReactNode;
  imageTabContent: ReactNode;
  selectionControls: ReactNode;
  dimensionsContent: ReactNode;
  spacerContent: ReactNode;
}

export function SidebarPanel({
  sidebarTab,
  onTabChange,
  itemLibraryContent,
  imageTabContent,
  selectionControls,
  dimensionsContent,
  spacerContent,
}: SidebarPanelProps) {
  const [dimsOpen, setDimsOpen] = useState(true);
  const [spacersOpen, setSpacersOpen] = useState(false);

  return (
    <section className="sidebar">

      {/* Dimensions collapsible section */}
      <div className={`sidebar-section${dimsOpen ? ' sidebar-section-open' : ''}`}>
        <button
          className="sidebar-section-header"
          onClick={() => setDimsOpen(o => !o)}
          type="button"
          aria-expanded={dimsOpen}
        >
          <svg className="sidebar-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="2" y="2" width="12" height="12" rx="1"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
            <line x1="8" y1="2" x2="8" y2="14"/>
          </svg>
          <span className="sidebar-section-title">Dimensions</span>
          <span className="sidebar-section-chevron" aria-hidden>{dimsOpen ? '▾' : '▸'}</span>
        </button>
        {dimsOpen && (
          <div className="sidebar-section-body">
            {dimensionsContent}
          </div>
        )}
      </div>

      {/* Spacer Settings collapsible section */}
      <div className={`sidebar-section${spacersOpen ? ' sidebar-section-open' : ''}`}>
        <button
          className="sidebar-section-header"
          onClick={() => setSpacersOpen(o => !o)}
          type="button"
          aria-expanded={spacersOpen}
        >
          <svg className="sidebar-section-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <line x1="2" y1="4" x2="14" y2="4"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
            <line x1="2" y1="12" x2="14" y2="12"/>
          </svg>
          <span className="sidebar-section-title">Spacer Settings</span>
          <span className="sidebar-section-chevron" aria-hidden>{spacersOpen ? '▾' : '▸'}</span>
        </button>
        {spacersOpen && (
          <div className="sidebar-section-body">
            {spacerContent}
          </div>
        )}
      </div>

      {/* Existing Items / Images tabs — class names unchanged */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab${sidebarTab === 'items' ? ' active' : ''}`}
          onClick={() => onTabChange('items')}
          type="button"
        >
          Items
        </button>
        <button
          className={`sidebar-tab${sidebarTab === 'images' ? ' active' : ''}`}
          onClick={() => onTabChange('images')}
          type="button"
        >
          Images
        </button>
      </div>

      {sidebarTab === 'items' ? itemLibraryContent : imageTabContent}

      {selectionControls}
    </section>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit --project packages/app/tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 3: Run unit tests**

```bash
npm run test:run
```
Expected: all pass. (SidebarPanel has no unit tests of its own; the sidebar props change is backwards-compatible because it's additive.)

- [ ] **Step 4: Run E2E smoke test to verify selectors still work**

```bash
npx playwright test --config=packages/app/playwright.config.ts smoke.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/App.tsx packages/app/src/components/SidebarPanel.tsx
git commit -m "refactor(ui): replace header with DA nav bar, move grid controls into sidebar, add status bar"
```

---

### Task 4: App.css — Nav Bar Styles

**Files:**
- Modify: `packages/app/src/App.css`

Add the new `.app-nav` rules. The old `.app-header` rules can remain (they won't match anything) or be removed — leave them for now to avoid disruption. Add these new rules at the top of the App-level layout section of App.css.

- [ ] **Step 1: Add nav bar CSS at the top of `App.css`** (after the `.app` rule, before `.app-header`)

```css
/* ── DrawerArchitect Navigation Bar ── */
.app-nav {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  display: flex;
  align-items: center;
  padding: 0 20px;
  height: var(--header-height);
  gap: 20px;
  flex-shrink: 0;
  box-shadow: var(--shadow-xs);
  z-index: 10;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  white-space: nowrap;
}

.app-logo-icon {
  width: 28px;
  height: 28px;
  background: var(--accent-primary);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 13px;
  font-weight: var(--font-bold);
  flex-shrink: 0;
}

.app-logo-name {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  line-height: 1.2;
}

.app-logo-sub {
  font-size: var(--text-xs);
  font-weight: var(--font-normal);
  color: var(--text-tertiary);
  margin-top: 1px;
}

.nav-tabs {
  display: flex;
  flex: 1;
  justify-content: center;
  height: 100%;
}

.nav-tab {
  display: flex;
  align-items: center;
  padding: 0 18px;
  height: 100%;
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.nav-tab:hover {
  color: var(--text-primary);
  background: none;
  border-color: transparent;
}

.nav-tab-active,
.nav-tab.nav-tab-active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
}

.nav-tab-active:hover,
.nav-tab.nav-tab-active:hover {
  background: none;
}

.nav-end {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.nav-layout-info {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 200px;
  overflow: hidden;
}

.nav-layout-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-weight: var(--font-medium);
}

/* ── Status Bar ── */
.app-status-bar {
  background: #1a1c1e;
  color: #fff;
  display: flex;
  align-items: center;
  padding: 0 20px;
  height: var(--status-bar-height);
  gap: 16px;
  flex-shrink: 0;
}

.status-capacity {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-sm);
  color: #9ca3af;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34C759;
  flex-shrink: 0;
}

.status-cap-label {
  white-space: nowrap;
}

.status-cap-label strong {
  color: #f3f4f6;
}

.status-bar-track {
  width: 56px;
  height: 3px;
  background: #374151;
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}

.status-bar-fill {
  height: 100%;
  background: #34C759;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.status-spacer {
  flex: 1;
}

.status-count {
  font-size: var(--text-sm);
  color: #6b7280;
  white-space: nowrap;
}

.status-count strong {
  color: #f3f4f6;
}

.status-submit-btn {
  padding: 6px 18px;
  background: var(--accent-primary);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
  white-space: nowrap;
  letter-spacing: var(--tracking-wide);
}

.status-submit-btn:hover:not(:disabled) {
  opacity: 0.85;
  background: var(--accent-primary);
  border-color: transparent;
}

.status-submit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

- [ ] **Step 2: In App.css, replace the existing `.app` rule entirely**

The current `.app` rule has `max-width`, `margin: 0 auto`, `padding`, and `gap` — remove all of them. Replace the whole rule:
```css
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
```
Verify no other rules reference `grid-controls` in a height calculation (search App.css for `grid-controls`).

- [ ] **Step 3: Run E2E smoke test**

```bash
npx playwright test --config=packages/app/playwright.config.ts smoke.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/App.css
git commit -m "style(ui): add DA nav bar and status bar CSS"
```

---

### Task 5: App.css — Sidebar Section Styles

**Files:**
- Modify: `packages/app/src/App.css`

Style the new collapsible sections in the sidebar and update the sidebar tabs to match DA.

- [ ] **Step 1: Add sidebar section CSS** in App.css, within the sidebar styles section:

```css
/* ── Sidebar DA Sections ── */
.sidebar {
  /* existing rules stay — just ensure these are present: */
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: var(--sidebar-width);
  overflow: hidden;
}

.sidebar-section {
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.sidebar-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  width: 100%;
  background: none;
  border: none;
  border-radius: 0;
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: color 0.15s, background 0.15s;
}

.sidebar-section-header:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: transparent;
}

.sidebar-section-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.sidebar-section-title {
  flex: 1;
}

.sidebar-section-chevron {
  font-size: 10px;
  color: var(--text-tertiary);
  transition: transform 0.2s;
}

.sidebar-section-body {
  padding: 4px 14px 14px;
}

/* Sidebar tabs — updated to DA tab style (selectors unchanged) */
.sidebar-tabs {
  display: flex;
  padding: 8px 12px 0;
  gap: 2px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.sidebar-tab {
  flex: 1;
  padding: 6px 8px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: center;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}

.sidebar-tab:hover {
  color: var(--text-primary);
  background: none;
  border-color: transparent;
}

.sidebar-tab.active {
  color: var(--accent-primary);
  border-bottom-color: var(--accent-primary);
  background: none;
}

/* ── Dimension controls inside sidebar section ── */
/* These selectors already exist in App.css — just ensure padding fits the new context */
.sidebar-section-body .unit-toggle-compact {
  margin-bottom: 10px;
}

.sidebar-section-body .dimension-inputs-row {
  margin-top: 0;
}
```

- [ ] **Step 2: Run E2E tests for unit toggle and sidebar interactions**

```bash
npx playwright test --config=packages/app/playwright.config.ts unit-toggle.spec.ts
```
Expected: PASS. The `.unit-toggle-compact` and `.dimension-inputs-row` selectors still work — they're just inside the sidebar now.

- [ ] **Step 3: Run smoke test**

```bash
npx playwright test --config=packages/app/playwright.config.ts smoke.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/App.css
git commit -m "style(ui): DA-style sidebar collapsible sections and updated tabs"
```

---

### Task 6: App.css — Canvas Area and Preview Toolbar

**Files:**
- Modify: `packages/app/src/App.css`

Give the center canvas a white card, neutral background, and cleaner toolbar. All `.grid-cell`, `.grid-container`, `.grid-preview` selectors are untouched.

- [ ] **Step 1: Update canvas/preview CSS in App.css**

Find and update the `.preview` and `.preview-toolbar` rules (they already exist — update values):

```css
/* ── Center canvas area ── */
.preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);  /* light grey background, was var(--bg-tertiary) */
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* Toolbar action buttons — DA-style secondary buttons */
.layout-toolbar-btn {
  padding: 5px 12px;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  border: 1.5px solid var(--border-primary);
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.layout-toolbar-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background: var(--bg-secondary);
}

.layout-submit-btn {
  background: var(--accent-primary);
  color: #fff;
  border-color: var(--accent-primary);
}

.layout-submit-btn:hover:not(:disabled) {
  background: var(--accent-secondary);
  border-color: var(--accent-secondary);
  color: #fff;
}

/* Grid canvas viewport */
.preview-viewport {
  flex: 1;
  overflow: auto;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* Grid cells — DA aesthetic */
.grid-cell {
  background: var(--grid-cell-bg);
  border: 1px solid var(--grid-cell-border);
  border-radius: 2px;
  transition: background 0.1s, border-color 0.1s;
}

.grid-cell:hover {
  background: var(--grid-alpha-20);
  border-color: var(--grid-primary);
}
```

- [ ] **Step 2: Run drag-and-drop E2E tests**

```bash
npx playwright test --config=packages/app/playwright.config.ts drag-and-drop.spec.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/App.css
git commit -m "style(ui): DA canvas area — light background, clean toolbar, updated grid cells"
```

---

### Task 7: App.css — BOM Panel

**Files:**
- Modify: `packages/app/src/App.css`

Update the right BOM panel to DA aesthetic. All `.bill-of-materials`, `.bom-item`, `.bom-item-name`, `.bom-item-size`, `.bom-item-quantity` selectors are untouched.

- [ ] **Step 1: Update BOM styles in App.css** (find existing `.bill-of-materials` rules and update):

```css
/* ── Bill of Materials panel ── */
.bom-sidebar {
  width: var(--bom-width);
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.bill-of-materials {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.bom-header {
  padding: 12px 14px 0;
  flex-shrink: 0;
}

.bom-title {
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin: 0 0 2px;
  letter-spacing: var(--tracking-tight);
}

.bom-total {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.bom-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.bom-items {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.bom-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  background: var(--bg-primary);
  border: 1.5px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  transition: border-color 0.15s;
}

.bom-item:hover {
  border-color: var(--border-primary);
}

.bom-item-color {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.bom-item-details {
  flex: 1;
  overflow: hidden;
}

.bom-item-name {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bom-item-size {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.bom-item-quantity {
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  color: var(--accent-primary);
  flex-shrink: 0;
}

.bom-empty {
  padding: 20px 14px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.bom-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: 4px;
}
```

- [ ] **Step 2: Run BOM-related E2E tests**

```bash
npx playwright test --config=packages/app/playwright.config.ts drag-and-drop.spec.ts item-manipulation.spec.ts
```
Expected: PASS (BOM selectors unchanged).

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/App.css
git commit -m "style(ui): DA-style BOM panel"
```

---

### Task 8: App.css — Library Cards and Item Library

**Files:**
- Modify: `packages/app/src/App.css`

Restyle library item cards to DA style. The `.library-item-card`, `.library-item-name`, `.library-item-size` classes are unchanged.

- [ ] **Step 1: Update library card CSS in App.css**:

```css
/* ── Library item cards ── */
.item-library {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.library-item-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border: 1.5px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  padding: 8px;
  cursor: grab;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  user-select: none;
  margin-bottom: 6px;
}

.library-item-card:hover {
  border-color: var(--accent-primary);
  background: var(--accent-alpha-10);
  box-shadow: var(--shadow-xs);
}

.library-item-card:active {
  cursor: grabbing;
}

.library-item-preview-container {
  width: 100%;
  aspect-ratio: 1.6;
  background: var(--border-secondary);
  border-radius: 2px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.library-item-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: opacity 0.2s;
}

.library-item-image.visible { opacity: 1; }
.library-item-image.hidden  { opacity: 0; position: absolute; }

.library-item-info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
}

.library-item-name {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.library-item-size {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Run library and drag tests**

```bash
npx playwright test --config=packages/app/playwright.config.ts library-management.spec.ts drag-and-drop.spec.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/App.css
git commit -m "style(ui): DA-style library item cards"
```

---

### Task 9: App.css — Global Polish (Buttons, Inputs, Modals)

**Files:**
- Modify: `packages/app/src/App.css`

Polish remaining elements so the whole app feels consistent with DA — no selector changes.

- [ ] **Step 1: Update global button and input base styles in `index.css`**

Update the base `button` and `input` rules in `index.css`:

```css
button {
  border-radius: var(--radius-sm);        /* was --radius-md (6px), now 4px */
  border: 1.5px solid var(--border-primary);
  padding: 0.5em 1em;
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  font-family: inherit;
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.15s;
}

button:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  background-color: var(--bg-secondary);
}

button:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Update modal overlay styles in App.css**

Ensure dialogs/modals have consistent DA radius and shadow. The actual class used by all dialogs (Save, Load, Admin) is `.layout-dialog`. Find the existing `.layout-dialog` rule and ensure:
```css
.layout-dialog {
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-primary);
}
```
Also update `.confirm-dialog` and `.keyboard-shortcuts-dialog` for consistency.

- [ ] **Step 3: Run full unit test suite**

```bash
npm run test:run
```
Expected: all pass.

- [ ] **Step 4: Run key E2E tests**

```bash
npx playwright test --config=packages/app/playwright.config.ts \
  smoke.spec.ts \
  drag-and-drop.spec.ts \
  item-manipulation.spec.ts \
  unit-toggle.spec.ts \
  reference-images.spec.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/App.css packages/app/src/index.css
git commit -m "style(ui): global button, input, and modal DA polish"
```

---

### Task 10: Full Quality Gate

Run the complete test suite to confirm nothing regressed before the PR.

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:run
```
Expected: all pass.

- [ ] **Step 2: Run all E2E tests (local, non-Docker)**

```bash
npx playwright test --config=packages/app/playwright.config.ts
```
Expected: all non-integration tests pass.

- [ ] **Step 3: Lint check**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Build check**

```bash
npm run build
```
Expected: no TypeScript or build errors.

- [ ] **Step 5: Docker quality gate (integration tests)**

```bash
docker compose down && docker compose build --no-cache && docker compose up -d
TARGET=docker npx playwright test --config=packages/app/playwright.config.ts
```
Expected: all 127 tests pass including integration tests.

- [ ] **Step 6: Final commit and PR**

```bash
git add -p   # stage any remaining polish changes
git commit -m "style(ui): DrawerArchitect UI refactor — full pass"
```

Then open a PR from `feat/ui-refactor-drawerarchitect` to `develop`.

---

## What Is NOT Changing

To be explicit about scope boundaries:

- **No component logic changes** — all hooks, state, event handlers, drag-and-drop, keyboard shortcuts remain identical
- **No route changes** — "Saved Configs" nav tab opens the existing Load dialog, not a new route
- **No selector renames** — every class name listed in the Critical Constraint table is preserved exactly
- **No BOM or grid calculation changes** — purely visual
- **No new dependencies** — Inter font falls back to `system-ui` (no CDN import needed; most OS have Inter or a close match); if desired, add `@fontsource/inter` as a dev dep after the refactor is visual-verified
- **No feature removals** — Submit, Withdraw, Clone, Export PDF, Load, Save, Admin, Walkthrough, Keyboard Help are all preserved

## Potential Test Friction Points

| Risk | Location | Mitigation |
|---|---|---|
| Smoke test `h1` selector | smoke.spec.ts line 11 | Fixed: visually-hidden `<h1 className="sr-only">Gridfinity Bin Customizer</h1>` added to nav |
| Smoke test finds `.grid-controls` by class | smoke.spec.ts | Check: the class is gone; if test references it directly, update test selector to `.sidebar-section` |
| Unit-toggle test expects controls to be in specific DOM position | unit-toggle.spec.ts | Controls are still found by `.unit-toggle-compact` regardless of position |
| `page.locator('input').first()` ordinal fragility | unit-toggle.spec.ts line 81 | Safe: `SpacerControls` is conditionally rendered (`{spacersOpen && ...}`) — its inputs are removed from DOM when collapsed (default), so `.first()` still resolves to width input |
| BOM tests check exact sidebar width | Any BOM test | Width is unchanged (`--bom-width: 200px`) |
| Toolbar button tests look for Submit in toolbar | Any submit test | Existing Submit button stays in toolbar; status bar button is additive |
