# Mobile Toolbar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overflowing mobile toolbar with a bottom action bar + floating zoom overlay, and add an unsaved-changes indicator in the breadcrumb for all screen sizes.

**Architecture:** Three independent changes wired together in WorkspacePage: (1) `isDirty` boolean in WorkspaceContext drives the breadcrumb indicator; (2) ZoomControls moves from preview-toolbar into GridViewport as an absolutely-positioned overlay; (3) MobileActionBar replaces preview-toolbar on mobile (≤1024px, matching the existing `isMobile` breakpoint).

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, CSS custom properties (existing `--bg-secondary`, `--border-primary`, `--accent-primary` etc.)

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `packages/app/src/contexts/WorkspaceContext.tsx` | Modify | Add `isDirty` state, mount/skip refs, wrap handleSaveComplete + handleLoadLayout + loadLayout to reset dirty |
| `packages/app/src/pages/WorkspacePage.tsx` | Modify | Breadcrumb indicator; remove ZoomControls from toolbar; conditional MobileActionBar; handleMobileSave |
| `packages/app/src/components/ZoomControls.tsx` | Modify | Add optional `showReset` prop (hides 1:1 button on mobile) |
| `packages/app/src/components/ZoomControls.test.tsx` | Modify | Add tests for `showReset` prop |
| `packages/app/src/components/GridViewport.tsx` | Modify | Accept zoom props; render floating ZoomControls overlay |
| `packages/app/src/components/GridViewport.test.tsx` | Modify | Add tests for zoom overlay rendering |
| `packages/app/src/components/MobileActionBar.tsx` | Create | Bottom tab bar component (5 buttons, long-press Save) |
| `packages/app/src/components/MobileActionBar.test.tsx` | Create | Unit tests for MobileActionBar |
| `packages/app/src/App.css` | Modify | Styles for floating zoom, unsaved indicator, mobile action bar |
| `packages/app/src/App.test.tsx` | Modify | Tests for isDirty breadcrumb indicator |

---

## Task 1: Add `isDirty` to WorkspaceContext

**Files:**
- Modify: `packages/app/src/contexts/WorkspaceContext.tsx`
- Modify: `packages/app/src/App.test.tsx`

- [ ] **Step 1: Write the failing tests in App.test.tsx**

Add this describe block after the existing tests (before the closing of the outermost describe):

```tsx
describe('isDirty breadcrumb indicator', () => {
  beforeEach(() => {
    mockIsAuthenticated = false;
  });

  it('does not show unsaved indicator on a fresh canvas with no saved layout', () => {
    renderApp();
    expect(screen.queryByText('unsaved changes')).not.toBeInTheDocument();
  });

  it('does not show unsaved indicator immediately after save completes', async () => {
    renderApp();
    // Simulate a successful save (sets layoutMeta.id)
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
      onSaveComplete(42, 'My Drawer');
    });
    expect(screen.queryByText('unsaved changes')).not.toBeInTheDocument();
  });

  it('shows unsaved indicator after placing an item on a saved layout', async () => {
    renderApp();
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
      onSaveComplete(42, 'My Drawer');
    });
    placeItemViaGridPreview();
    await waitFor(() => {
      expect(screen.getByText('unsaved changes')).toBeInTheDocument();
    });
  });

  it('hides unsaved indicator after saving again', async () => {
    renderApp();
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
      onSaveComplete(42, 'My Drawer');
    });
    placeItemViaGridPreview();
    await waitFor(() => {
      expect(screen.getByText('unsaved changes')).toBeInTheDocument();
    });
    // Save again
    mockUpdateMutateAsync.mockResolvedValueOnce({ id: 42, name: 'My Drawer' });
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string) => void;
      onSaveComplete(42, 'My Drawer');
    });
    await waitFor(() => {
      expect(screen.queryByText('unsaved changes')).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd packages/app && npx vitest run src/App.test.tsx --reporter=verbose 2>&1 | grep -A3 "isDirty breadcrumb"
```

Expected: 3 of 4 tests fail (the `queryByText` ones fail because the element/context doesn't exist yet).

- [ ] **Step 3: Add `isDirty` state to WorkspaceContext**

In `WorkspaceContext.tsx`, add to the `WorkspaceContextValue` interface after `handleClearLayout`:

```ts
// Dirty state
isDirty: boolean;
```

- [ ] **Step 4: Add state + refs in WorkspaceProvider body**

After the `const [exportPdfError, setExportPdfError] = useState...` line (~line 213), add:

```ts
const [isDirty, setIsDirty] = useState(false);
const mountedRef = useRef(false);
const skipNextDirtyRef = useRef(false);
```

- [ ] **Step 5: Add the dirty-tracking useEffect**

After the `handleReset` callback definition (~line 374), add:

```ts
useEffect(() => {
  if (!mountedRef.current) {
    mountedRef.current = true;
    return;
  }
  if (skipNextDirtyRef.current) {
    skipNextDirtyRef.current = false;
    return;
  }
  setIsDirty(true);
}, [placedItems, refImagePlacements, spacerConfig, drawerWidth, drawerDepth]);
```

- [ ] **Step 6: Wrap handleSaveComplete to reset isDirty**

The existing destructure from `useLayoutActions` is:
```ts
const {
  handleSaveComplete,
  handleCloneCurrentLayout,
} = useLayoutActions({...});
```

Change it to rename and wrap:

```ts
const {
  handleSaveComplete: actionsHandleSaveComplete,
  handleCloneCurrentLayout,
} = useLayoutActions({
  layoutId: layoutMeta.id,
  cloneLayoutMutation,
  handleCloneComplete,
  rawHandleSaveComplete,
});

const handleSaveComplete = useCallback((id: number, name: string) => {
  actionsHandleSaveComplete(id, name);
  setIsDirty(false);
}, [actionsHandleSaveComplete]);
```

- [ ] **Step 7: Wrap handleLoadLayout and loadLayout to reset isDirty**

The existing destructure from `useLayoutLoader` is:
```ts
const { handleLoadLayout, loadLayout } = useLayoutLoader({...});
```

Change it to:

```ts
const { handleLoadLayout: rawHandleLoadLayout, loadLayout: rawLoadLayout } = useLayoutLoader({
  unitSystem, setWidth, setDepth, setSpacerConfig,
  loadItems, loadRefImagePlacements, layoutDispatch, getAccessToken,
  clearExtras,
});

const handleLoadLayout = useCallback((config: LoadedLayoutConfig) => {
  skipNextDirtyRef.current = true;
  rawHandleLoadLayout(config);
  setIsDirty(false);
}, [rawHandleLoadLayout]);

const loadLayout = useCallback(async (id: number) => {
  skipNextDirtyRef.current = true;
  await rawLoadLayout(id);
  setIsDirty(false);
}, [rawLoadLayout]);
```

- [ ] **Step 8: Expose `isDirty` in the context value object**

In the `value` object near `handleSaveComplete`, add:

```ts
// Dirty state
isDirty,
```

- [ ] **Step 9: Run the tests**

```bash
cd packages/app && npx vitest run src/App.test.tsx --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL|isDirty"
```

Expected: all 4 isDirty tests pass.

- [ ] **Step 10: Run full test suite to check no regressions**

```bash
cd packages/app && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add packages/app/src/contexts/WorkspaceContext.tsx packages/app/src/App.test.tsx
git commit -m "feat(context): add isDirty state to WorkspaceContext"
```

---

## Task 2: Breadcrumb unsaved changes indicator

**Files:**
- Modify: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/App.css`

- [ ] **Step 1: Add CSS for the unsaved indicator**

In `App.css`, after the `.canvas-breadcrumb-current` rule (~line 1001), add:

```css
.unsaved-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  flex-shrink: 0;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
}

.unsaved-label {
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: #92400e;
  background: #451a03;
  border: 1px solid #78350f;
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  white-space: nowrap;
}
```

- [ ] **Step 2: Update the breadcrumb in WorkspacePage**

In `WorkspacePage.tsx`, add `isDirty` to the useWorkspace destructure. The existing destructure has `layoutMeta` — add `isDirty` near it:

```ts
const {
  // ... existing ...
  layoutMeta,
  isDirty,
  // ... rest ...
} = ws;
```

Find the breadcrumb JSX (around line 346):
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

Replace with:
```tsx
<nav className="canvas-breadcrumb" aria-label="breadcrumb">
  <span className="canvas-breadcrumb-item">Workspace</span>
  {layoutMeta.name && (
    <>
      <span className="canvas-breadcrumb-sep">›</span>
      <span className="canvas-breadcrumb-item canvas-breadcrumb-current">{layoutMeta.name}</span>
    </>
  )}
  {isDirty && layoutMeta.id && (
    <>
      <span className="unsaved-dot" aria-hidden="true" />
      <span className="unsaved-label">unsaved changes</span>
    </>
  )}
</nav>
```

- [ ] **Step 3: Run the isDirty tests**

```bash
cd packages/app && npx vitest run src/App.test.tsx --reporter=verbose 2>&1 | grep -E "isDirty|unsaved"
```

Expected: all 4 isDirty tests pass.

- [ ] **Step 4: Run full test suite**

```bash
cd packages/app && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/pages/WorkspacePage.tsx packages/app/src/App.css
git commit -m "feat(ui): add unsaved changes indicator to breadcrumb"
```

---

## Task 3: ZoomControls `showReset` prop

**Files:**
- Modify: `packages/app/src/components/ZoomControls.tsx`
- Modify: `packages/app/src/components/ZoomControls.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `ZoomControls.test.tsx`, add inside the `describe('Rendering')` block:

```ts
it('renders reset zoom button by default', () => {
  render(<ZoomControls {...defaultProps} />);
  expect(screen.getByLabelText('Reset zoom')).toBeInTheDocument();
});

it('hides reset zoom button when showReset is false', () => {
  render(<ZoomControls {...defaultProps} showReset={false} />);
  expect(screen.queryByLabelText('Reset zoom')).not.toBeInTheDocument();
});

it('shows reset zoom button when showReset is true', () => {
  render(<ZoomControls {...defaultProps} showReset={true} />);
  expect(screen.getByLabelText('Reset zoom')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/app && npx vitest run src/components/ZoomControls.test.tsx 2>&1 | tail -10
```

Expected: "hides reset zoom button when showReset is false" fails.

- [ ] **Step 3: Add `showReset` prop to ZoomControls**

Replace the entire `ZoomControls.tsx` with:

```tsx
import { MIN_ZOOM, MAX_ZOOM } from '../utils/constants';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToScreen: () => void;
  showReset?: boolean;
}

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToScreen,
  showReset = true,
}: ZoomControlsProps) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="zoom-controls" role="toolbar" aria-label="Zoom controls">
      <button
        className="zoom-control-btn"
        onClick={onZoomOut}
        disabled={zoom <= MIN_ZOOM}
        aria-label="Zoom out"
        title="Zoom out (-)"
      >
        -
      </button>
      <span className="zoom-level" aria-live="polite">
        {zoomPercent}%
      </span>
      <button
        className="zoom-control-btn"
        onClick={onZoomIn}
        disabled={zoom >= MAX_ZOOM}
        aria-label="Zoom in"
        title="Zoom in (+)"
      >
        +
      </button>
      {showReset && (
        <button
          className="zoom-control-btn"
          onClick={onResetZoom}
          aria-label="Reset zoom"
          title="Reset to 100% (Ctrl+0)"
        >
          1:1
        </button>
      )}
      <button
        className="zoom-control-btn"
        onClick={onFitToScreen}
        aria-label="Fit to screen"
        title="Fit to screen"
      >
        Fit
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/app && npx vitest run src/components/ZoomControls.test.tsx 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/ZoomControls.tsx packages/app/src/components/ZoomControls.test.tsx
git commit -m "feat(zoom): add showReset prop to ZoomControls"
```

---

## Task 4: Floating ZoomControls overlay in GridViewport

**Files:**
- Modify: `packages/app/src/components/GridViewport.tsx`
- Modify: `packages/app/src/components/GridViewport.test.tsx`
- Modify: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/App.css`

- [ ] **Step 1: Write failing tests for GridViewport zoom overlay**

In `GridViewport.test.tsx`:
1. At the very top of the file (before any `describe`), add the mock:

```tsx
vi.mock('./ZoomControls', () => ({
  ZoomControls: (props: Record<string, unknown>) => (
    <div data-testid="floating-zoom" data-show-reset={String(props.showReset)} />
  ),
}));
```

2. After the existing `describe` blocks, add:

```tsx
describe('Floating zoom overlay', () => {
  const zoomProps = {
    zoom: 1,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    onFitToScreen: vi.fn(),
    showResetZoom: true,
  };

  it('does not render zoom overlay when zoom props are not provided', () => {
    render(<GridViewport {...defaultProps}><div>content</div></GridViewport>);
    expect(screen.queryByTestId('floating-zoom')).not.toBeInTheDocument();
  });

  it('renders zoom overlay when zoom props are provided', () => {
    render(
      <GridViewport {...defaultProps} zoomOverlayProps={zoomProps}>
        <div>content</div>
      </GridViewport>
    );
    expect(screen.getByTestId('floating-zoom')).toBeInTheDocument();
  });

  it('passes showReset false to ZoomControls when showResetZoom is false', () => {
    render(
      <GridViewport {...defaultProps} zoomOverlayProps={{ ...zoomProps, showResetZoom: false }}>
        <div>content</div>
      </GridViewport>
    );
    expect(screen.getByTestId('floating-zoom')).toHaveAttribute('data-show-reset', 'false');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/app && npx vitest run src/components/GridViewport.test.tsx 2>&1 | tail -10
```

Expected: the 3 new zoom overlay tests fail.

- [ ] **Step 3: Add zoom overlay to GridViewport**

Replace the entire `GridViewport.tsx` with:

```tsx
import { useEffect, useRef, type ReactNode, type RefObject, type MutableRefObject } from 'react';
import type { GridTransform } from '../hooks/useGridTransform';
import { ZoomControls } from './ZoomControls';

interface ZoomOverlayProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToScreen: () => void;
  showResetZoom: boolean;
}

interface GridViewportProps {
  children: ReactNode;
  transform: GridTransform;
  handleWheel: (e: WheelEvent, rect: DOMRect) => void;
  pan: (dx: number, dy: number) => void;
  isSpaceHeldRef: MutableRefObject<boolean>;
  viewportRef?: RefObject<HTMLDivElement | null>;
  handleTouchStart: (e: TouchEvent) => void;
  handleTouchMove: (e: TouchEvent) => void;
  handleTouchEnd: () => void;
  zoomOverlayProps?: ZoomOverlayProps;
}

export function GridViewport({
  children,
  transform,
  handleWheel,
  pan,
  isSpaceHeldRef,
  viewportRef: externalRef,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  zoomOverlayProps,
}: GridViewportProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = externalRef ?? internalRef;
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  const isTransformed = transform.zoom !== 1 || transform.panX !== 0 || transform.panY !== 0;

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      const rect = viewport.getBoundingClientRect();
      handleWheel(e, rect);
    };
    // passive: false is required -- handler calls preventDefault() to capture wheel zoom
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [handleWheel, ref]);

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || isSpaceHeldRef.current) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        viewport.style.cursor = 'grabbing';
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = (e.clientX - panStartRef.current.x) / transform.zoom;
      const dy = (e.clientY - panStartRef.current.y) / transform.zoom;
      pan(dx, dy);
      panStartRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        viewport.style.cursor = isSpaceHeldRef.current ? 'grab' : '';
      }
    };
    viewport.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      viewport.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [pan, transform.zoom, isSpaceHeldRef, ref]);

  useEffect(() => {
    const viewport = ref.current;
    if (!viewport) return;
    // passive: false required — handlers call preventDefault() to suppress browser scroll/zoom
    viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false });
    viewport.addEventListener('touchend', handleTouchEnd);
    viewport.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart);
      viewport.removeEventListener('touchmove', handleTouchMove);
      viewport.removeEventListener('touchend', handleTouchEnd);
      viewport.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, ref]);

  return (
    <div
      ref={ref}
      className={`preview-viewport${isTransformed ? ' zoomed' : ''}`}
      data-testid="preview-viewport"
    >
      <div
        className={`preview-content${isTransformed ? ' transformed' : ''}`}
        style={isTransformed ? {
          transform: `scale(${transform.zoom}) translate(${transform.panX}px, ${transform.panY}px)`,
          transformOrigin: '0 0',
        } : undefined}
      >
        {children}
      </div>
      {zoomOverlayProps && (
        <div className="floating-zoom-overlay">
          <ZoomControls
            zoom={zoomOverlayProps.zoom}
            onZoomIn={zoomOverlayProps.onZoomIn}
            onZoomOut={zoomOverlayProps.onZoomOut}
            onResetZoom={zoomOverlayProps.onResetZoom}
            onFitToScreen={zoomOverlayProps.onFitToScreen}
            showReset={zoomOverlayProps.showResetZoom}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS for the floating zoom overlay**

In `App.css`, after the `.zoom-control-btn:disabled` rule (~line 1068), add:

```css
.floating-zoom-overlay {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 10;
  pointer-events: auto;
}

.floating-zoom-overlay .zoom-controls {
  background: color-mix(in srgb, var(--bg-secondary) 92%, transparent);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  padding: 3px 5px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
```

- [ ] **Step 5: Update WorkspacePage — pass zoomOverlayProps to GridViewport, remove ZoomControls from toolbar**

In `WorkspacePage.tsx`, the existing `GridViewport` usage (around line 360) currently receives no zoom props. Update it to pass `zoomOverlayProps`:

Find:
```tsx
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
```

Replace with:
```tsx
<GridViewport
  viewportRef={viewportRef}
  transform={transform}
  handleWheel={handleWheel}
  pan={pan}
  isSpaceHeldRef={isSpaceHeldRef}
  handleTouchStart={handleTouchStart}
  handleTouchMove={handleTouchMove}
  handleTouchEnd={handleTouchEnd}
  zoomOverlayProps={{
    zoom: transform.zoom,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    onResetZoom: resetZoom,
    onFitToScreen: handleFitToScreen,
    showResetZoom: !isMobile,
  }}
>
```

Then in the `preview-toolbar` div (around line 355), remove the `<ZoomControls>` line:

Find:
```tsx
<div className="preview-toolbar">
  <WorkspaceToolbar onExportPdf={handleExportPdf} exportPdfError={exportPdfError} />
  <ImageViewToggle mode={imageViewMode} onToggle={toggleImageViewMode} />
  <ZoomControls zoom={transform.zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onResetZoom={resetZoom} onFitToScreen={handleFitToScreen} />
</div>
```

Replace with:
```tsx
<div className="preview-toolbar">
  <WorkspaceToolbar onExportPdf={handleExportPdf} exportPdfError={exportPdfError} />
  <ImageViewToggle mode={imageViewMode} onToggle={toggleImageViewMode} />
</div>
```

Also remove the `ZoomControls` import from WorkspacePage.tsx if it's no longer used there (it's now used inside GridViewport).

- [ ] **Step 6: Run GridViewport tests**

```bash
cd packages/app && npx vitest run src/components/GridViewport.test.tsx 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 7: Run full test suite**

```bash
cd packages/app && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/app/src/components/GridViewport.tsx packages/app/src/components/GridViewport.test.tsx packages/app/src/pages/WorkspacePage.tsx packages/app/src/App.css
git commit -m "feat(ui): move ZoomControls to floating canvas overlay"
```

---

## Task 5: Create MobileActionBar component

**Files:**
- Create: `packages/app/src/components/MobileActionBar.tsx`
- Create: `packages/app/src/components/MobileActionBar.test.tsx`
- Modify: `packages/app/src/App.css`

- [ ] **Step 1: Write the failing tests**

Create `packages/app/src/components/MobileActionBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MobileActionBar } from './MobileActionBar';
import type { ImageViewMode } from '../types/gridfinity';

const baseProps = {
  isAuthenticated: true,
  layoutMeta: { id: 42, name: 'Test Layout' },
  placedItems: [{ instanceId: 'i1', itemId: 'lib:item', x: 0, y: 0, width: 1, height: 1, rotation: 0 }],
  refImagePlacements: [],
  isSaving: false,
  imageViewMode: 'ortho' as ImageViewMode,
  onSave: vi.fn(),
  onSaveAsNew: vi.fn(),
  onLoad: vi.fn(),
  onExport: vi.fn().mockResolvedValue(undefined),
  onToggleView: vi.fn(),
  onClearAll: vi.fn(),
};

describe('MobileActionBar', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('rendering', () => {
    it('renders all 5 action buttons when authenticated', () => {
      render(<MobileActionBar {...baseProps} />);
      expect(screen.getByLabelText('Load layout')).toBeInTheDocument();
      expect(screen.getByLabelText('Save layout')).toBeInTheDocument();
      expect(screen.getByLabelText('Export PDF')).toBeInTheDocument();
      expect(screen.getByLabelText('Toggle view')).toBeInTheDocument();
      expect(screen.getByLabelText('Clear all')).toBeInTheDocument();
    });

    it('hides Load and Save when not authenticated', () => {
      render(<MobileActionBar {...baseProps} isAuthenticated={false} />);
      expect(screen.queryByLabelText('Load layout')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Save layout')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Export PDF')).toBeInTheDocument();
    });

    it('shows "Saving…" label on Save button when isSaving is true', () => {
      render(<MobileActionBar {...baseProps} isSaving={true} />);
      expect(screen.getByText('Saving…')).toBeInTheDocument();
    });

    it('shows "hold: new layout" sub-label when layout has an id', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: 42, name: 'x' }} />);
      expect(screen.getByText('hold: new layout')).toBeInTheDocument();
    });

    it('does not show "hold: new layout" sub-label when layout has no id', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: null, name: '' }} />);
      expect(screen.queryByText('hold: new layout')).not.toBeInTheDocument();
    });

    it('shows "3D" label on view toggle when mode is perspective', () => {
      render(<MobileActionBar {...baseProps} imageViewMode={'perspective' as ImageViewMode} />);
      expect(screen.getByText('3D')).toBeInTheDocument();
    });

    it('shows "Ortho" label on view toggle when mode is ortho', () => {
      render(<MobileActionBar {...baseProps} imageViewMode={'ortho' as ImageViewMode} />);
      expect(screen.getByText('Ortho')).toBeInTheDocument();
    });
  });

  describe('disabled states', () => {
    it('disables Export when placedItems is empty', () => {
      render(<MobileActionBar {...baseProps} placedItems={[]} />);
      expect(screen.getByLabelText('Export PDF')).toBeDisabled();
    });

    it('disables Clear when placedItems and refImagePlacements are both empty', () => {
      render(<MobileActionBar {...baseProps} placedItems={[]} refImagePlacements={[]} />);
      expect(screen.getByLabelText('Clear all')).toBeDisabled();
    });

    it('enables Clear when only refImagePlacements is non-empty', () => {
      render(<MobileActionBar {...baseProps} placedItems={[]} refImagePlacements={[{ id: 'r1', refImageId: 1, name: 'img', imageUrl: '', x: 0, y: 0, width: 10, height: 10, opacity: 1, scale: 1, isLocked: false, rotation: 0 }]} />);
      expect(screen.getByLabelText('Clear all')).not.toBeDisabled();
    });

    it('disables Save when no layout id and canvas is empty', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: null, name: '' }} placedItems={[]} refImagePlacements={[]} />);
      expect(screen.getByLabelText('Save layout')).toBeDisabled();
    });

    it('disables Save when isSaving is true', () => {
      render(<MobileActionBar {...baseProps} isSaving={true} />);
      expect(screen.getByLabelText('Save layout')).toBeDisabled();
    });
  });

  describe('tap actions', () => {
    it('calls onLoad when Load is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Load layout'));
      expect(baseProps.onLoad).toHaveBeenCalledTimes(1);
    });

    it('calls onSave when Save is tapped (has layout id)', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Save layout'));
      expect(baseProps.onSave).toHaveBeenCalledTimes(1);
    });

    it('calls onSave (opens dialog) when Save is tapped with no layout id', () => {
      render(<MobileActionBar {...baseProps} layoutMeta={{ id: null, name: '' }} />);
      fireEvent.click(screen.getByLabelText('Save layout'));
      expect(baseProps.onSave).toHaveBeenCalledTimes(1);
    });

    it('calls onExport when Export is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Export PDF'));
      expect(baseProps.onExport).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleView when View is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Toggle view'));
      expect(baseProps.onToggleView).toHaveBeenCalledTimes(1);
    });

    it('calls onClearAll when Clear is tapped', () => {
      render(<MobileActionBar {...baseProps} />);
      fireEvent.click(screen.getByLabelText('Clear all'));
      expect(baseProps.onClearAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('long-press Save', () => {
    it('calls onSaveAsNew after 500ms hold on Save button', async () => {
      vi.useFakeTimers();
      render(<MobileActionBar {...baseProps} />);
      const saveBtn = screen.getByLabelText('Save layout');
      fireEvent.pointerDown(saveBtn);
      act(() => { vi.advanceTimersByTime(500); });
      expect(baseProps.onSaveAsNew).toHaveBeenCalledTimes(1);
      expect(baseProps.onSave).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('does not call onSaveAsNew if pointer released before 500ms', () => {
      vi.useFakeTimers();
      render(<MobileActionBar {...baseProps} />);
      const saveBtn = screen.getByLabelText('Save layout');
      fireEvent.pointerDown(saveBtn);
      act(() => { vi.advanceTimersByTime(400); });
      fireEvent.pointerUp(saveBtn);
      act(() => { vi.advanceTimersByTime(200); });
      expect(baseProps.onSaveAsNew).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/app && npx vitest run src/components/MobileActionBar.test.tsx 2>&1 | tail -10
```

Expected: all tests fail — component does not exist yet.

- [ ] **Step 3: Create MobileActionBar.tsx**

Create `packages/app/src/components/MobileActionBar.tsx`:

```tsx
import { useRef, useCallback } from 'react';
import type { ImageViewMode, PlacedItemWithValidity } from '../types/gridfinity';
import type { RefImagePlacement } from '../hooks/useRefImagePlacements';

interface MobileActionBarProps {
  isAuthenticated: boolean;
  layoutMeta: { id: number | null; name: string };
  placedItems: PlacedItemWithValidity[];
  refImagePlacements: RefImagePlacement[];
  isSaving: boolean;
  imageViewMode: ImageViewMode;
  onSave: () => void;
  onSaveAsNew: () => void;
  onLoad: () => void;
  onExport: () => Promise<void>;
  onToggleView: () => void;
  onClearAll: () => void;
}

const LONG_PRESS_MS = 500;

export function MobileActionBar({
  isAuthenticated,
  layoutMeta,
  placedItems,
  refImagePlacements,
  isSaving,
  imageViewMode,
  onSave,
  onSaveAsNew,
  onLoad,
  onExport,
  onToggleView,
  onClearAll,
}: MobileActionBarProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const hasCanvas = placedItems.length > 0 || refImagePlacements.length > 0;

  const handleSavePointerDown = useCallback(() => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onSaveAsNew();
    }, LONG_PRESS_MS);
  }, [onSaveAsNew]);

  const handleSavePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleSaveClick = useCallback(() => {
    if (longPressTriggeredRef.current) return;
    onSave();
  }, [onSave]);

  const isSaveDisabled = isSaving
    || (!layoutMeta.id && !hasCanvas);

  return (
    <div className="mobile-action-bar" role="toolbar" aria-label="Workspace actions">
      {isAuthenticated && (
        <button
          className="mab-btn"
          aria-label="Load layout"
          onClick={onLoad}
          type="button"
        >
          <span className="mab-icon" aria-hidden="true">📂</span>
          <span className="mab-label">Load</span>
        </button>
      )}

      {isAuthenticated && (
        <button
          className={`mab-btn mab-save${layoutMeta.id ? ' mab-save--has-id' : ' mab-save--new'}`}
          aria-label="Save layout"
          onClick={handleSaveClick}
          onPointerDown={handleSavePointerDown}
          onPointerUp={handleSavePointerUp}
          onPointerLeave={handleSavePointerUp}
          disabled={isSaveDisabled}
          type="button"
        >
          <span className="mab-icon" aria-hidden="true">💾</span>
          <span className="mab-label">{isSaving ? 'Saving…' : 'Save'}</span>
          {layoutMeta.id && !isSaving && (
            <span className="mab-sublabel">hold: new layout</span>
          )}
        </button>
      )}

      <button
        className="mab-btn"
        aria-label="Export PDF"
        onClick={onExport}
        disabled={placedItems.length === 0}
        type="button"
      >
        <span className="mab-icon" aria-hidden="true">📄</span>
        <span className="mab-label">Export</span>
      </button>

      <button
        className="mab-btn"
        aria-label="Toggle view"
        onClick={onToggleView}
        type="button"
      >
        <span className="mab-icon" aria-hidden="true">⊞</span>
        <span className="mab-label">{imageViewMode === 'perspective' ? '3D' : 'Ortho'}</span>
      </button>

      <button
        className="mab-btn"
        aria-label="Clear all"
        onClick={onClearAll}
        disabled={!hasCanvas}
        type="button"
      >
        <span className="mab-icon" aria-hidden="true">🗑</span>
        <span className="mab-label">Clear</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Add CSS for MobileActionBar**

In `App.css`, at the end of the file before any `@media` queries that might conflict, add:

```css
/* ==============================
   Mobile Action Bar
   ============================== */

.mobile-action-bar {
  display: none; /* shown only on mobile via media query */
  align-items: stretch;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-primary);
  padding: 4px 4px 8px;
  gap: 2px;
  flex-shrink: 0;
}

.mab-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 3px;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  -webkit-user-select: none;
  user-select: none;
}

.mab-btn:disabled {
  opacity: 0.35;
  pointer-events: none;
}

.mab-btn:not(:disabled):active {
  background: var(--bg-hover);
}

.mab-icon {
  font-size: 20px;
  line-height: 1;
}

.mab-label {
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
}

.mab-sublabel {
  font-size: 7px;
  font-weight: 500;
  opacity: 0.7;
  line-height: 1;
  text-transform: none;
  letter-spacing: 0;
}

.mab-save--has-id {
  background: var(--accent-primary);
  color: white;
  flex: 1.2;
  border-radius: 10px;
}

.mab-save--has-id:not(:disabled):active {
  opacity: 0.85;
}

.mab-save--new {
  color: var(--accent-primary);
  border: 1.5px solid var(--accent-primary);
  flex: 1.2;
  border-radius: 10px;
}

@media (max-width: 1024px) {
  .mobile-action-bar {
    display: flex;
  }
}
```

- [ ] **Step 5: Run MobileActionBar tests**

```bash
cd packages/app && npx vitest run src/components/MobileActionBar.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Run full test suite**

```bash
cd packages/app && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/components/MobileActionBar.tsx packages/app/src/components/MobileActionBar.test.tsx packages/app/src/App.css
git commit -m "feat(ui): add MobileActionBar component"
```

---

## Task 6: Wire MobileActionBar into WorkspacePage

**Files:**
- Modify: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/App.css`

- [ ] **Step 1: Add imports, expand ws destructure, and add handlers in WorkspacePage**

In `WorkspacePage.tsx`, add these imports:

```ts
import { useUpdateLayoutMutation } from '../hooks/useLayouts';
import { buildPayload } from '../utils/layoutHelpers';
import { MobileActionBar } from '../components/MobileActionBar';
```

Expand the `ws` destructure to include the new fields needed by `handleMobileSave` and `MobileActionBar`. Add these to the existing destructure of `ws`:

```ts
// Add alongside layoutMeta:
handleSaveComplete,
isDirty,
// Add alongside drawerWidth already present or add fresh:
drawerWidth,
drawerDepth,
// Add alongside isAuthenticated if not present:
isAuthenticated,
```

(Check whether `drawerWidth`, `drawerDepth`, and `isAuthenticated` are already destructured from `ws` — if so, don't duplicate them.)

After the `handleExportPdf` callback definition, add:

```ts
const updateLayoutMutation = useUpdateLayoutMutation();

const handleMobileSave = useCallback(async () => {
  if (!layoutMeta.id) {
    dialogDispatch({ type: 'OPEN', dialog: 'save' });
    return;
  }
  const payload = buildPayload(
    layoutMeta.name, layoutMeta.description,
    gridResult.gridX, gridResult.gridY,
    drawerWidth, drawerDepth, spacerConfig, placedItems, refImagePlacements,
  );
  const result = await updateLayoutMutation.mutateAsync({ id: layoutMeta.id, data: payload });
  handleSaveComplete(result.id, result.name);
}, [layoutMeta, gridResult, drawerWidth, drawerDepth, spacerConfig, placedItems,
  refImagePlacements, updateLayoutMutation, handleSaveComplete, dialogDispatch]);

const handleMobileSaveAsNew = useCallback(() => {
  dialogDispatch({ type: 'OPEN', dialog: 'save' });
}, [dialogDispatch]);
```

- [ ] **Step 2: Add MobileActionBar to the JSX and hide preview-toolbar on mobile**

In WorkspacePage.tsx, after the `</nav>` breadcrumb closing tag and before `<GridViewport>`, update the preview-toolbar to only show on desktop, and add `MobileActionBar` inside the `.preview` section:

Find the existing toolbar div:
```tsx
<div className="preview-toolbar">
  <WorkspaceToolbar onExportPdf={handleExportPdf} exportPdfError={exportPdfError} />
  <ImageViewToggle mode={imageViewMode} onToggle={toggleImageViewMode} />
</div>
```

Replace with:
```tsx
<div className="preview-toolbar preview-toolbar--desktop-only">
  <WorkspaceToolbar onExportPdf={handleExportPdf} exportPdfError={exportPdfError} />
  <ImageViewToggle mode={imageViewMode} onToggle={toggleImageViewMode} />
</div>
```

Then, at the end of the `.preview` section (just before `</section>`), add:

```tsx
<MobileActionBar
  isAuthenticated={isAuthenticated}
  layoutMeta={layoutMeta}
  placedItems={placedItems}
  refImagePlacements={refImagePlacements}
  isSaving={updateLayoutMutation.isPending}
  imageViewMode={imageViewMode}
  onSave={handleMobileSave}
  onSaveAsNew={handleMobileSaveAsNew}
  onLoad={() => navigate('/configs')}
  onExport={handleExportPdf}
  onToggleView={toggleImageViewMode}
  onClearAll={handleClearAll}
/>
```

- [ ] **Step 3: Add CSS to hide desktop toolbar on mobile**

In `App.css`, inside the `@media (max-width: 1024px)` block, add:

```css
.preview-toolbar--desktop-only {
  display: none;
}
```

- [ ] **Step 4: Run full test suite**

```bash
cd packages/app && npx vitest run 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Run linter**

```bash
cd packages/app && npx eslint src/pages/WorkspacePage.tsx src/components/MobileActionBar.tsx 2>&1
```

Expected: no errors.

- [ ] **Step 6: Start dev server and verify manually**

```bash
npm run dev
```

Open `http://localhost:5173` in a browser. Then open DevTools → Device Toolbar and set viewport to 390×844 (iPhone 14).

Verify:
- Bottom action bar is visible with 5 buttons
- Desktop toolbar is hidden
- Floating zoom controls appear bottom-right of canvas
- Zoom controls appear on desktop too
- Breadcrumb shows amber "unsaved changes" pill after placing an item on a saved layout
- Long-press on Save button (hold 500ms) opens the save-as-new dialog

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/pages/WorkspacePage.tsx packages/app/src/App.css
git commit -m "feat(ui): wire MobileActionBar into WorkspacePage"
```

---

## Task 7: Full quality gate

- [ ] **Step 1: Run full test suite**

```bash
cd packages/app && npx vitest run 2>&1 | tail -20
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Run linter**

```bash
npm run lint 2>&1 | grep -v "^$"
```

Expected: no errors (warnings about unused emoji imports in e2e are pre-existing and acceptable).

- [ ] **Step 3: Create feature branch and push**

```bash
git checkout -b feat/mobile-toolbar-redesign
git push -u origin feat/mobile-toolbar-redesign
```

- [ ] **Step 4: Open PR**

```bash
gh pr create --title "feat(ui): mobile toolbar redesign + unsaved changes indicator" --body "$(cat <<'EOF'
## Summary
- Replaces the overflowing toolbar on mobile (≤1024px) with a native-style bottom action bar (Load, Save, Export, Ortho/3D, Clear)
- Long-press on Save opens Save as New dialog, with sub-label hint
- Moves ZoomControls out of toolbar into a floating bottom-right canvas overlay on all screen sizes (desktop keeps 1:1 button, mobile drops it)
- Adds amber dot + "unsaved changes" pill to breadcrumb on all screen sizes when layout has unsaved edits

## Test plan
- [ ] All unit tests pass (`npm run test:run`)
- [ ] Lint clean (`npm run lint`)
- [ ] Mobile: bottom bar visible at 390px viewport, desktop toolbar hidden
- [ ] Desktop: existing toolbar unchanged, floating zoom overlay present
- [ ] Unsaved indicator: appears after placing item on saved layout, disappears after save
- [ ] Long-press Save (500ms): opens Save as New dialog

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
