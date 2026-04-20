# Save Flow Redesign — Design Spec

## Goal

Replace the single Save button in the workspace toolbar with context-aware save buttons that eliminate unnecessary modal friction when updating an existing layout.

## Summary

| Layout state | Buttons shown | Behavior |
|---|---|---|
| Unsaved (`layoutMeta.id === null`) | **Save** | Opens naming modal → creates new layout |
| Saved, not delivered (draft or submitted) | **Save as New** + **Save Changes** | Save Changes updates silently + toast; Save as New opens modal |
| Delivered (`isReadOnly`) | **Build from This** | Opens naming modal → creates new layout copy; canvas is read-only |

> **Submitted layouts:** Showing "Save Changes" for submitted layouts is intentional — the user may want to refine and re-save before the order is processed. The submitted status is preserved by the update mutation response.

---

## Button Logic — WorkspacePage Toolbar

All save buttons are only shown when `isAuthenticated === true`. The current single `Save` button (and the separate `Clone` button in delivered state) are replaced by this conditional rendering:

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
{isAuthenticated && !isReadOnly && layoutMeta.id && (
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

The existing `Clone` button block (`isAuthenticated && isReadOnly`) is **removed** — `Build from This` replaces it.

---

## New Imports Required — WorkspacePage.tsx

```tsx
import { useUpdateLayoutMutation } from '../hooks/useLayouts';
import { buildPayload } from '../components/layouts/SaveLayoutDialog';
```

Add `handleSaveComplete` and `drawerWidth`, `drawerDepth` to the destructure from `useWorkspace()`:

```tsx
const {
  // ... existing fields ...
  handleSaveComplete,
  drawerWidth,
  drawerDepth,
} = useWorkspace();
```

`drawerWidth` and `drawerDepth` are the mm-converted values already exposed by WorkspaceContext and passed to `SaveLayoutDialog` from AppShell.

---

## Direct Save — `handleDirectSave`

A new callback in `WorkspacePage` that calls the update mutation without opening a modal.

```tsx
const updateLayoutMutation = useUpdateLayoutMutation();

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

---

## Toast Component — `<SaveToast>`

A small inline component rendered inside `WorkspacePage`, positioned alongside the toolbar buttons inside `.reference-image-toolbar`.

### State

```tsx
const [toast, setToast] = useState<{ visible: boolean; isError: boolean }>({
  visible: false,
  isError: false,
});
```

### JSX

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

### CSS

```css
.save-toast {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
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

---

## SaveLayoutDialog Changes

The dialog is now always in "create new" mode. The `Update` button and its conditional logic are removed.

### Props removed

- `currentLayoutStatus` — no longer needed

### Props retained

- `currentLayoutId`, `currentLayoutName`, `currentLayoutDescription` — retained to pre-fill name/description when the dialog is opened from a saved layout (both "Save as New" and "Build from This"). When `currentLayoutId` is set, the name field is pre-filled with the existing layout name so the user can rename before saving a copy.

### `SaveLayoutForm` changes

1. Remove `isDelivered` / `isExistingLayout` derived variables
2. Remove `updateLayoutMutation` and `handleUpdate`
3. Remove the archived layout notice (`<div className="layout-dialog-notice">`)
4. Remove the `Update` button from `layout-dialog-actions`
5. Change the `Enter` key handler to always call `handleSaveNew`
6. Dialog title: always `'Save Layout'`
7. The `Save as New` button label → **`Save`** (it is the only action now)
8. Button style: always `submit-button` (primary, no conditional class)

### AppShell.tsx prop update

Remove `currentLayoutStatus` from the `<SaveLayoutDialog>` call site.

### AppShell.tsx banner text update

The `.read-only-banner` text (currently "This layout has been delivered and is read-only. Clone to make changes.") must be updated to reference the new button label:

```
This layout has been delivered and is read-only. Use "Build from This" to create an editable copy.
```

---

## Files Changed

| File | Change |
|---|---|
| `packages/app/src/components/layouts/SaveLayoutDialog.tsx` | Export `buildPayload`; remove `Update` button, `handleUpdate`, `isDelivered`/`isExistingLayout` logic, archived notice, `currentLayoutStatus` prop |
| `packages/app/src/pages/WorkspacePage.tsx` | Add imports; add `handleSaveComplete`, `drawerWidth`, `drawerDepth` to destructure; replace Save + Clone buttons with three-state conditional; add `handleDirectSave` + `useUpdateLayoutMutation`; add toast state + `<SaveToast>` JSX |
| `packages/app/src/AppShell.tsx` | Remove `currentLayoutStatus` from `<SaveLayoutDialog>` props; update read-only banner text |
| `packages/app/src/App.css` | Add `.save-toast`, `.save-toast-success`, `.save-toast-error`, `.save-toast-dismiss` |
| `packages/app/src/App.test.tsx` | Add/update save button tests |
| `packages/app/src/components/layouts/SaveLayoutDialog.test.tsx` | Add/update dialog tests |

---

## Testing

### WorkspacePage (App.test.tsx)

- **Unsaved state:** Only `Save` button renders; no `Save Changes` or `Save as New`; `Save` is disabled when canvas is empty
- **Saved (draft/submitted) state:** Both `Save Changes` and `Save as New` render; no standalone `Save`; `Save Changes` is disabled when canvas is empty
- **Delivered state:** Only `Build from This` renders; no `Save Changes` or `Save as New`
- **Save Changes success:** Calls update mutation with correct payload; success toast appears; toast auto-dismisses after 1.5s
- **Save Changes error:** Error toast appears and does not auto-dismiss; dismiss button (`×`) clears it

### SaveLayoutDialog (SaveLayoutDialog.test.tsx)

- No `Update` button renders for any prop combination
- `Save` button (single primary action) is always rendered
- Name field is pre-filled when `currentLayoutName` is provided
- No archived layout notice renders
- `Enter` key always triggers save-new path

---

## Out of Scope

- Keyboard shortcut (Ctrl+S) — separate concern, not part of this change
- Toast system reuse for other actions — only needed for `Save Changes`; extract later if needed
- Auto-save / dirty-state tracking — no unsaved changes indicator
