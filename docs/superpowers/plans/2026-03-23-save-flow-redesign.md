# Save Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single Save button with context-aware Save / Save Changes + Save as New / Build from This buttons, enabling one-click updates to existing layouts without a modal.

**Architecture:** Three isolated tasks — simplify `SaveLayoutDialog` first (remove Update button, export `buildPayload`), clean up `AppShell` props, then add direct-save logic + toast + new button states to `WorkspacePage`. Each task is independently committable.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library, TanStack Query (hooks mocked in tests), CSS custom properties.

---

## Codebase Context

- **`vi.mock('./hooks/useLayouts', ...)`** in `App.test.tsx` line 153 — mocks all layout hooks. `useUpdateLayoutMutation` is **not yet in this mock**; it must be added in Task 3.
- **`vi.mock('./components/layouts/SaveLayoutDialog', ...)`** in `App.test.tsx` line 133 — mocks `SaveLayoutDialog` but not `buildPayload`. This mock must be updated in Task 3 to use `importOriginal` so `buildPayload` remains available when imported by `WorkspacePage`.
- **`TestAppShellInner`** in `App.test.tsx` line 261 — mirrors `AppShell` for tests; passes `currentLayoutStatus` to `SaveLayoutDialog`. Must be updated in Task 2.
- **`capturedSaveLayoutDialogProps`** — captures props passed to mocked `SaveLayoutDialog`. Used to simulate `onSaveComplete` calls in tests.
- **`mockIsAuthenticated`** — set to `true` in `beforeEach` of auth-dependent describe blocks to show save buttons.
- **`drawerWidth`/`drawerDepth`** are computed in `WorkspaceContext` (line 276): `unitSystem === 'metric' ? width : inchesToMm(width)`. They are on the context value (line 283-284) and accessible by destructuring from `useWorkspace()`.
- **`handleSaveComplete`** is at context value line 546 — not yet in `WorkspacePage`'s destructure.

---

## File Map

| Task | Files Modified | Files Created |
|------|---------------|---------------|
| Task 1 — Simplify dialog | `packages/app/src/components/layouts/SaveLayoutDialog.tsx` | `packages/app/src/components/layouts/SaveLayoutDialog.test.tsx` |
| Task 2 — AppShell cleanup | `packages/app/src/AppShell.tsx`, `packages/app/src/App.test.tsx` | — |
| Task 3 — WorkspacePage | `packages/app/src/pages/WorkspacePage.tsx`, `packages/app/src/App.css`, `packages/app/src/App.test.tsx` | — |

---

## Task 1: Simplify SaveLayoutDialog

**What:** Remove the `Update` button and all conditional update logic from `SaveLayoutDialog`. Export `buildPayload` as a named export. The dialog now always creates a new layout. Write tests first.

**Files:**
- Create: `packages/app/src/components/layouts/SaveLayoutDialog.test.tsx`
- Modify: `packages/app/src/components/layouts/SaveLayoutDialog.tsx`

- [ ] **Step 1: Write failing tests in SaveLayoutDialog.test.tsx**

Create `packages/app/src/components/layouts/SaveLayoutDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaveLayoutDialog } from './SaveLayoutDialog';

const mockSaveAsync = vi.fn();
vi.mock('../../hooks/useLayouts', () => ({
  useSaveLayoutMutation: () => ({
    mutateAsync: mockSaveAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useUpdateLayoutMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  gridX: 4,
  gridY: 4,
  widthMm: 168,
  depthMm: 168,
  spacerConfig: { horizontal: 'none' as const, vertical: 'none' as const },
  placedItems: [],
  refImagePlacements: [],
};

describe('SaveLayoutDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(<SaveLayoutDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog with Save Layout title', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    expect(screen.getByRole('dialog', { name: /save layout/i })).toBeInTheDocument();
  });

  it('does NOT render an Update button for any props combination', () => {
    render(<SaveLayoutDialog {...baseProps} currentLayoutId={42} currentLayoutName="My Layout" />);
    expect(screen.queryByRole('button', { name: /update/i })).not.toBeInTheDocument();
  });

  it('renders a single primary Save button', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });

  it('pre-fills name field when currentLayoutName is provided', () => {
    render(<SaveLayoutDialog {...baseProps} currentLayoutId={42} currentLayoutName="Existing Layout" />);
    expect(screen.getByDisplayValue('Existing Layout')).toBeInTheDocument();
  });

  it('does NOT render the archived layout notice', () => {
    render(<SaveLayoutDialog {...baseProps} currentLayoutId={42} currentLayoutName="Archived" />);
    expect(screen.queryByText(/archived/i)).not.toBeInTheDocument();
  });

  it('Save button is disabled when name is empty', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    const saveBtn = screen.getByRole('button', { name: /^save$/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button is enabled when name is non-empty', () => {
    render(<SaveLayoutDialog {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'My Layout' } });
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:\Users\mgome\Documents\projects\gridfinity-customizer && npm run test:run -- --reporter=verbose 2>&1 | grep -E "SaveLayoutDialog|FAIL|Update|title"
```

Expected: several FAILs (Update button exists, title has "Update Layout" for existing layout, etc.)

- [ ] **Step 3: Export `buildPayload` from SaveLayoutDialog.tsx**

In `packages/app/src/components/layouts/SaveLayoutDialog.tsx`, change line 40 from:

```tsx
function buildPayload(
```

to:

```tsx
export function buildPayload(
```

- [ ] **Step 4: Remove `currentLayoutStatus` prop and all conditional logic**

In `SaveLayoutDialog.tsx`, make these changes:

**Remove from `SaveLayoutDialogProps` interface** (line 20):
```tsx
currentLayoutStatus?: LayoutStatus | null;
```

**Remove from `SaveLayoutFormProps` interface** (line 36):
```tsx
currentLayoutStatus?: LayoutStatus | null;
```

**Remove from `SaveLayoutForm` function params** (line 100):
```tsx
currentLayoutStatus,
```

**Remove the two derived variables** (lines 103-104):
```tsx
const isExistingLayout = currentLayoutId != null;
const isDelivered = currentLayoutStatus === 'delivered';
```

**Simplify name/description initial state** — change lines 106-107 from:
```tsx
const [name, setName] = useState(isExistingLayout ? currentLayoutName : '');
const [description, setDescription] = useState(isExistingLayout ? (currentLayoutDescription ?? '') : '');
```
to:
```tsx
const [name, setName] = useState(currentLayoutName ?? '');
const [description, setDescription] = useState(currentLayoutDescription ?? '');
```

**Remove `updateLayoutMutation` and `handleUpdate`** — remove lines 111-145 (the `updateLayoutMutation` line, the `isPending` and `error` lines that reference it, and the entire `handleUpdate` function). Simplify to:

```tsx
const saveLayoutMutation = useSaveLayoutMutation();
const isPending = saveLayoutMutation.isPending;
const error = saveLayoutMutation.error;
const isError = saveLayoutMutation.isError;
```

**Simplify the `handleKeyDown` function** (line 147): remove the `isExistingLayout && !isDelivered` branch, always call `handleSaveNew`:

```tsx
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') {
    onClose();
  } else if (e.key === 'Enter' && name.trim() && !isPending) {
    handleSaveNew();
  }
};
```

**In the JSX, remove the archived notice** (lines 191-195):
```tsx
{isDelivered && (
  <div className="layout-dialog-notice">
    This layout is archived. You can only save as a new layout.
  </div>
)}
```

**Change dialog title** (line 175) from:
```tsx
<h2>{isExistingLayout && !isDelivered ? 'Update Layout' : 'Save Layout'}</h2>
```
to:
```tsx
<h2>Save Layout</h2>
```

**Remove the `Update` button** (lines 246-255 — the entire `{isExistingLayout && !isDelivered && (...)}` block).

**Change the Save as New button** (line 256-264) to always be primary and labeled "Save":
```tsx
<button
  className="submit-button"
  onClick={handleSaveNew}
  type="button"
  disabled={!name.trim() || isPending}
>
  {saveLayoutMutation.isPending ? 'Saving...' : 'Save'}
</button>
```

**Remove `currentLayoutStatus` from the `SaveLayoutDialog` wrapper's props and JSX** (lines 273-308) — remove the `currentLayoutStatus` prop from both `SaveLayoutDialogProps` and the `SaveLayoutForm` call within the wrapper.

- [ ] **Step 5: Remove unused `LayoutStatus` import if no longer needed**

Check if `LayoutStatus` is still used in the file (it was used for `currentLayoutStatus`). If no longer referenced, remove it from the import at line 3:

```tsx
import type { LayoutStatus } from '@gridfinity/shared';
```

> Note: `LayoutStatus` is still used in `onSaveComplete?: (layoutId: number, name: string, status: LayoutStatus) => void` — keep the import.

- [ ] **Step 6: Run all tests**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all pass. The new `SaveLayoutDialog.test.tsx` tests should pass.

- [ ] **Step 7: Commit**

```bash
git add packages/app/src/components/layouts/SaveLayoutDialog.tsx packages/app/src/components/layouts/SaveLayoutDialog.test.tsx
git commit -m "refactor(save-dialog): simplify to create-only mode, export buildPayload, remove Update button"
```

---

## Task 2: AppShell Cleanup

**What:** Remove `currentLayoutStatus` from the `SaveLayoutDialog` call in `AppShell.tsx` and `App.test.tsx`. Update the read-only banner text to reference "Build from This" instead of "Clone".

**Files:**
- Modify: `packages/app/src/AppShell.tsx`
- Modify: `packages/app/src/App.test.tsx`

- [ ] **Step 1: Write failing test in App.test.tsx**

Find the test that checks the banner text. Search `App.test.tsx` for "Clone to make changes". Add or update a test for the new banner text in the appropriate describe block:

```tsx
it('read-only banner references Build from This instead of Clone', () => {
  // Set up delivered layout state
  mockIsAuthenticated = true;
  renderApp();
  // Trigger delivered state by firing onSaveComplete with 'delivered' status
  act(() => {
    const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (
      id: number, name: string, status: string
    ) => void;
    onSaveComplete(77, 'Delivered Layout', 'delivered');
  });
  expect(screen.getByText(/build from this/i)).toBeInTheDocument();
  expect(screen.queryByText(/clone to make changes/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "Build from This|clone|FAIL"
```

Expected: FAIL — banner still says "Clone to make changes".

- [ ] **Step 3: Update AppShell.tsx**

In `packages/app/src/AppShell.tsx`:

**Remove `currentLayoutStatus` from the `<SaveLayoutDialog>` props** (line 196):
```tsx
currentLayoutStatus={layoutMeta.status}
```
Delete that line.

**Update the read-only banner text** (line 173):
```tsx
This layout has been delivered and is read-only. Clone to make changes.
```
→
```tsx
This layout has been delivered and is read-only. Use &ldquo;Build from This&rdquo; to create an editable copy.
```

- [ ] **Step 4: Update App.test.tsx TestAppShellInner**

In `App.test.tsx`, find `TestAppShellInner` (line ~261). Remove `currentLayoutStatus` from the `<SaveLayoutDialog>` call (line 290):
```tsx
currentLayoutStatus={layoutMeta.status}
```
Delete that line.

Also update the inline `read-only-banner` div text (line 307-309):
```tsx
This layout has been delivered and is read-only. Clone to make changes.
```
→
```tsx
This layout has been delivered and is read-only. Use &ldquo;Build from This&rdquo; to create an editable copy.
```

- [ ] **Step 5: Run all tests**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/AppShell.tsx packages/app/src/App.test.tsx
git commit -m "refactor(appshell): remove currentLayoutStatus prop, update read-only banner text"
```

---

## Task 3: WorkspacePage — Three-State Buttons + Direct Save + Toast

**What:** Replace the single Save button (and separate Clone button) in the WorkspacePage toolbar with three context-aware states. Add `handleDirectSave` that calls `useUpdateLayoutMutation` directly and shows a toast on success/error.

**Files:**
- Modify: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/App.css`
- Modify: `packages/app/src/App.test.tsx`

- [ ] **Step 1: Update the `useLayouts` mock in App.test.tsx**

Find the `vi.mock('./hooks/useLayouts', ...)` block (line 153). Add `useUpdateLayoutMutation` and `useSaveLayoutMutation`:

```tsx
const mockSubmitMutate = vi.fn();
const mockUpdateMutateAsync = vi.fn();
vi.mock('./hooks/useLayouts', () => ({
  useSubmitLayoutMutation: () => ({ mutate: mockSubmitMutate, mutateAsync: vi.fn(), isPending: false }),
  useWithdrawLayoutMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCloneLayoutMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateLayoutMutation: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useSaveLayoutMutation: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useSubmittedCountQuery: () => ({ data: null, isLoading: false }),
}));
```

Also declare `mockUpdateMutateAsync` before `mockSubmitMutate` at the top where mock variables are declared.

- [ ] **Step 2: Update the `SaveLayoutDialog` mock to use `importOriginal`**

Replace the `vi.mock('./components/layouts/SaveLayoutDialog', ...)` block (line 133) with:

```tsx
let capturedSaveLayoutDialogProps: Record<string, unknown> = {};
vi.mock('./components/layouts/SaveLayoutDialog', async (importOriginal) => {
  const original = await importOriginal<typeof import('./components/layouts/SaveLayoutDialog')>();
  return {
    ...original,
    SaveLayoutDialog: (props: Record<string, unknown>) => {
      capturedSaveLayoutDialogProps = props;
      return null;
    },
  };
});
```

This preserves `buildPayload` as the real function while still mocking the dialog component.

- [ ] **Step 3: Write failing tests in App.test.tsx**

Find an appropriate describe block (e.g., after the "FIT buttons" describe). Add:

```tsx
describe('Save button states', () => {
  beforeEach(() => {
    mockIsAuthenticated = true;
    vi.clearAllMocks();
  });

  it('shows only Save button when layout is unsaved', () => {
    renderApp();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as new/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /build from this/i })).not.toBeInTheDocument();
  });

  it('Save button is disabled when canvas is empty', () => {
    renderApp();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('shows Save Changes and Save as New when layout is saved (draft)', () => {
    renderApp();
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
      onSaveComplete(10, 'My Layout', 'draft');
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as new/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /build from this/i })).not.toBeInTheDocument();
  });

  it('shows only Build from This when layout is delivered', () => {
    renderApp();
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
      onSaveComplete(20, 'Delivered Layout', 'delivered');
    });
    expect(screen.getByRole('button', { name: /build from this/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as new/i })).not.toBeInTheDocument();
  });

  it('Save Changes success shows Saved! toast', async () => {
    mockUpdateMutateAsync.mockResolvedValue({ id: 10, name: 'My Layout', status: 'draft' });
    renderApp();
    // Set saved state
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
      onSaveComplete(10, 'My Layout', 'draft');
    });
    // Place an item so the button is enabled
    placeItemViaGridPreview();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });
    expect(await screen.findByText('Saved!')).toBeInTheDocument();
  });

  it('Save Changes error shows persistent error toast', async () => {
    mockUpdateMutateAsync.mockRejectedValue(new Error('Network error'));
    renderApp();
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
      onSaveComplete(10, 'My Layout', 'draft');
    });
    placeItemViaGridPreview();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });
    expect(await screen.findByText(/save failed/i)).toBeInTheDocument();
  });

  it('error toast dismiss button clears the toast', async () => {
    mockUpdateMutateAsync.mockRejectedValue(new Error('Network error'));
    renderApp();
    act(() => {
      const onSaveComplete = capturedSaveLayoutDialogProps.onSaveComplete as (id: number, name: string, status: string) => void;
      onSaveComplete(10, 'My Layout', 'draft');
    });
    placeItemViaGridPreview();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    });
    await screen.findByText(/save failed/i);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/save failed/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "Save button|Build from This|FAIL"
```

Expected: multiple FAILs — new buttons don't exist yet.

- [ ] **Step 5: Add imports and destructure changes to WorkspacePage.tsx**

At the top of `packages/app/src/pages/WorkspacePage.tsx`, add to the existing `hooks/useLayouts` import (search for `useSubmitLayoutMutation`):

```tsx
import { useUpdateLayoutMutation } from '../hooks/useLayouts';
import { buildPayload } from '../components/layouts/SaveLayoutDialog';
```

In the `useWorkspace()` destructure (the `const { ... } = ws;` block), add:

```tsx
handleSaveComplete,
drawerWidth,
drawerDepth,
```

- [ ] **Step 6: Add `useUpdateLayoutMutation` hook call and toast state**

Inside `WorkspacePage`, after the existing hook calls and state declarations, add:

```tsx
const updateLayoutMutation = useUpdateLayoutMutation();

const [toast, setToast] = useState<{ visible: boolean; isError: boolean }>({
  visible: false,
  isError: false,
});
```

- [ ] **Step 7: Add `handleDirectSave` callback**

After the toast state, add:

```tsx
const handleDirectSave = useCallback(async () => {
  if (!layoutMeta.id) return;
  try {
    const payload = buildPayload(
      layoutMeta.name,
      layoutMeta.description,
      gridResult.gridX,
      gridResult.gridY,
      drawerWidth,
      drawerDepth,
      spacerConfig,
      placedItems,
      refImagePlacements,
    );
    const result = await updateLayoutMutation.mutateAsync({ id: layoutMeta.id, data: payload });
    handleSaveComplete(result.id, result.name, result.status);
    setToast({ visible: true, isError: false });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 1500);
  } catch {
    setToast({ visible: true, isError: true });
  }
}, [layoutMeta, gridResult, drawerWidth, drawerDepth, spacerConfig, placedItems,
    refImagePlacements, updateLayoutMutation, handleSaveComplete]);
```

- [ ] **Step 8: Replace Save + Clone buttons in the toolbar JSX**

Find the current `Save` button block (around line 314):
```tsx
{isAuthenticated && (
  <button
    className="layout-toolbar-btn layout-save-btn"
    onClick={() => dialogDispatch({ type: 'OPEN', dialog: 'save' })}
    type="button"
    disabled={placedItems.length === 0 && refImagePlacements.length === 0}
  >
    Save
  </button>
)}
```

And the `Clone` button block (around line 344):
```tsx
{isAuthenticated && isReadOnly && (
  <button className="layout-toolbar-btn layout-clone-btn" onClick={handleCloneCurrentLayout} type="button" disabled={cloneLayoutMutation.isPending}>
    {cloneLayoutMutation.isPending ? 'Cloning...' : 'Clone'}
  </button>
)}
```

Replace **both** with:

```tsx
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
      {updateLayoutMutation.isPending ? 'Saving…' : 'Save Changes'}
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
```

- [ ] **Step 9: Add `<SaveToast>` JSX to the toolbar**

Inside `.reference-image-toolbar`, after the new button blocks and before the Export PDF button, add:

```tsx
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
```

- [ ] **Step 10: Add CSS to App.css**

Find `.status-cost` in `packages/app/src/App.css`. After that block, add:

```css
/* Save toast */
.save-toast {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  white-space: nowrap;
}

.save-toast-success {
  background: var(--color-success-bg, #1a3a2a);
  border: 1px solid var(--color-success-border, #2a5a3a);
  color: var(--color-success-text, #a0e0b0);
}

.save-toast-error {
  background: var(--color-error-bg, #3a1a1a);
  border: 1px solid var(--color-error-border, #5a2a2a);
  color: var(--color-error-text, #f0a0a0);
}

.save-toast-dismiss {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  opacity: 0.7;
}

.save-toast-dismiss:hover {
  opacity: 1;
}
```

- [ ] **Step 11: Run all tests**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add packages/app/src/pages/WorkspacePage.tsx packages/app/src/App.css packages/app/src/App.test.tsx
git commit -m "feat(workspace): add Save Changes/Save as New/Build from This buttons with inline toast"
```

---

## Final: Rebuild & Deploy

- [ ] **Run full test suite**

```bash
npm run test:run 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all test files pass.

- [ ] **Docker rebuild and deploy**

```bash
cd /c/Users/mgome/Documents/projects/gridfinity-customizer/infra && docker compose build --no-cache && docker compose up -d
```

Verify at `localhost:32888`.
