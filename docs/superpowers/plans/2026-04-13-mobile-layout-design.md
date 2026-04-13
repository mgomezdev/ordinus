# Mobile Layout Design

## Goal

Make the gridfinity customizer usable on tablets (768px–1024px) and phones (≤768px) by switching to a collapsible-sidebar layout that keeps the grid canvas always visible.

## Problem

On tablet viewports the three-column layout (library | grid | settings) collapses in a way that hides the grid canvas. The component library appears on the left and grid settings on the right, leaving no room for the actual grid.

## Target Devices

- **Tablet breakpoint:** ≤1024px (iPad, Android tablets)
- **Phone breakpoint:** ≤768px (iPhone, small Android)

---

## Layout Architecture

At `≤1024px` the app switches from the desktop 3-column flex layout to an **overlay panel** model:

- `.app-main` fills 100% of the available space with `position: relative`
- The grid canvas always occupies the full viewport
- The library panel (left) and settings panel (right) become **floating overlays** that sit on top of the canvas when open, or collapse to a **44px icon strip** pinned to their respective edges when closed
- No layout shift when panels open/close — the grid never moves

At `≤768px` icon strips shrink to 36px and expanded overlay panels go full-width.

### Collapse State

A new `useMobileLayout` hook tracks two booleans: `libraryOpen` and `settingsOpen`. State persists to `localStorage` so the preference survives page refresh.

Toggle buttons sit at the top of each icon strip:
- `☰` for library (left edge)
- `⚙` for settings (right edge)
- `✕` closes an open panel

No mutual exclusion — both panels can be open simultaneously.

---

## Library Panel (left)

**Collapsed (icon strip):**
- 44px wide strip pinned to left edge
- `☰` toggle button at top
- Category icons stacked vertically; clicking one opens the panel scrolled to that category

**Expanded (overlay):**
- 260px wide overlay slides in from left
- Resize handle disabled on tablet (fixed width)
- Semi-transparent backdrop covers only the grid area; tapping it closes the panel
- Library item grid: `repeat(auto-fill, 80px)` cards on tablet (down from 120px desktop)
- At ≤768px: full-width panel, 72px cards

---

## Settings Panel (right)

**Collapsed (icon strip):**
- 44px wide strip pinned to right edge
- `⚙` toggle button at top

**Expanded (overlay):**
- 280px wide overlay slides in from right
- Settings content unchanged — existing collapsible sections work as-is

---

## Mobile E2E Tests

New spec: `packages/app/e2e/tests/mobile-layout.spec.ts`  
New page object: `packages/app/e2e/pages/MobileLayoutPage.ts`

Viewports tested:
- `768×1024` (iPad)
- `390×844` (iPhone)

Test cases:
- Library panel is collapsed by default on tablet
- Tapping library toggle opens the panel
- Tapping backdrop closes the library panel
- Settings panel is collapsed by default on tablet
- Tapping settings toggle opens the panel
- Drag-and-drop from library to grid works with both panels collapsed
- Library card size is ≤80px on tablet viewport
- Panel collapse state persists after page refresh
- Both panels can be open simultaneously

**Existing test audit:** scan current E2E specs for desktop-only assumptions (hardcoded viewport sizes, pixel-offset drags, desktop-only selectors) that would fail at tablet width.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `packages/app/src/hooks/useMobileLayout.ts` | Create — `libraryOpen`/`settingsOpen` state + localStorage |
| `packages/app/src/pages/WorkspacePage.tsx` | Modify — wire `useMobileLayout`, render toggle buttons and backdrops |
| `packages/app/src/App.css` | Modify — overlay positioning, icon strip styles, card size reduction, media queries |
| `packages/app/e2e/tests/mobile-layout.spec.ts` | Create — mobile-exclusive test spec |
| `packages/app/e2e/pages/MobileLayoutPage.ts` | Create — page object for mobile tests |
