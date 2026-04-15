# Mobile Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the gridfinity customizer usable on tablets (≤1024px) and phones (≤768px) by replacing the broken stacked layout with collapsible overlay panels that keep the grid canvas always visible.

**Architecture:** On mobile the sidebar (settings, left) and library panel (right) become absolutely-positioned overlays with 44px icon strips always visible at their respective edges; the grid fills the full viewport behind them. A `useMobileLayout` hook tracks which panel is open (mutually exclusive) and persists state to localStorage.

**Tech Stack:** React 19, TypeScript, CSS media queries, Vitest + React Testing Library, Playwright E2E

---

## Codebase Context (read before implementing)

- `packages/app/src/utils/storageKeys.ts` — 8 existing keys; add `MOBILE_LAYOUT` here
- `packages/app/src/hooks/useBOMExtras.ts` — hook pattern: `loadXxx()` / `saveXxx()` helpers, `useState` + `useCallback`, no `useEffect` for localStorage
- `packages/app/src/hooks/useBOMExtras.test.ts` — test pattern: `beforeEach` clears localStorage, `renderHook` + `act`, 8 tests
- `packages/app/src/pages/WorkspacePage.tsx` — 387-line component; JSX fragment has `<SidebarPanel>`, `<section class="preview">`, `<div class="library-resize-handle">`, `<LibraryPanel>`
- `packages/app/src/components/SidebarPanel.tsx` — 51-line component; root is `<section className="sidebar">`
- `packages/app/src/components/LibraryPanel.tsx` — 73-line component; root is `<section className="library-panel" style={{ width, minWidth: width }}>`
- `packages/app/src/App.css` lines 2626–2677 — broken `@media (max-width: 1199px)` and `@media (max-width: 768px)` blocks to replace
- `packages/app/e2e/pages/GridPage.ts` — page object pattern; constructor assigns locators, methods are `async`
- `packages/app/e2e/pages/LibraryPage.ts` — `waitForLibraryReady()` waits for `.item-library` visible
- `packages/app/e2e/tests/drag-and-drop.spec.ts` — `test.describe` + `beforeEach` + `test.use` pattern
- `packages/app/playwright.config.ts` — default project: `Desktop Chrome` → viewport **1280×720** (> 1024px, so existing tests are NOT affected by the mobile breakpoint)

---

## Task 1: `useMobileLayout` hook + storage key + unit tests

**TDD order: write failing tests first, then implement the hook.**

### Step 1.1 — Add storage key

- [ ] Modify `packages/app/src/utils/storageKeys.ts`

```ts
// packages/app/src/utils/storageKeys.ts
/**
 * Centralized localStorage key constants.
 * All localStorage access should use these keys to prevent duplication and typos.
 */
export const STORAGE_KEYS = {
  REFERENCE_IMAGES: 'gridfinity-reference-images',
  SELECTED_LIBRARIES: 'gridfinity-selected-libraries',
  COLLAPSED_CATEGORIES: 'gridfinity-collapsed-categories',
  PLACED_ITEMS: 'gridfinity-placed-items',
  CUSTOM_LIBRARY: 'gridfinity-custom-library',
  CUSTOM_CATEGORIES: 'gridfinity-custom-categories',
  WALKTHROUGH_SEEN: 'gridfinity-walkthrough-seen',
  BOM_EXTRAS: 'gridfinity-bom-extras',
  MOBILE_LAYOUT: 'gridfinity-mobile-layout',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
```

### Step 1.2 — Write tests first (they will fail until Step 1.3)

- [ ] Create `packages/app/src/hooks/useMobileLayout.test.ts`

```ts
// packages/app/src/hooks/useMobileLayout.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMobileLayout } from './useMobileLayout';
import { STORAGE_KEYS } from '../utils/storageKeys';

let mockMatches = false;

beforeEach(() => {
  localStorage.clear();
  mockMatches = false;
  Object.defineProperty(window, 'innerWidth', {
    value: 1280,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: mockMatches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('useMobileLayout', () => {
  it('isMobile is false at desktop width (matchMedia returns false, innerWidth 1280)', () => {
    mockMatches = false;
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true });
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.isMobile).toBe(false);
  });

  it('isMobile is true at tablet width (matchMedia returns true, innerWidth 768)', () => {
    mockMatches = true;
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true, configurable: true });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.isMobile).toBe(true);
  });

  it('panels start closed by default when localStorage is empty', () => {
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.libraryOpen).toBe(false);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('toggleLibrary opens library and closes settings (mutual exclusion)', () => {
    const { result } = renderHook(() => useMobileLayout());
    // First open settings
    act(() => { result.current.toggleSettings(); });
    expect(result.current.settingsOpen).toBe(true);
    // Now open library — settings must close
    act(() => { result.current.toggleLibrary(); });
    expect(result.current.libraryOpen).toBe(true);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('toggleSettings opens settings and closes library (mutual exclusion)', () => {
    const { result } = renderHook(() => useMobileLayout());
    // First open library
    act(() => { result.current.toggleLibrary(); });
    expect(result.current.libraryOpen).toBe(true);
    // Now open settings — library must close
    act(() => { result.current.toggleSettings(); });
    expect(result.current.settingsOpen).toBe(true);
    expect(result.current.libraryOpen).toBe(false);
  });

  it('closeLibrary closes only library, leaves settingsOpen unchanged', () => {
    const { result } = renderHook(() => useMobileLayout());
    act(() => { result.current.toggleLibrary(); });
    expect(result.current.libraryOpen).toBe(true);
    act(() => { result.current.closeLibrary(); });
    expect(result.current.libraryOpen).toBe(false);
    // settingsOpen was already false — stays false
    expect(result.current.settingsOpen).toBe(false);
  });

  it('state persists to localStorage when toggleLibrary is called', () => {
    const { result } = renderHook(() => useMobileLayout());
    act(() => { result.current.toggleLibrary(); });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.MOBILE_LAYOUT) ?? 'null');
    expect(stored).toEqual({ libraryOpen: true, settingsOpen: false });
  });

  it('loads persisted state from localStorage on mount', () => {
    localStorage.setItem(
      STORAGE_KEYS.MOBILE_LAYOUT,
      JSON.stringify({ libraryOpen: true, settingsOpen: false }),
    );
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.libraryOpen).toBe(true);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('handles corrupt localStorage gracefully — defaults to both closed', () => {
    localStorage.setItem(STORAGE_KEYS.MOBILE_LAYOUT, 'not-valid-json{{{');
    const { result } = renderHook(() => useMobileLayout());
    expect(result.current.libraryOpen).toBe(false);
    expect(result.current.settingsOpen).toBe(false);
  });

  it('closeSettings is a no-op when settings is already closed', () => {
    const { result } = renderHook(() => useMobileLayout());
    // settingsOpen starts false
    act(() => { result.current.closeSettings(); });
    expect(result.current.settingsOpen).toBe(false);
    // localStorage should be untouched (no key written for a no-op)
    expect(localStorage.getItem(STORAGE_KEYS.MOBILE_LAYOUT)).toBeNull();
  });
});
```

### Step 1.3 — Implement the hook

- [ ] Create `packages/app/src/hooks/useMobileLayout.ts`

```ts
// packages/app/src/hooks/useMobileLayout.ts
import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../utils/storageKeys';

const MOBILE_BREAKPOINT = 1024;

interface MobileLayoutState {
  libraryOpen: boolean;
  settingsOpen: boolean;
}

const DEFAULT_STATE: MobileLayoutState = { libraryOpen: false, settingsOpen: false };

function loadState(): MobileLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MOBILE_LAYOUT);
    return raw ? (JSON.parse(raw) as MobileLayoutState) : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: MobileLayoutState): void {
  localStorage.setItem(STORAGE_KEYS.MOBILE_LAYOUT, JSON.stringify(state));
}

export interface UseMobileLayoutReturn {
  isMobile: boolean;
  libraryOpen: boolean;
  settingsOpen: boolean;
  toggleLibrary: () => void;
  toggleSettings: () => void;
  closeLibrary: () => void;
  closeSettings: () => void;
}

export function useMobileLayout(): UseMobileLayoutReturn {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [panelState, setPanelState] = useState<MobileLayoutState>(loadState);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleLibrary = useCallback(() => {
    setPanelState(prev => {
      const next: MobileLayoutState = { libraryOpen: !prev.libraryOpen, settingsOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  const toggleSettings = useCallback(() => {
    setPanelState(prev => {
      const next: MobileLayoutState = { settingsOpen: !prev.settingsOpen, libraryOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  const closeLibrary = useCallback(() => {
    setPanelState(prev => {
      if (!prev.libraryOpen) return prev;
      const next: MobileLayoutState = { ...prev, libraryOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  const closeSettings = useCallback(() => {
    setPanelState(prev => {
      if (!prev.settingsOpen) return prev;
      const next: MobileLayoutState = { ...prev, settingsOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  return {
    isMobile,
    libraryOpen: panelState.libraryOpen,
    settingsOpen: panelState.settingsOpen,
    toggleLibrary,
    toggleSettings,
    closeLibrary,
    closeSettings,
  };
}
```

### Step 1.4 — Verify tests pass

- [ ] Run: `npm run test:run --workspace=packages/app 2>&1 | tail -8`

Expected output (all tests pass, 9 new tests in useMobileLayout):
```
 ✓ src/hooks/useMobileLayout.test.ts (9)
...
Test Files  X passed (X)
Tests       X passed (X)
```

### Step 1.5 — Commit

```bash
git add packages/app/src/utils/storageKeys.ts \
        packages/app/src/hooks/useMobileLayout.ts \
        packages/app/src/hooks/useMobileLayout.test.ts
git commit -m "feat(mobile): add useMobileLayout hook with localStorage persistence"
```

---

## Task 2: CSS — mobile overlay layout

**No unit tests for pure CSS. Lint only.**

### Step 2.1 — Replace broken media queries in App.css

- [ ] Modify `packages/app/src/App.css`

Find and replace the entire block from line 2626 to 2677 (the existing `/* Responsive */` section through the closing `}` of the `@media (max-width: 768px)` block). Replace with the following:

**Old block to remove (lines 2626–2677):**
```css
/* Responsive */
/* Tablet */
@media (max-width: 1199px) {
  .app-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }

  .sidebar {
    order: 1;
    width: 100%;
  }

  .preview {
    order: 2;
    min-height: 60vh;
  }

}

/* Mobile */
@media (max-width: 768px) {
  .app {
    padding: var(--space-lg);
  }

  .app-header {
    flex-direction: column;
    gap: var(--space-sm);
    height: auto;
  }

  .grid-controls {
    justify-content: center;
  }

  .grid-summary {
    margin-left: 0;
    width: 100%;
    justify-content: center;
  }

  .app-main {
    grid-template-columns: 1fr;
  }

  .preview {
    min-height: 400px;
    padding: var(--space-lg);
  }

}
```

**New block to insert:**
```css
/* ─── Mobile toggle strips (hidden on desktop) ──────────────────────────── */
.mobile-panel-strip {
  display: none;
}

.mobile-toggle-btn {
  display: none;
}

/* ─── Responsive: Tablet (≤1024px) — overlay panel layout ───────────────── */
@media (max-width: 1024px) {
  .app-main {
    position: relative;
  }

  /* Toggle strips */
  .mobile-panel-strip {
    display: flex;
    position: absolute;
    top: 0;
    bottom: 0;
    width: 44px;
    z-index: 25;
    flex-direction: column;
    align-items: center;
    padding: var(--space-sm) 0;
    background: var(--bg-secondary);
  }

  .mobile-panel-strip--left {
    left: 0;
    border-right: 1px solid var(--border-primary);
  }

  .mobile-panel-strip--right {
    right: 0;
    border-left: 1px solid var(--border-primary);
  }

  .mobile-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    font-size: 18px;
    padding: 0;
  }

  .mobile-toggle-btn:hover {
    background: var(--blue-100);
    color: var(--blue-700);
  }

  .mobile-toggle-btn.active {
    background: var(--blue-600);
    color: #ffffff;
  }

  /* Backdrop */
  .mobile-backdrop {
    display: none;
    position: absolute;
    inset: 0;
    z-index: 15;
    background: transparent;
  }

  .mobile-backdrop--visible {
    display: block;
  }

  /* Sidebar (settings) — slide in from left */
  .sidebar {
    position: absolute;
    left: 44px;
    top: 0;
    bottom: 0;
    width: 240px;
    z-index: 20;
    transform: translateX(calc(-44px - 240px));
    transition: transform 0.2s ease;
    background: var(--bg-secondary);
    box-shadow: var(--shadow-lg);
    overflow-y: auto;
  }

  .sidebar--open {
    transform: translateX(0);
  }

  /* Library panel — slide in from right */
  .library-panel {
    position: absolute;
    right: 44px;
    top: 0;
    bottom: 0;
    width: 260px !important;
    min-width: unset !important;
    z-index: 20;
    transform: translateX(calc(44px + 260px));
    transition: transform 0.2s ease;
    background: var(--bg-secondary);
    box-shadow: var(--shadow-lg);
    overflow-y: auto;
  }

  .library-panel--open {
    transform: translateX(0);
  }

  /* Hide desktop resize handle */
  .library-resize-handle {
    display: none;
  }

  /* Grid canvas inset to avoid being hidden by strips */
  .preview {
    padding-left: 44px;
    padding-right: 44px;
  }

  /* Compact library card grid */
  .library-items-grid,
  .category-items {
    grid-template-columns: repeat(auto-fill, 80px);
  }
}

/* ─── Responsive: Phone (≤768px) ─────────────────────────────────────────── */
@media (max-width: 768px) {
  /* Strips shrink to 36px */
  .mobile-panel-strip {
    width: 36px;
  }

  .mobile-panel-strip--left {
    left: 0;
  }

  .mobile-panel-strip--right {
    right: 0;
  }

  /* Sidebar adjusts offset for narrower strip */
  .sidebar {
    left: 36px;
    width: 220px;
    transform: translateX(calc(-36px - 220px));
  }

  .sidebar--open {
    transform: translateX(0);
  }

  /* Library panel adjusts offset for narrower strip */
  .library-panel {
    right: 36px;
    width: 240px !important;
    transform: translateX(calc(36px + 240px));
  }

  .library-panel--open {
    transform: translateX(0);
  }

  /* Shrink canvas padding to match strip width */
  .preview {
    padding-left: 36px;
    padding-right: 36px;
  }

  /* Smaller card grid on phone */
  .library-items-grid,
  .category-items {
    grid-template-columns: repeat(auto-fill, 72px);
  }

  .mobile-toggle-btn {
    width: 28px;
    height: 28px;
    font-size: 16px;
  }
}
```

### Step 2.2 — Lint check

- [ ] Run: `npm run lint --workspace=packages/app 2>&1 | tail -5`

Expected output:
```
✓ No ESLint warnings or errors
```

### Step 2.3 — Commit

```bash
git add packages/app/src/App.css
git commit -m "feat(mobile): replace broken stacked layout with overlay panel CSS"
```

---

## Task 3: Wire mobile layout into WorkspacePage, SidebarPanel, LibraryPanel

### Step 3.1 — Update SidebarPanel

- [ ] Replace the full content of `packages/app/src/components/SidebarPanel.tsx`

```tsx
// packages/app/src/components/SidebarPanel.tsx
import type { ReactNode } from 'react';

interface SidebarPanelProps {
  dimensionsContent: ReactNode;
  spacerContent: ReactNode;
  onClearCanvas: () => void;
  onReset: () => void;
  isReadOnly: boolean;
  isOpen?: boolean;
}

export function SidebarPanel({
  dimensionsContent,
  spacerContent,
  onClearCanvas,
  onReset,
  isReadOnly,
  isOpen,
}: SidebarPanelProps) {
  return (
    <section className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
      <nav className="sidebar-nav">
        <div className="sidebar-nav-row sidebar-nav-heading">
          <span className="sidebar-nav-icon">⊞</span>
          <span className="sidebar-nav-label">GRID SETTINGS</span>
        </div>

        {!isReadOnly && (
          <button className="sidebar-nav-row sidebar-nav-action" onClick={onClearCanvas} type="button">
            <span className="sidebar-nav-icon">✕</span>
            <span className="sidebar-nav-label">CLEAR CANVAS</span>
          </button>
        )}

        <button className="sidebar-nav-row sidebar-nav-action" onClick={onReset} type="button">
          <span className="sidebar-nav-icon">↺</span>
          <span className="sidebar-nav-label">RESET</span>
        </button>
      </nav>

      <div className="sidebar-content-area">
        <div className="sidebar-settings-group">
          <span className="sidebar-settings-group-label">Dimensions</span>
          {dimensionsContent}
        </div>

        <div className="sidebar-settings-group">
          {spacerContent}
        </div>
      </div>
    </section>
  );
}
```

### Step 3.2 — Update LibraryPanel

- [ ] Replace the full content of `packages/app/src/components/LibraryPanel.tsx`

```tsx
// packages/app/src/components/LibraryPanel.tsx
import { useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ItemLibrary } from './ItemLibrary';
import { RefImageLibrary } from './RefImageLibrary';
import { UserStlLibrarySection } from './UserStlLibrarySection';

interface LibraryPanelProps {
  width: number;
  isMobile?: boolean;
  isOpen?: boolean;
}

export function LibraryPanel({ width, isMobile, isOpen }: LibraryPanelProps) {
  const {
    isAuthenticated,
    libraryItems, isLibraryLoading, isLibrariesLoading,
    libraryError, librariesError, categories,
  } = useWorkspace();

  const [libraryTab, setLibraryTab] = useState<'items' | 'images'>('items');
  const [libraryCategory, setLibraryCategory] = useState<string | null>(null);

  return (
    <section
      className={`library-panel${isOpen ? ' library-panel--open' : ''}`}
      style={isMobile ? undefined : { width, minWidth: width }}
    >
      <div className="library-panel-header">
        <div className="library-panel-header-icon">⊞</div>
        <div className="library-panel-header-text">
          <span className="library-panel-title">Component Library</span>
          <span className="library-panel-subtitle">Drag to workspace</span>
        </div>
      </div>
      <div className="library-panel-tabs">
        <button
          className={`library-cat-tab${libraryTab === 'items' && !libraryCategory ? ' active' : ''}`}
          onClick={() => { setLibraryTab('items'); setLibraryCategory(null); }}
          type="button"
        >All</button>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`library-cat-tab${libraryTab === 'items' && libraryCategory === cat.id ? ' active' : ''}`}
            onClick={() => { setLibraryTab('items'); setLibraryCategory(cat.id); }}
            type="button"
          >{cat.name}</button>
        ))}
        {isAuthenticated && (
          <button
            className={`library-cat-tab${libraryTab === 'images' ? ' active' : ''}`}
            onClick={() => setLibraryTab('images')}
            type="button"
          >Images</button>
        )}
      </div>
      <div className="library-panel-content">
        {libraryTab === 'items' ? (
          <>
            <ItemLibrary
              items={libraryItems}
              isLoading={isLibraryLoading || isLibrariesLoading}
              error={libraryError || librariesError}
              activeCategory={libraryCategory}
            />
            {isAuthenticated && <UserStlLibrarySection />}
          </>
        ) : isAuthenticated ? (
          <RefImageLibrary />
        ) : (
          <div className="ref-image-auth-prompt">
            <p>Sign in to upload and manage reference images.</p>
          </div>
        )}
      </div>
    </section>
  );
}
```

### Step 3.3 — Update WorkspacePage

- [ ] Modify `packages/app/src/pages/WorkspacePage.tsx`

**Change 1:** Add import after the existing import block (after line 17, the `exportToPdf` import):

```ts
import { useMobileLayout } from '../hooks/useMobileLayout';
```

**Change 2:** After the `useGridTransform` hook call block (after line 79 ends the `useGridTransform` destructure), add the hook call:

```ts
  const {
    isMobile,
    libraryOpen,
    settingsOpen,
    toggleLibrary,
    toggleSettings,
    closeLibrary,
    closeSettings,
  } = useMobileLayout();
```

**Change 3:** Replace the entire `return (` block (lines 312–386) with:

```tsx
  return (
    <>
      <div className="mobile-panel-strip mobile-panel-strip--left" aria-hidden="true">
        <button
          className={`mobile-toggle-btn${settingsOpen ? ' active' : ''}`}
          onClick={toggleSettings}
          type="button"
          aria-label="Toggle settings panel"
          title="Settings"
        >
          ⊞
        </button>
      </div>

      <SidebarPanel
        dimensionsContent={dimensionsContent}
        spacerContent={spacerContent}
        onClearCanvas={handleClearAll}
        onReset={handleReset}
        isReadOnly={isReadOnly}
        isOpen={isMobile && settingsOpen}
      />

      <section className={`preview${isReadOnly ? ' canvas-readonly' : ''}`}>
        <nav className="canvas-breadcrumb" aria-label="breadcrumb">
          <span className="canvas-breadcrumb-item">Workspace</span>
          {layoutMeta.name && (
            <>
              <span className="canvas-breadcrumb-sep">›</span>
              <span className="canvas-breadcrumb-item canvas-breadcrumb-current">{layoutMeta.name}</span>
            </>
          )}
        </nav>
        <div className="preview-toolbar">
          <WorkspaceToolbar onExportPdf={handleExportPdf} exportPdfError={exportPdfError} />
          <ImageViewToggle mode={imageViewMode} onToggle={toggleImageViewMode} />
          <ZoomControls zoom={transform.zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onResetZoom={resetZoom} onFitToScreen={handleFitToScreen} />
        </div>
        <GridViewport
          viewportRef={viewportRef}
          transform={transform}
          handleWheel={handleWheel}
          pan={pan}
          isSpaceHeldRef={isSpaceHeldRef}
          handleTouchStart={handleTouchStart}
          handleTouchMove={handleTouchMove}
          handleTouchEnd={handleTouchEnd}
        >
          <GridPreview
            gridX={gridResult.gridX}
            gridY={gridResult.gridY}
            placedItems={placedItems}
            selectedItemIds={selectedItemIds}
            spacers={spacers}
            imageViewMode={imageViewMode}
            onDrop={handleCombinedDrop}
            onSelectItem={(id, mods) => { selectItem(id, mods); if (id) setSelectedImageId(null); }}
            getItemById={getItemById}
            onDeleteItem={deleteItem}
            onRotateItemCw={(id) => rotateItem(id, 'cw')}
            onRotateItemCcw={(id) => rotateItem(id, 'ccw')}
            onItemCustomizationChange={updateItemCustomization}
            onItemCustomizationReset={(id) => updateItemCustomization(id, undefined)}
            onDuplicateItem={duplicateItem}
            getLibraryMeta={getLibraryMeta}
            referenceImages={referenceImagesForGrid}
            selectedImageId={selectedImageId}
            onImagePositionChange={updateRefImagePosition}
            onImageSelect={(id) => { setSelectedImageId(id); deselectAll(); }}
            onImageScaleChange={updateRefImageScale}
            onImageOpacityChange={updateRefImageOpacity}
            onImageRemove={handleRemoveImage}
            onImageToggleLock={toggleRefImageLock}
            onImageRotateCw={(id) => updateRefImageRotation(id, 'cw')}
            onImageRotateCcw={(id) => updateRefImageRotation(id, 'ccw')}
            refImageMetadata={refImageMetadata}
            onRefImageRebind={handleRebindImage}
            snapPreview={snapPreview}
            onSnapChange={setRawSnapPreview}
          />
        </GridViewport>

        {isMobile && (libraryOpen || settingsOpen) && (
          <div
            className="mobile-backdrop mobile-backdrop--visible"
            onClick={() => { closeLibrary(); closeSettings(); }}
            aria-hidden="true"
          />
        )}
      </section>

      <div
        className="library-resize-handle"
        {...(!isMobile ? { onMouseDown: handleLibraryResizeStart } : {})}
        role="separator"
        aria-label="Resize library panel"
      />

      <LibraryPanel width={libraryWidth} isMobile={isMobile} isOpen={isMobile && libraryOpen} />

      <div className="mobile-panel-strip mobile-panel-strip--right" aria-hidden="true">
        <button
          className={`mobile-toggle-btn${libraryOpen ? ' active' : ''}`}
          onClick={toggleLibrary}
          type="button"
          aria-label="Toggle library panel"
          title="Component Library"
        >
          ☰
        </button>
      </div>
    </>
  );
```

### Step 3.4 — Run tests and lint

- [ ] Run: `npm run lint --workspace=packages/app 2>&1 | tail -5`
- [ ] Run: `npm run test:run --workspace=packages/app 2>&1 | tail -8`

Expected: lint clean, all existing tests pass plus the 9 new `useMobileLayout` tests.

### Step 3.5 — Commit

```bash
git add packages/app/src/components/SidebarPanel.tsx \
        packages/app/src/components/LibraryPanel.tsx \
        packages/app/src/pages/WorkspacePage.tsx
git commit -m "feat(mobile): wire useMobileLayout into WorkspacePage, SidebarPanel, LibraryPanel"
```

---

## Task 4: Mobile E2E page object + test spec

**TDD order: write page object and failing tests first, then verify they pass once the implementation is wired in.**

### Step 4.1 — Create MobileLayoutPage page object

- [ ] Create `packages/app/e2e/pages/MobileLayoutPage.ts`

```ts
// packages/app/e2e/pages/MobileLayoutPage.ts
import type { Page, Locator } from '@playwright/test';

export class MobileLayoutPage {
  readonly page: Page;
  readonly settingsStrip: Locator;
  readonly libraryStrip: Locator;
  readonly settingsToggleBtn: Locator;
  readonly libraryToggleBtn: Locator;
  readonly sidebar: Locator;
  readonly libraryPanel: Locator;
  readonly backdrop: Locator;
  readonly gridContainer: Locator;
  readonly libraryItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.settingsStrip = page.locator('.mobile-panel-strip--left');
    this.libraryStrip = page.locator('.mobile-panel-strip--right');
    this.settingsToggleBtn = page.locator('.mobile-panel-strip--left .mobile-toggle-btn');
    this.libraryToggleBtn = page.locator('.mobile-panel-strip--right .mobile-toggle-btn');
    this.sidebar = page.locator('.sidebar');
    this.libraryPanel = page.locator('.library-panel');
    this.backdrop = page.locator('.mobile-backdrop--visible');
    this.gridContainer = page.locator('.grid-container');
    this.libraryItems = page.locator('.library-item-card');
  }

  async gotoMobile(): Promise<void> {
    await this.page.goto('/');
    await this.gridContainer.waitFor({ state: 'visible' });
  }

  async isSettingsOpen(): Promise<boolean> {
    return await this.sidebar.evaluate((el) =>
      el.classList.contains('sidebar--open'),
    );
  }

  async isLibraryOpen(): Promise<boolean> {
    return await this.libraryPanel.evaluate((el) =>
      el.classList.contains('library-panel--open'),
    );
  }

  async openSettings(): Promise<void> {
    await this.settingsToggleBtn.click();
  }

  async closeSettings(): Promise<void> {
    // Close via backdrop click
    await this.backdrop.click();
  }

  async openLibrary(): Promise<void> {
    await this.libraryToggleBtn.click();
  }

  async closeLibrary(): Promise<void> {
    // Close via backdrop click
    await this.backdrop.click();
  }

  async waitForLibraryReady(): Promise<void> {
    await this.openLibrary();
    await this.page.locator('.item-library').waitFor({ state: 'visible' });
    await this.page
      .locator('.library-loading')
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});
    await this.libraryItems.first().waitFor({ state: 'visible', timeout: 10000 });
  }
}
```

### Step 4.2 — Create mobile-layout E2E spec

- [ ] Create `packages/app/e2e/tests/mobile-layout.spec.ts`

```ts
// packages/app/e2e/tests/mobile-layout.spec.ts
import { test, expect } from '@playwright/test';
import { MobileLayoutPage } from '../pages/MobileLayoutPage';

test.describe('Mobile Layout', () => {
  // Use tablet viewport for all tests in this describe block
  test.use({ viewport: { width: 768, height: 1024 } });

  let mobilePage: MobileLayoutPage;

  test.beforeEach(async ({ page }) => {
    // Clear persisted panel state so each test starts fresh
    await page.addInitScript(() => {
      localStorage.removeItem('gridfinity-mobile-layout');
    });
    mobilePage = new MobileLayoutPage(page);
    await mobilePage.gotoMobile();
  });

  test('settings panel is collapsed by default on tablet', async () => {
    const isOpen = await mobilePage.isSettingsOpen();
    expect(isOpen).toBe(false);
  });

  test('library panel is collapsed by default on tablet', async () => {
    const isOpen = await mobilePage.isLibraryOpen();
    expect(isOpen).toBe(false);
  });

  test('tapping settings toggle opens settings panel', async () => {
    await mobilePage.openSettings();
    const isOpen = await mobilePage.isSettingsOpen();
    expect(isOpen).toBe(true);
  });

  test('tapping backdrop closes settings panel', async () => {
    await mobilePage.openSettings();
    expect(await mobilePage.isSettingsOpen()).toBe(true);
    await mobilePage.closeSettings();
    expect(await mobilePage.isSettingsOpen()).toBe(false);
  });

  test('tapping library toggle opens library panel', async () => {
    await mobilePage.openLibrary();
    const isOpen = await mobilePage.isLibraryOpen();
    expect(isOpen).toBe(true);
  });

  test('mutual exclusion: opening library when settings is open closes settings', async ({ page }) => {
    await mobilePage.openSettings();
    expect(await mobilePage.isSettingsOpen()).toBe(true);

    // Now open library
    await mobilePage.libraryToggleBtn.click();

    expect(await mobilePage.isLibraryOpen()).toBe(true);
    expect(await mobilePage.isSettingsOpen()).toBe(false);
  });

  test('grid container is visible when both panels are closed', async () => {
    // Both panels start closed; grid should be visible
    await expect(mobilePage.gridContainer).toBeVisible();
  });

  test('library card width is at most 80px on tablet', async () => {
    await mobilePage.waitForLibraryReady();
    const firstCard = mobilePage.libraryItems.first();
    const box = await firstCard.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(80);
  });

  test('panel state persists after page refresh (library stays open)', async ({ page }) => {
    await mobilePage.openLibrary();
    expect(await mobilePage.isLibraryOpen()).toBe(true);

    // Reload without clearing localStorage
    await page.reload();
    await mobilePage.gridContainer.waitFor({ state: 'visible' });

    const isStillOpen = await mobilePage.isLibraryOpen();
    expect(isStillOpen).toBe(true);
  });
});
```

### Step 4.3 — Run mobile E2E tests

- [ ] Run: `npm run test:e2e -- --grep "Mobile Layout" 2>&1 | tail -12`

Expected output (all 9 tests pass):
```
  ✓  Mobile Layout › settings panel is collapsed by default on tablet
  ✓  Mobile Layout › library panel is collapsed by default on tablet
  ✓  Mobile Layout › tapping settings toggle opens settings panel
  ✓  Mobile Layout › tapping backdrop closes settings panel
  ✓  Mobile Layout › tapping library toggle opens library panel
  ✓  Mobile Layout › mutual exclusion: opening library when settings is open closes settings
  ✓  Mobile Layout › grid container is visible when both panels are closed
  ✓  Mobile Layout › library card width is at most 80px on tablet
  ✓  Mobile Layout › panel state persists after page refresh (library stays open)

  9 passed
```

### Step 4.4 — Commit

```bash
git add packages/app/e2e/pages/MobileLayoutPage.ts \
        packages/app/e2e/tests/mobile-layout.spec.ts
git commit -m "feat(mobile): add MobileLayoutPage page object and mobile-layout E2E spec"
```

---

## Task 5: Audit existing E2E tests for mobile viewport assumptions

### Step 5.1 — Check default viewport

The Playwright config (`packages/app/playwright.config.ts`) uses `devices['Desktop Chrome']` with no explicit viewport override. The Desktop Chrome device has a **default viewport of 1280×720**, which is **greater than 1024px**.

Since 1280 > 1024, the mobile breakpoint never activates during the existing test suite. The library panel remains visible (not hidden behind a collapsed overlay), so `libraryPage.waitForLibraryReady()` — which waits for `.item-library` to be `visible` — continues to work without modification.

**Result: No changes are required to any existing spec files.**

### Step 5.2 — Confirm full suite still passes

- [ ] Run: `npm run test:e2e 2>&1 | tail -10`

Expected: all previously-passing tests continue to pass; 9 new mobile-layout tests also pass.

### Step 5.3 — Commit

```bash
git commit --allow-empty -m "chore(mobile): audit confirms existing E2E tests unaffected (desktop viewport 1280px > 1024px breakpoint)"
```

---

## Completion checklist

- [ ] Task 1: `useMobileLayout` hook with 9 passing unit tests
- [ ] Task 2: CSS overlay layout replacing broken stacked media queries
- [ ] Task 3: `WorkspacePage`, `SidebarPanel`, `LibraryPanel` wired to hook
- [ ] Task 4: `MobileLayoutPage` page object + 9 passing E2E tests
- [ ] Task 5: Existing E2E suite audited — no viewport fixes needed (1280px default)
- [ ] `npm run lint` passes clean
- [ ] `npm run test:run` passes (all unit tests)
- [ ] `npm run test:e2e` passes (all E2E tests including new mobile spec)
