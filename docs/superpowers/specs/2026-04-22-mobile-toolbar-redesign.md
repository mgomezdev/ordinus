# Mobile Toolbar Redesign & Unsaved Changes Indicator

**Date:** 2026-04-22
**Branch:** `feat/mobile-toolbar-redesign`
**PR target:** `develop`

## Overview

Three changes in one PR:

1. **Mobile bottom action bar** — replaces the `preview-toolbar` row on mobile (≤768px) with a native-style bottom tab bar
2. **Floating zoom overlay** — moves `ZoomControls` out of the toolbar into a canvas-anchored overlay on **all** screen sizes
3. **Unsaved changes indicator** — amber dot + pill in the breadcrumb whenever `isDirty && layoutMeta.id`, on all screen sizes

## Current State

`WorkspacePage` renders:
- `<nav class="canvas-breadcrumb">` — layout name only, no unsaved state
- `<div class="preview-toolbar">` — `WorkspaceToolbar` + `ImageViewToggle` + `ZoomControls` in a single `flex` row, no wrapping, overflows and clips on small phone screens

## 1. Mobile Bottom Action Bar

**Breakpoint:** driven by the existing `isMobile` boolean from `useMobileLayout()`.

When `isMobile`:
- `preview-toolbar` is not rendered (conditional in `WorkspacePage`)
- New `<MobileActionBar>` component renders pinned to the bottom of the `.preview` section

### MobileActionBar buttons (left → right)

| Button | Icon | Primary label | Sub-label | Tap | Long-press |
|--------|------|--------------|-----------|-----|------------|
| Load | 📂 | Load | — | `navigate('/configs')` | — |
| Save | 💾 | Save | hold: new layout | Direct save (has `layoutMeta.id`) or open save dialog (no ID) | Open save-as-new dialog |
| Export | 📄 | Export | — | `onExportPdf()` | — |
| View | ⊞ | Ortho / 3D | — | Toggle `imageViewMode` | — |
| Clear | 🗑 | Clear | — | `handleClearAll()` | — |

### Save button states

| Condition | Appearance |
|-----------|-----------|
| Has `layoutMeta.id`, not pending | Filled blue, label "Save", sub-label "hold: new layout" |
| No `layoutMeta.id` (never saved) | Outlined blue, label "Save", no sub-label |
| `updateLayoutMutation.isPending` | Filled blue, dimmed, label "Saving…" |

Long-pressing Save (500ms) dispatches `{ type: 'OPEN', dialog: 'save' }` via `dialogDispatch` — same as the desktop "Save as New" button.

### Disabled states (35% opacity, `pointer-events: none`)

- **Export:** `placedItems.length === 0`
- **Clear:** `placedItems.length === 0 && refImagePlacements.length === 0`
- **Save (no ID):** `placedItems.length === 0 && refImagePlacements.length === 0`

### Auth gating

Load and Save only render when `isAuthenticated` — same rule as the desktop toolbar.

### Props interface

```ts
interface MobileActionBarProps {
  isAuthenticated: boolean;
  layoutMeta: { id: string | null; name: string };
  placedItems: PlacedItem[];
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
```

## 2. Floating Zoom Overlay

**Applies to all screen sizes.**

`ZoomControls` is removed from `preview-toolbar` and rendered as an absolutely-positioned overlay inside `GridViewport`, anchored bottom-right (12px inset from both edges).

### Buttons by breakpoint

| Desktop | Mobile |
|---------|--------|
| −, 100%, +, 1:1, ⤢ | −, 100%, +, ⤢ |

`1:1` (reset to 100%) is omitted on mobile to reduce crowding.

### Styling

Semi-transparent background using `rgba(--bg-secondary)`, `backdrop-filter: blur(6px)`, 1px border using `--border-primary`, `border-radius: 10px`. Matches the existing `.zoom-controls` aesthetic, not a new visual language.

### GridViewport changes

`GridViewport` receives zoom props and renders `ZoomControls` internally. `WorkspacePage` passes zoom callbacks down. The `preview-toolbar` on desktop continues to render `WorkspaceToolbar` + `ImageViewToggle` but no longer contains `ZoomControls`.

## 3. Unsaved Changes Indicator

### New state: `isDirty`

Add to `WorkspaceContext`:

```ts
isDirty: boolean;
setIsDirty: (v: boolean) => void;   // internal; exposed for testing
```

`isDirty` is set `true` when any of the following change **after** the last save or load:
- `placedItems`
- `refImagePlacements`
- `spacerConfig`
- `drawerWidth`
- `drawerDepth`

`isDirty` is reset to `false` on:
- Successful save — inside `handleSaveComplete`
- Layout load — wherever `layoutMeta` is populated from a loaded layout

### Breadcrumb update

In `WorkspacePage`, when `isDirty && layoutMeta.id`:

```jsx
<span className="unsaved-dot" aria-hidden="true" />
<span className="unsaved-label">unsaved changes</span>
```

- `.unsaved-dot` — 7×7px amber circle, amber glow via `box-shadow`
- `.unsaved-label` — small amber pill: `background`, `border-radius`, `padding`, `font-size: var(--text-xs)`

When there is no `layoutMeta.id` (new, never-saved layout) no indicator is shown — there is nothing to be "unsaved" from.

This applies on both desktop and mobile breadcrumb.

## Files

### New

| File | Purpose |
|------|---------|
| `packages/app/src/components/MobileActionBar.tsx` | Bottom tab bar component |
| `packages/app/src/components/MobileActionBar.test.tsx` | Unit tests |

### Modified

| File | Change |
|------|--------|
| `packages/app/src/contexts/WorkspaceContext.tsx` | Add `isDirty` + reset logic |
| `packages/app/src/components/GridViewport.tsx` | Accept zoom props, render floating `ZoomControls` |
| `packages/app/src/pages/WorkspacePage.tsx` | Conditional toolbar/bar rendering, updated breadcrumb, pass zoom into viewport |
| `packages/app/src/App.css` | Styles for mobile action bar, floating zoom overlay, unsaved indicator |

## Testing

- **Unit — `MobileActionBar`**: renders correct buttons per auth state; disabled states; save button appearance per `layoutMeta.id`; long-press on Save fires `onSaveAsNew`
- **Unit — `isDirty`**: set on `placedItems` change; reset on `handleSaveComplete`; not set on initial load
- **E2E**: existing mobile tests continue to pass; add assertion that bottom bar is visible and toolbar hidden at 390px viewport width
