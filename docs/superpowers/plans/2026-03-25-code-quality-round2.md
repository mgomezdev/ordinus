# Code Quality Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four code quality gaps: missing unit tests for two hooks, silent mutation errors in SavedConfigsPage, and two structural refactors (WorkspacePage toolbar extraction + WorkspaceContext layout-loader extraction).

**Architecture:** All changes are additive or pure refactors with no public interface changes. Unit tests use Vitest + React Testing Library's `renderHook`. Component extractions read from `useWorkspace()` directly to minimize prop-threading. Context refactor extracts `useLayoutLoader` as a standalone hook consumed by `WorkspaceContext`.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, TanStack Query v5

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `packages/app/src/hooks/useImageLoadState.test.ts` | 8 tests for URL tracking + load/error state |
| Create | `packages/app/src/hooks/useLayouts.test.ts` | 10 tests for all CRUD mutations + queries |
| Modify | `packages/app/src/pages/SavedConfigsPage.tsx` | Add `pageError` state, show inline errors for submit/withdraw/duplicate |
| Create | `packages/app/src/components/WorkspaceToolbar.tsx` | Extracted toolbar (load/save/submit/export buttons + toast) |
| Modify | `packages/app/src/pages/WorkspacePage.tsx` | Replace toolbar JSX block with `<WorkspaceToolbar>` |
| Create | `packages/app/src/hooks/useLayoutLoader.ts` | `handleLoadLayout` + `loadLayout` extracted from WorkspaceContext |
| Modify | `packages/app/src/contexts/WorkspaceContext.tsx` | Use `useLayoutLoader`, remove duplicate logic |

---

## Task 1: `useImageLoadState` Unit Tests

**Files:**
- Create: `packages/app/src/hooks/useImageLoadState.test.ts`

The hook tracks three derived values — `imageLoaded`, `imageError`, `shouldShowImage` — keyed to the URL that triggered them. The key edge case is **URL mismatch**: state from a previous URL must not bleed into the current URL.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageLoadState } from './useImageLoadState';

describe('useImageLoadState', () => {
  it('starts with no load, no error, no visible image', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.imageError).toBe(false);
    expect(result.current.shouldShowImage).toBe(false);
  });

  it('handleImageLoad marks loaded true for current url', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageLoad());
    expect(result.current.imageLoaded).toBe(true);
    expect(result.current.shouldShowImage).toBe(true);
  });

  it('handleImageError marks error true and loaded false', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageError());
    expect(result.current.imageError).toBe(true);
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.shouldShowImage).toBe(false);
  });

  it('stale load state does not apply when url changes', () => {
    let url = 'http://example.com/a.png';
    const { result, rerender } = renderHook(() => useImageLoadState(url));
    act(() => result.current.handleImageLoad());
    expect(result.current.imageLoaded).toBe(true);

    url = 'http://example.com/b.png';
    rerender();
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.shouldShowImage).toBe(false);
  });

  it('stale error state does not apply when url changes', () => {
    let url = 'http://example.com/a.png';
    const { result, rerender } = renderHook(() => useImageLoadState(url));
    act(() => result.current.handleImageError());
    expect(result.current.imageError).toBe(true);

    url = 'http://example.com/b.png';
    rerender();
    expect(result.current.imageError).toBe(false);
  });

  it('shouldShowImage is false when url is undefined', () => {
    const { result } = renderHook(() => useImageLoadState(undefined));
    act(() => result.current.handleImageLoad());
    expect(result.current.shouldShowImage).toBe(false);
  });

  it('load after error clears the error', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageError());
    act(() => result.current.handleImageLoad());
    expect(result.current.imageError).toBe(false);
    expect(result.current.imageLoaded).toBe(true);
  });

  it('error after load clears the loaded state', () => {
    const { result } = renderHook(() => useImageLoadState('http://example.com/a.png'));
    act(() => result.current.handleImageLoad());
    act(() => result.current.handleImageError());
    expect(result.current.imageLoaded).toBe(false);
    expect(result.current.imageError).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect PASS (pure hook, no mocks needed)**

```bash
npm run test:run --workspace=packages/app -- --reporter=verbose src/hooks/useImageLoadState.test.ts
```

Expected: 8 passed

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/hooks/useImageLoadState.test.ts
git commit -m "test(useImageLoadState): add 8 unit tests for URL-keyed load state"
```

---

## Task 2: `useLayouts` Unit Tests

**Files:**
- Create: `packages/app/src/hooks/useLayouts.test.ts`

Pattern: mock `AuthContext` and the API module, wrap in `QueryClientProvider` (no `DataSourceProvider` needed — these hooks don't use the adapter). Follow the pattern in `useUserStls.test.ts`.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { ReactNode } from 'react';

// --- mocks (hoisted before imports) ---
vi.mock('../api/layouts.api.js', () => ({
  fetchLayouts: vi.fn(),
  fetchLayout: vi.fn(),
  createLayout: vi.fn(),
  updateLayout: vi.fn(),
  updateLayoutMeta: vi.fn(),
  deleteLayoutApi: vi.fn(),
  submitLayout: vi.fn(),
  withdrawLayout: vi.fn(),
  cloneLayout: vi.fn(),
  fetchAdminLayouts: vi.fn(),
  fetchSubmittedCount: vi.fn(),
  deliverLayout: vi.fn(),
}));

vi.mock('../contexts/AuthContext.js', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext.js';
import {
  fetchLayouts, createLayout, updateLayout, deleteLayoutApi,
  submitLayout, withdrawLayout, cloneLayout, fetchSubmittedCount,
} from '../api/layouts.api.js';
import {
  useLayoutsQuery, useSaveLayoutMutation, useUpdateLayoutMutation,
  useDeleteLayoutMutation, useSubmitLayoutMutation, useWithdrawLayoutMutation,
  useCloneLayoutMutation, useSubmittedCountQuery,
} from './useLayouts';

const MOCK_TOKEN = 'test-token';
const MOCK_LAYOUT = { id: 1, name: 'Test', status: 'draft', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none', updatedAt: '', createdAt: '' };

function makeAuth(overrides = {}) {
  return {
    getAccessToken: () => MOCK_TOKEN,
    isAuthenticated: true,
    user: { role: 'user' },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe('useLayoutsQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches layouts when authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth());
    vi.mocked(fetchLayouts).mockResolvedValue({ data: [MOCK_LAYOUT] } as never);

    const { result } = renderHook(() => useLayoutsQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([MOCK_LAYOUT]);
    expect(fetchLayouts).toHaveBeenCalledWith(MOCK_TOKEN);
  });

  it('does not fetch when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth({ isAuthenticated: false }));

    const { result } = renderHook(() => useLayoutsQuery(), { wrapper: createWrapper() });
    await new Promise(r => setTimeout(r, 50));
    expect(result.current.isFetching).toBe(false);
    expect(fetchLayouts).not.toHaveBeenCalled();
  });
});

describe('useSaveLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls createLayout with token and data', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth());
    vi.mocked(createLayout).mockResolvedValue({ id: 99, name: 'New', status: 'draft' } as never);

    const { result } = renderHook(() => useSaveLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ name: 'New', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none', placedItems: [] });
    });
    expect(createLayout).toHaveBeenCalledWith(MOCK_TOKEN, expect.objectContaining({ name: 'New' }));
  });

  it('throws when not authenticated', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth({ getAccessToken: () => null }));
    vi.mocked(createLayout).mockResolvedValue({} as never);

    const { result } = renderHook(() => useSaveLayoutMutation(), { wrapper: createWrapper() });
    await expect(
      act(async () => {
        await result.current.mutateAsync({ name: 'x', gridX: 1, gridY: 1, widthMm: 42, depthMm: 42, spacerHorizontal: 'none', spacerVertical: 'none', placedItems: [] });
      })
    ).rejects.toThrow('Not authenticated');
    expect(createLayout).not.toHaveBeenCalled();
  });
});

describe('useUpdateLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls updateLayout with id and data', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth());
    vi.mocked(updateLayout).mockResolvedValue({ id: 1, status: 'draft' } as never);

    const { result } = renderHook(() => useUpdateLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, data: { name: 'Updated', gridX: 4, gridY: 4, widthMm: 168, depthMm: 168, spacerHorizontal: 'none', spacerVertical: 'none', placedItems: [] } });
    });
    expect(updateLayout).toHaveBeenCalledWith(MOCK_TOKEN, 1, expect.objectContaining({ name: 'Updated' }));
  });
});

describe('useDeleteLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteLayoutApi with id', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth());
    vi.mocked(deleteLayoutApi).mockResolvedValue(undefined as never);

    const { result } = renderHook(() => useDeleteLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => { await result.current.mutateAsync(5); });
    expect(deleteLayoutApi).toHaveBeenCalledWith(MOCK_TOKEN, 5);
  });
});

describe('useSubmitLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls submitLayout and returns updated layout', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth());
    vi.mocked(submitLayout).mockResolvedValue({ ...MOCK_LAYOUT, status: 'submitted' } as never);

    const { result } = renderHook(() => useSubmitLayoutMutation(), { wrapper: createWrapper() });
    let res: unknown;
    await act(async () => { res = await result.current.mutateAsync(1); });
    expect(submitLayout).toHaveBeenCalledWith(MOCK_TOKEN, 1);
    expect((res as typeof MOCK_LAYOUT).status).toBe('submitted');
  });
});

describe('useWithdrawLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls withdrawLayout and returns draft status', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth());
    vi.mocked(withdrawLayout).mockResolvedValue({ ...MOCK_LAYOUT, status: 'draft' } as never);

    const { result } = renderHook(() => useWithdrawLayoutMutation(), { wrapper: createWrapper() });
    let res: unknown;
    await act(async () => { res = await result.current.mutateAsync(1); });
    expect(withdrawLayout).toHaveBeenCalledWith(MOCK_TOKEN, 1);
    expect((res as typeof MOCK_LAYOUT).status).toBe('draft');
  });
});

describe('useCloneLayoutMutation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls cloneLayout with id', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth());
    vi.mocked(cloneLayout).mockResolvedValue({ id: 99, name: 'Copy of Test', status: 'draft' } as never);

    const { result } = renderHook(() => useCloneLayoutMutation(), { wrapper: createWrapper() });
    await act(async () => { await result.current.mutateAsync(1); });
    expect(cloneLayout).toHaveBeenCalledWith(MOCK_TOKEN, 1);
  });
});

describe('useSubmittedCountQuery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches count when user is admin', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth({ user: { role: 'admin' } }));
    vi.mocked(fetchSubmittedCount).mockResolvedValue({ submitted: 3 } as never);

    const { result } = renderHook(() => useSubmittedCountQuery(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.submitted).toBe(3);
  });

  it('does not fetch when user is not admin', async () => {
    vi.mocked(useAuth).mockReturnValue(makeAuth({ user: { role: 'user' } }));

    const { result } = renderHook(() => useSubmittedCountQuery(), { wrapper: createWrapper() });
    await new Promise(r => setTimeout(r, 50));
    expect(result.current.isFetching).toBe(false);
    expect(fetchSubmittedCount).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
npm run test:run --workspace=packages/app -- --reporter=verbose src/hooks/useLayouts.test.ts
```

Expected: 10 passed

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/hooks/useLayouts.test.ts
git commit -m "test(useLayouts): add 10 unit tests for all CRUD mutations and queries"
```

---

## Task 3: `SavedConfigsPage` — Surface Mutation Errors

Silent `console.error` for submit/withdraw/duplicate failures means users have no idea their action failed. Fix: add a single `pageError` string state, populate it from `onError`, clear it from `onSuccess`, and show it as a dismissible banner above the grid.

**Files:**
- Modify: `packages/app/src/pages/SavedConfigsPage.tsx`

- [ ] **Step 1: Add `pageError` state and wire up mutations**

Replace the three `mutate` calls (lines 77–79) with error-surfacing versions:

```tsx
// Replace the three mutation calls:
onSubmit={(id) => submitMutation.mutate(id, {
  onError: () => setPageError('Failed to submit. Please try again.'),
  onSuccess: () => setPageError(null),
})}
onWithdraw={(id) => withdrawMutation.mutate(id, {
  onError: () => setPageError('Failed to withdraw. Please try again.'),
  onSuccess: () => setPageError(null),
})}
onDuplicate={(id) => cloneMutation.mutate(id, {
  onError: () => setPageError('Failed to duplicate. Please try again.'),
  onSuccess: () => setPageError(null),
})}
```

Add state at the top of the component (after the existing `useState`):

```tsx
const [pageError, setPageError] = useState<string | null>(null);
```

Add the error banner just before the loading check (first child of `.saved-configs-page`):

```tsx
{pageError && (
  <div className="saved-configs-error" role="alert">
    {pageError}
    <button
      type="button"
      className="saved-configs-error-dismiss"
      onClick={() => setPageError(null)}
      aria-label="Dismiss error"
    >
      &times;
    </button>
  </div>
)}
```

Add CSS to `SavedConfigsPage.css` (search for the file; if no suitable section exists, append):

```css
/* Error banner */
.saved-configs-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  background: var(--red-50, #fef2f2);
  border: 1px solid var(--red-200, #fecaca);
  border-radius: 6px;
  color: var(--red-700, #b91c1c);
  font-size: 0.875rem;
  margin-bottom: 12px;
}

.saved-configs-error-dismiss {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: inherit;
  padding: 0 2px;
  line-height: 1;
}
```

- [ ] **Step 2: Run unit tests — expect no regressions**

```bash
npm run test:run --workspace=packages/app
```

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/SavedConfigsPage.tsx packages/app/src/pages/SavedConfigsPage.css
git commit -m "fix(saved-configs): surface submit/withdraw/duplicate errors to user"
```

---

## Task 4: Extract `WorkspaceToolbar` Component

The `<div className="reference-image-toolbar">` block in `WorkspacePage.tsx` (lines ~353–459, ~110 lines of JSX) contains all the action buttons. Extract it to a self-contained component that:
- Reads from `useWorkspace()` for all context values
- Manages its own `updateLayoutMutation` + toast state
- Accepts `onExportPdf` and `exportPdfError` as props (because `exportPdf` needs `viewportRef` from the parent)

**Files:**
- Create: `packages/app/src/components/WorkspaceToolbar.tsx`
- Modify: `packages/app/src/pages/WorkspacePage.tsx`

- [ ] **Step 1: Create `WorkspaceToolbar.tsx`**

```tsx
import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useUpdateLayoutMutation } from '../hooks/useLayouts';
import { SubmissionsBadge } from './admin/SubmissionsBadge';
import { buildPayload } from '../utils/layoutHelpers';

interface WorkspaceToolbarProps {
  onExportPdf: () => Promise<void>;
  exportPdfError: string | null;
}

export function WorkspaceToolbar({ onExportPdf, exportPdfError }: WorkspaceToolbarProps) {
  const navigate = useNavigate();
  const {
    isAuthenticated, isAdmin, isReadOnly, layoutMeta,
    placedItems, refImagePlacements, gridResult, drawerWidth, drawerDepth,
    spacerConfig, handleSaveComplete, handleSubmitClick, handleWithdrawLayout,
    handleClearAll, dialogDispatch, submittedCountQuery,
    submitLayoutMutation, withdrawLayoutMutation,
  } = useWorkspace();

  const updateLayoutMutation = useUpdateLayoutMutation();
  const [toast, setToast] = useState<{ visible: boolean; isError: boolean }>({
    visible: false,
    isError: false,
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const handleDirectSave = useCallback(async () => {
    if (!layoutMeta.id) return;
    try {
      const payload = buildPayload(
        layoutMeta.name, layoutMeta.description,
        gridResult.gridX, gridResult.gridY,
        drawerWidth, drawerDepth, spacerConfig, placedItems, refImagePlacements,
      );
      const result = await updateLayoutMutation.mutateAsync({ id: layoutMeta.id, data: payload });
      handleSaveComplete(result.id, result.name, result.status);
      setToast({ visible: true, isError: false });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(
        () => setToast(t => ({ ...t, visible: false })), 1500
      );
    } catch {
      setToast({ visible: true, isError: true });
    }
  }, [layoutMeta, gridResult, drawerWidth, drawerDepth, spacerConfig, placedItems,
      refImagePlacements, updateLayoutMutation, handleSaveComplete]);

  return (
    <div className="reference-image-toolbar">
      {isAuthenticated && (
        <button className="layout-toolbar-btn layout-load-btn" onClick={() => navigate('/configs')} type="button">Load</button>
      )}

      {/* Unsaved layout */}
      {isAuthenticated && !isReadOnly && !layoutMeta.id && (
        <button
          className="layout-toolbar-btn layout-save-btn"
          onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'save' })}
          type="button"
          disabled={placedItems.length === 0 && refImagePlacements.length === 0}
        >
          Save
        </button>
      )}

      {/* Saved layout — draft or submitted */}
      {isAuthenticated && !isReadOnly && !!layoutMeta.id && (
        <>
          <button
            className="layout-toolbar-btn"
            onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'save' })}
            type="button"
          >
            Save as New
          </button>
          <button
            className="layout-toolbar-btn layout-save-btn"
            onClick={handleDirectSave}
            type="button"
            disabled={updateLayoutMutation.isPending || (placedItems.length === 0 && refImagePlacements.length === 0)}
          >
            {updateLayoutMutation.isPending ? 'Saving\u2026' : 'Save Changes'}
          </button>
        </>
      )}

      {/* Delivered (read-only) layout */}
      {isAuthenticated && isReadOnly && (
        <button
          className="layout-toolbar-btn layout-save-btn"
          onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'save' })}
          type="button"
        >
          Build from This
        </button>
      )}

      {toast.visible && (
        <div className={`save-toast ${toast.isError ? 'save-toast-error' : 'save-toast-success'}`}>
          {toast.isError ? (
            <>
              <span>Save failed. Try again.</span>
              <button
                type="button"
                className="save-toast-dismiss"
                onClick={() => setToast(t => ({ ...t, visible: false }))}
                aria-label="Dismiss"
              >
                &times;
              </button>
            </>
          ) : (
            <span>Saved!</span>
          )}
        </div>
      )}

      {isAuthenticated && layoutMeta.status !== 'submitted' && layoutMeta.status !== 'delivered' && (
        <button
          className="layout-toolbar-btn layout-submit-btn"
          onClick={handleSubmitClick}
          type="button"
          disabled={submitLayoutMutation.isPending}
        >
          {submitLayoutMutation.isPending ? 'Submitting...' : 'Submit'}
        </button>
      )}
      {isAuthenticated && layoutMeta.status === 'delivered' && (
        <button className="layout-toolbar-btn layout-submit-btn" disabled type="button" title="This layout has been fulfilled">
          Submit
        </button>
      )}
      {isAuthenticated && layoutMeta.id && layoutMeta.status === 'submitted' && (
        <button className="layout-toolbar-btn layout-withdraw-btn" onClick={handleWithdrawLayout} type="button" disabled={withdrawLayoutMutation.isPending}>
          {withdrawLayoutMutation.isPending ? 'Withdrawing...' : 'Withdraw'}
        </button>
      )}

      <button
        className="layout-toolbar-btn layout-export-btn"
        onClick={onExportPdf}
        type="button"
        disabled={placedItems.length === 0}
        title="Export layout as PDF"
      >
        Export PDF
      </button>
      {exportPdfError && (
        <span className="export-pdf-error" role="alert">{exportPdfError}</span>
      )}

      {!isReadOnly && (placedItems.length > 0 || refImagePlacements.length > 0) && (
        <button className="clear-all-button" onClick={handleClearAll}>
          Clear All ({placedItems.length + refImagePlacements.length})
        </button>
      )}

      {isAdmin && (
        <SubmissionsBadge
          count={submittedCountQuery.data?.submitted ?? 0}
          onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'admin' })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `WorkspacePage.tsx`**

Add import at top:
```tsx
import { WorkspaceToolbar } from '../components/WorkspaceToolbar';
```

Remove from `useWorkspace()` destructure in WorkspacePage (no longer needed there):
- `handleSaveComplete`, `handleSubmitClick`, `handleWithdrawLayout`
- `submitLayoutMutation`, `withdrawLayoutMutation`
- `submittedCountQuery`, `dialogDispatch` (keep if used elsewhere — check first)

Remove local state and callbacks from `WorkspacePage`:
- `toast`, `setToast`, `toastTimerRef`, the cleanup `useEffect` for the timer
- `handleDirectSave` callback
- `updateLayoutMutation` hook call

Replace the entire `<div className="reference-image-toolbar">...</div>` block (and `exportPdfError` span if inside it) with:

```tsx
<WorkspaceToolbar onExportPdf={handleExportPdf} exportPdfError={exportPdfError} />
```

> **Note:** `dialogDispatch` may still be used in WorkspacePage for the `handleRebindImage` callback and `?` keyboard shortcut. Check before removing. `isAdmin`, `submittedCountQuery` are no longer needed in WorkspacePage directly.

- [ ] **Step 3: Run lint + tests**

```bash
npm run lint --workspace=packages/app
npm run test:run --workspace=packages/app
```

Expected: 0 lint errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/WorkspaceToolbar.tsx packages/app/src/pages/WorkspacePage.tsx
git commit -m "refactor(workspace): extract WorkspaceToolbar component from WorkspacePage"
```

---

## Task 5: Extract `LibraryPanel` Component

The `<section className="library-panel">` block in `WorkspacePage.tsx` (lines ~505–554, ~50 lines of JSX) owns its own tab state. Extract it.

**Files:**
- Create: `packages/app/src/components/LibraryPanel.tsx`
- Modify: `packages/app/src/pages/WorkspacePage.tsx`

- [ ] **Step 1: Create `LibraryPanel.tsx`**

```tsx
import { useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ItemLibrary } from './ItemLibrary';
import { RefImageLibrary } from './RefImageLibrary';
import { UserStlLibrarySection } from './UserStlLibrarySection';

interface LibraryPanelProps {
  width: number;
}

export function LibraryPanel({ width }: LibraryPanelProps) {
  const { isAuthenticated, libraryItems, isLibraryLoading, isLibrariesLoading,
          libraryError, librariesError, categories } = useWorkspace();
  const [libraryTab, setLibraryTab] = useState<'items' | 'images'>('items');
  const [libraryCategory, setLibraryCategory] = useState<string | null>(null);

  return (
    <section className="library-panel" style={{ width, minWidth: width }}>
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

- [ ] **Step 2: Update `WorkspacePage.tsx`**

Add import:
```tsx
import { LibraryPanel } from '../components/LibraryPanel';
```

Remove from WorkspacePage local state:
- `libraryTab`, `setLibraryTab`
- `libraryCategory`, `setLibraryCategory`

Remove from `useWorkspace()` destructure in WorkspacePage (now only needed in LibraryPanel):
- `libraryItems`, `isLibraryLoading`, `isLibrariesLoading`, `libraryError`, `librariesError`, `categories`

Replace the entire `<section className="library-panel">...</section>` with:
```tsx
<LibraryPanel width={libraryWidth} />
```

- [ ] **Step 3: Run lint + tests**

```bash
npm run lint --workspace=packages/app
npm run test:run --workspace=packages/app
```

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/LibraryPanel.tsx packages/app/src/pages/WorkspacePage.tsx
git commit -m "refactor(workspace): extract LibraryPanel component from WorkspacePage"
```

---

## Task 6: Extract `useLayoutLoader` from `WorkspaceContext`

The `handleLoadLayout` (sync, hydrates from a `LoadedLayoutConfig`) and `loadLayout` (async, fetches by id then calls `handleLoadLayout`) live in WorkspaceContext (~90 lines). Extracting them into a standalone hook:
1. Makes `loadLayout` unit-testable
2. Reduces WorkspaceContext by ~90 lines

**Files:**
- Create: `packages/app/src/hooks/useLayoutLoader.ts`
- Modify: `packages/app/src/contexts/WorkspaceContext.tsx`

The hook takes all its dependencies as parameters (standard hook composition pattern):

- [ ] **Step 1: Create `useLayoutLoader.ts`**

```ts
import { useCallback } from 'react';
import type { PlacedItem, GridSpacerConfig, Rotation, SpacerMode, UnitSystem } from '../types/gridfinity';
import type { RefImagePlacement } from './useRefImagePlacements';
import type { LoadedLayoutConfig } from '../types/layoutConfig';
import type { LayoutMetaAction } from '../reducers/layoutMetaReducer';
import { mmToInches, inchesToMm } from '../utils/conversions';
import { fetchLayout } from '../api/layouts.api';

interface UseLayoutLoaderParams {
  unitSystem: UnitSystem;
  setWidth: (w: number) => void;
  setDepth: (d: number) => void;
  setSpacerConfig: (c: GridSpacerConfig) => void;
  loadItems: (items: PlacedItem[]) => void;
  loadRefImagePlacements: (placements: RefImagePlacement[]) => void;
  layoutDispatch: React.Dispatch<LayoutMetaAction>;
  getAccessToken: () => string | null;
}

export function useLayoutLoader({
  unitSystem, setWidth, setDepth, setSpacerConfig,
  loadItems, loadRefImagePlacements, layoutDispatch, getAccessToken,
}: UseLayoutLoaderParams) {
  const handleLoadLayout = useCallback((config: LoadedLayoutConfig) => {
    if (unitSystem === 'imperial') {
      setWidth(parseFloat(mmToInches(config.widthMm).toFixed(4)));
      setDepth(parseFloat(mmToInches(config.depthMm).toFixed(4)));
    } else {
      setWidth(config.widthMm);
      setDepth(config.depthMm);
    }
    setSpacerConfig(config.spacerConfig);
    loadItems(config.placedItems);
    loadRefImagePlacements(config.refImagePlacements ?? []);

    let owner = '';
    if (config.ownerUsername) {
      owner = config.ownerUsername;
      if (config.ownerEmail) owner += ` <${config.ownerEmail}>`;
    }

    layoutDispatch({
      type: 'LOAD_LAYOUT',
      payload: {
        id: config.layoutId,
        name: config.layoutName,
        description: config.layoutDescription ?? '',
        status: config.layoutStatus,
        owner,
      },
    });
  }, [unitSystem, setWidth, setDepth, setSpacerConfig, loadItems, loadRefImagePlacements, layoutDispatch]);

  const loadLayout = useCallback(async (id: number) => {
    const token = getAccessToken();
    if (!token) throw new Error('Not authenticated');
    try {
      const detail = await fetchLayout(token, id);
      const loadPrefix = Date.now();

      const loadedPlacedItems: PlacedItem[] = detail.placedItems.map((item, index) => ({
        instanceId: `loaded-${loadPrefix}-${index}`,
        itemId: `${item.libraryId}:${item.itemId}`,
        x: item.x, y: item.y, width: item.width, height: item.height,
        rotation: item.rotation as Rotation,
        ...(item.customization ? { customization: item.customization } : {}),
      }));

      const loadedRefImagePlacements: RefImagePlacement[] = (detail.refImagePlacements ?? []).map((p, index) => ({
        id: `loaded-ref-${loadPrefix}-${index}`,
        refImageId: p.refImageId, name: p.name, imageUrl: p.imageUrl,
        x: p.x, y: p.y, width: p.width, height: p.height,
        opacity: p.opacity, scale: p.scale, isLocked: p.isLocked,
        rotation: p.rotation as Rotation,
      }));

      handleLoadLayout({
        layoutId: detail.id, layoutName: detail.name,
        layoutDescription: detail.description, layoutStatus: detail.status,
        widthMm: detail.widthMm, depthMm: detail.depthMm,
        spacerConfig: {
          horizontal: detail.spacerHorizontal as SpacerMode,
          vertical: detail.spacerVertical as SpacerMode,
        },
        placedItems: loadedPlacedItems,
        refImagePlacements: loadedRefImagePlacements,
      });
    } catch (err) {
      console.error('Failed to load layout:', err);
      throw err;
    }
  }, [getAccessToken, handleLoadLayout]);

  return { handleLoadLayout, loadLayout };
}
```

- [ ] **Step 2: Update `WorkspaceContext.tsx`**

Add import:
```ts
import { useLayoutLoader } from '../hooks/useLayoutLoader';
```

Replace the `handleLoadLayout` and `loadLayout` function definitions (~lines 386–472) with:
```ts
const { handleLoadLayout, loadLayout } = useLayoutLoader({
  unitSystem, setWidth, setDepth, setSpacerConfig,
  loadItems, loadRefImagePlacements, layoutDispatch, getAccessToken,
});
```

Delete the old implementations of `handleLoadLayout` and `loadLayout`.

- [ ] **Step 3: Run lint + tests**

```bash
npm run lint --workspace=packages/app
npm run test:run --workspace=packages/app
```

Expected: 0 lint errors, all tests pass (WorkspaceContext public interface unchanged)

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/hooks/useLayoutLoader.ts packages/app/src/contexts/WorkspaceContext.tsx
git commit -m "refactor(workspace): extract useLayoutLoader hook from WorkspaceContext"
```

---

## Final Step: Push and Open PR

```bash
git push -u origin refactor/code-quality-round2
gh pr create --title "refactor: code quality round 2 — tests, error surfaces, component extractions" \
  --body "..." --base develop
```

Run full quality gate before opening PR:
```bash
npm run lint --workspace=packages/app
npm run test:run --workspace=packages/app
npm run test --workspace=packages/server
```

Expected: 0 lint errors, 1111+ unit tests passing.
