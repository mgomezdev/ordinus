# Grid Panning — Design Spec

**Date:** 2026-04-05
**Branch:** feat/docker-hub-publish

## Problem

When the grid is larger than the viewport, users have no way to pan to off-screen areas on trackpads or touchscreens. Mouse users can already pan via middle-click drag or Space + left-click drag, but those gestures don't exist on touch devices, and trackpad two-finger scroll currently zooms instead of panning.

## Gesture Map

| Device | Gesture | Action | Before | After |
|---|---|---|---|---|
| Mouse | Middle-click drag | Pan | ✅ | ✅ unchanged |
| Mouse | Space + left-click drag | Pan | ✅ | ✅ unchanged |
| Trackpad | 2-finger scroll (no `ctrlKey`) | Pan | ❌ zoomed | ✅ pans |
| Trackpad | Pinch (`ctrlKey` on wheel event) | Zoom | ✅ | ✅ unchanged |
| Touch | 2-finger drag (same direction) | Pan | ❌ missing | ✅ pans |
| Touch | 2-finger pinch (changing distance) | Zoom | ✅ | ✅ improved (atomic) |
| Touch | 2-finger blended (move + pinch) | Pan + zoom simultaneously | ❌ missing | ✅ atomic update |

Single-finger touch continues to drive item interaction (drag to place, select). No mode toggle is added.

## Architecture

### Approach: Extend `useGridTransform`, thin wiring in `GridViewport`

All coordinate math lives in `useGridTransform`. `GridViewport` registers event listeners and delegates — same pattern as the existing `handleWheel`.

### `useGridTransform.ts` changes

**`handleWheel` (modified):**
- Check `e.ctrlKey`:
  - `true` → zoom centered on cursor (existing behavior, unchanged)
  - `false` → pan by `(-e.deltaX / zoom, -e.deltaY / zoom)`; no zoom change

**`handleTouchStart` (new callback):**
- Only acts when `e.touches.length === 2`
- Records `lastPinchDist` and `lastPinchMidpoint` into refs owned by the hook
- Single-touch does nothing

**`handleTouchMove` (new callback):**
- Only acts when `e.touches.length === 2`
- Computes new distance → derive zoom scale factor
- Computes new midpoint → derive pan delta (midpoint shift / new zoom)
- Calls `updateTransform` once with both the new zoom and new pan — atomic, no intermediate renders

Refs for pinch state (`lastPinchDist`, `lastPinchMidpoint`, `lastPinchZoom`) live inside `useGridTransform` alongside the existing `transformRef`.

### `GridViewport.tsx` changes

- Remove the existing pinch-to-zoom `useEffect` (it only handled scale, not midpoint pan)
- Add a new `useEffect` that registers `touchstart` → `handleTouchStart` and `touchmove` → `handleTouchMove` with `{ passive: false }`
- Add `handleTouchStart: (e: TouchEvent) => void` and `handleTouchMove: (e: TouchEvent) => void` to the `GridViewportProps` interface
- Accept and wire those props in the component

### `WorkspacePage.tsx` changes

- Destructure `handleTouchStart` and `handleTouchMove` from `useGridTransform()`
- Pass them to `<GridViewport>`

### No changes to

`GridPreview`, `useGridItems`, all type definitions, all other hooks and components.

## Files Changed

| File | Change type |
|---|---|
| `packages/app/src/hooks/useGridTransform.ts` | Modify — add `handleTouchStart`, `handleTouchMove`; fix `handleWheel` |
| `packages/app/src/components/GridViewport.tsx` | Modify — replace pinch `useEffect`, add new props |
| `packages/app/src/pages/WorkspacePage.tsx` | Modify — pass new props to `GridViewport` |
| `packages/app/src/hooks/useGridTransform.test.ts` | Extend — add unit tests for new/changed behavior |
| `e2e/tests/pan-gestures.spec.ts` | New — E2E gesture tests |

## Testing

### Unit tests (`useGridTransform.test.ts`, extend existing)

- `handleWheel` without `ctrlKey` → `panX`/`panY` change, zoom unchanged
- `handleWheel` with `ctrlKey` → zoom changes (regression guard on existing behavior)
- `handleTouchMove` same-direction 2 touches → `panX`/`panY` change, zoom unchanged
- `handleTouchMove` distance-only change → zoom changes, pan unchanged
- `handleTouchMove` blended → both zoom and pan update in a single `updateTransform` call

### E2E tests (`e2e/tests/pan-gestures.spec.ts`, new)

- Trackpad scroll (synthetic `wheel` without `ctrlKey`) → grid CSS transform shows translation
- Trackpad pinch (synthetic `wheel` with `ctrlKey`) → grid CSS transform shows scale
- Two-finger touch drag → grid translates (Playwright touch API)
- Two-finger pinch → grid scales
- Two-finger blended gesture → grid both translates and scales

Use the existing page object for the workspace viewport. Assert on the `transform` style of `.preview-content`.

## Out of Scope

- Pan inertia / momentum scrolling
- Scroll boundary clamping (grid can be panned off-screen)
- Keyboard arrow-key panning
- Visual "pan mode" toggle button
