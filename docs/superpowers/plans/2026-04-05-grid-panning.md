# Grid Panning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trackpad scroll-to-pan and two-finger touch pan+zoom to the grid viewport, so users can navigate grids larger than the window on all input devices.

**Architecture:** Extend `useGridTransform` with `handleTouchStart` and `handleTouchMove` (matching the existing `handleWheel` pattern), and fix `handleWheel` to check `ctrlKey` — scroll pans, pinch zooms. `GridViewport` wires the new event listeners and removes its old pinch-only `useEffect`.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library (unit), Playwright (E2E)

---

## File Map

| File | Change |
|---|---|
| `packages/app/src/hooks/useGridTransform.ts` | Add `handleTouchStart`, `handleTouchMove`; fix `handleWheel` ctrlKey check |
| `packages/app/src/components/GridViewport.tsx` | Add props, replace pinch `useEffect` with new one |
| `packages/app/src/pages/WorkspacePage.tsx` | Destructure and pass new props |
| `packages/app/src/hooks/useGridTransform.test.ts` | Extend with ctrlKey + touch tests; update existing wheel tests |
| `packages/app/e2e/tests/zoom-pan.spec.ts` | Fix `Wheel Zoom` tests (they now need `ctrlKey: true`) |
| `packages/app/e2e/tests/pan-gestures.spec.ts` | New: trackpad scroll pan + touch pan/zoom E2E tests |

---

## Task 1: Fix `handleWheel` — trackpad scroll pans, pinch zooms

**Files:**
- Modify: `packages/app/src/hooks/useGridTransform.ts`
- Modify: `packages/app/src/hooks/useGridTransform.test.ts`

- [ ] **Step 1: Update existing wheel unit tests to add `ctrlKey: true`**

The existing `Mouse Wheel Zoom` tests pass mock events without `ctrlKey`. After the fix, those events will be treated as pan (falsy `ctrlKey`). Update all three mocks in the `Mouse Wheel Zoom` describe block:

```ts
// zoom in test
const mockEvent = {
  preventDefault: () => {},
  deltaY: -100,
  deltaX: 0,
  clientX: 200,
  clientY: 200,
  ctrlKey: true,
} as WheelEvent;

// zoom out test
const mockEvent = {
  preventDefault: () => {},
  deltaY: 100,
  deltaX: 0,
  clientX: 200,
  clientY: 200,
  ctrlKey: true,
} as WheelEvent;

// zoom centered test
const mockEvent = {
  preventDefault: () => {},
  deltaY: -200,
  deltaX: 0,
  clientX: 100,
  clientY: 100,
  ctrlKey: true,
} as WheelEvent;
```

- [ ] **Step 2: Add failing unit tests for scroll-to-pan (no ctrlKey)**

Append a new `describe` block after `Mouse Wheel Zoom` in `packages/app/src/hooks/useGridTransform.test.ts`:

```ts
describe('Trackpad Scroll Pan', () => {
  it('should pan (not zoom) when ctrlKey is false', () => {
    const { result } = renderHook(() => useGridTransform());

    const mockEvent = {
      preventDefault: () => {},
      deltaY: 100,
      deltaX: 50,
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
    } as WheelEvent;
    const rect = { left: 0, top: 0 } as DOMRect;

    act(() => { result.current.handleWheel(mockEvent, rect); });

    // Zoom must not change
    expect(result.current.transform.zoom).toBe(1);
    // Pan must change (negate delta, divide by zoom=1)
    expect(result.current.transform.panX).toBeCloseTo(-50, 5);
    expect(result.current.transform.panY).toBeCloseTo(-100, 5);
  });

  it('should pan proportionally when zoomed in and ctrlKey is false', () => {
    const { result } = renderHook(() => useGridTransform());

    // Zoom to 2x first
    act(() => { result.current.setZoomLevel(2); });

    const mockEvent = {
      preventDefault: () => {},
      deltaY: 0,
      deltaX: 200,
      clientX: 0,
      clientY: 0,
      ctrlKey: false,
    } as WheelEvent;
    const rect = { left: 0, top: 0 } as DOMRect;

    act(() => { result.current.handleWheel(mockEvent, rect); });

    expect(result.current.transform.zoom).toBe(2);
    // deltaX=200 at zoom=2 → panX change = -200/2 = -100
    expect(result.current.transform.panX).toBeCloseTo(-100, 5);
  });
});
```

- [ ] **Step 3: Run tests — confirm new tests FAIL, existing wheel zoom tests FAIL**

```bash
cd /home/michael/projects/gridfinitycustomizer
npm run test:run -- --reporter=verbose 2>&1 | grep -A 2 "useGridTransform"
```

Expected: `Mouse Wheel Zoom` tests fail (ctrlKey not checked yet), `Trackpad Scroll Pan` tests fail.

- [ ] **Step 4: Fix `handleWheel` in `useGridTransform.ts`**

Replace the entire `handleWheel` callback (lines ~50–71):

```ts
const handleWheel = useCallback((e: WheelEvent, containerRect: DOMRect) => {
  e.preventDefault();
  const t = transformRef.current;

  if (!e.ctrlKey) {
    // Trackpad 2-finger scroll → pan (no zoom change)
    updateTransform({
      ...t,
      panX: t.panX - e.deltaX / t.zoom,
      panY: t.panY - e.deltaY / t.zoom,
    });
    return;
  }

  // Pinch-to-zoom (ctrlKey = true on trackpad pinch, or Ctrl+scroll with mouse wheel)
  const delta = -e.deltaY * WHEEL_ZOOM_FACTOR;
  const newZoom = clampZoom(t.zoom * (1 + delta));
  if (newZoom === t.zoom) return;

  // Zoom centered on cursor position
  const mouseX = e.clientX - containerRect.left;
  const mouseY = e.clientY - containerRect.top;
  const contentX = mouseX / t.zoom - t.panX;
  const contentY = mouseY / t.zoom - t.panY;
  const newPanX = mouseX / newZoom - contentX;
  const newPanY = mouseY / newZoom - contentY;

  updateTransform({ zoom: newZoom, panX: newPanX, panY: newPanY });
}, [updateTransform]);
```

- [ ] **Step 5: Run unit tests — all must pass**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|useGridTransform"
```

Expected: All `useGridTransform` tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/hooks/useGridTransform.ts packages/app/src/hooks/useGridTransform.test.ts
git commit -m "$(cat <<'EOF'
feat(viewport): trackpad scroll pans, pinch zooms (ctrlKey check)

handleWheel now checks e.ctrlKey: false = pan via deltaX/deltaY,
true = zoom centered on cursor (existing behavior).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `handleTouchStart` and `handleTouchMove` to `useGridTransform`

**Files:**
- Modify: `packages/app/src/hooks/useGridTransform.ts`
- Modify: `packages/app/src/hooks/useGridTransform.test.ts`

- [ ] **Step 1: Add the touch unit test helper and failing tests**

Add a helper function at the top of the test file (after the imports):

```ts
function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>): TouchEvent {
  return {
    preventDefault: () => {},
    touches: Object.assign(
      touches.map(({ clientX, clientY }) => ({ clientX, clientY })),
      { length: touches.length },
    ),
  } as unknown as TouchEvent;
}
```

Append a new `describe` block after `Trackpad Scroll Pan`:

```ts
describe('Touch Gestures', () => {
  it('should pan when two fingers move in the same direction (no distance change)', () => {
    const { result } = renderHook(() => useGridTransform());

    // Start: fingers at (100,200) and (200,200) — midpoint (150,200), dist=100
    act(() => {
      result.current.handleTouchStart(makeTouchEvent([
        { clientX: 100, clientY: 200 },
        { clientX: 200, clientY: 200 },
      ]));
    });

    // Move: both shift 60px right — midpoint (210,200), dist still 100
    act(() => {
      result.current.handleTouchMove(makeTouchEvent([
        { clientX: 160, clientY: 200 },
        { clientX: 260, clientY: 200 },
      ]));
    });

    // Zoom must be unchanged (distance didn't change)
    expect(result.current.transform.zoom).toBeCloseTo(1.0, 5);
    // panX must increase (fingers moved right → content shifts right)
    expect(result.current.transform.panX).toBeGreaterThan(0);
    expect(result.current.transform.panY).toBeCloseTo(0, 5);
  });

  it('should zoom when two fingers move apart with fixed midpoint', () => {
    const { result } = renderHook(() => useGridTransform());

    // Start: midpoint (200,200), dist=100
    act(() => {
      result.current.handleTouchStart(makeTouchEvent([
        { clientX: 150, clientY: 200 },
        { clientX: 250, clientY: 200 },
      ]));
    });

    // Spread: midpoint still (200,200), dist=200 → zoom doubles
    act(() => {
      result.current.handleTouchMove(makeTouchEvent([
        { clientX: 100, clientY: 200 },
        { clientX: 300, clientY: 200 },
      ]));
    });

    expect(result.current.transform.zoom).toBeCloseTo(2.0, 5);
  });

  it('should update both pan and zoom when fingers move and spread', () => {
    const { result } = renderHook(() => useGridTransform());

    // Start: midpoint (150,200), dist=100
    act(() => {
      result.current.handleTouchStart(makeTouchEvent([
        { clientX: 100, clientY: 200 },
        { clientX: 200, clientY: 200 },
      ]));
    });

    // Move right AND spread: midpoint (200,200), dist=200
    act(() => {
      result.current.handleTouchMove(makeTouchEvent([
        { clientX: 100, clientY: 200 },
        { clientX: 300, clientY: 200 },
      ]));
    });

    // Zoom doubled
    expect(result.current.transform.zoom).toBeCloseTo(2.0, 5);
    // Pan changed (midpoint shifted from 150 → 200)
    expect(Number.isFinite(result.current.transform.panX)).toBe(true);
    expect(Number.isFinite(result.current.transform.panY)).toBe(true);
    expect(result.current.transform.panX).not.toBeCloseTo(0, 1);
  });

  it('should ignore handleTouchStart when fewer than 2 touches', () => {
    const { result } = renderHook(() => useGridTransform());

    act(() => {
      result.current.handleTouchStart(makeTouchEvent([{ clientX: 100, clientY: 200 }]));
    });

    expect(result.current.transform).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });

  it('should ignore handleTouchMove when fewer than 2 touches', () => {
    const { result } = renderHook(() => useGridTransform());

    // Valid start
    act(() => {
      result.current.handleTouchStart(makeTouchEvent([
        { clientX: 100, clientY: 200 },
        { clientX: 200, clientY: 200 },
      ]));
    });

    // Single-touch move — must be ignored
    act(() => {
      result.current.handleTouchMove(makeTouchEvent([{ clientX: 500, clientY: 500 }]));
    });

    expect(result.current.transform).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
```

- [ ] **Step 2: Run tests — confirm new touch tests FAIL**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "Touch Gestures|✓|×|FAIL"
```

Expected: All `Touch Gestures` tests fail with "result.current.handleTouchStart is not a function".

- [ ] **Step 3: Add `handleTouchStart` and `handleTouchMove` to `useGridTransform.ts`**

Add a pinch state ref after `transformRef` (around line 17):

```ts
const pinchStartRef = useRef<{
  dist: number;
  zoom: number;
  mid: { x: number; y: number };
  panX: number;
  panY: number;
} | null>(null);
```

Add both callbacks before the `return` statement:

```ts
const handleTouchStart = useCallback((e: TouchEvent) => {
  if (e.touches.length !== 2) return;
  e.preventDefault();
  const t1 = e.touches[0];
  const t2 = e.touches[1];
  const t = transformRef.current;
  pinchStartRef.current = {
    dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
    zoom: t.zoom,
    mid: { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 },
    panX: t.panX,
    panY: t.panY,
  };
}, []);

const handleTouchMove = useCallback((e: TouchEvent) => {
  if (e.touches.length !== 2 || !pinchStartRef.current) return;
  e.preventDefault();
  const { dist: startDist, zoom: startZoom, mid: startMid, panX: startPanX, panY: startPanY } =
    pinchStartRef.current;
  const t1 = e.touches[0];
  const t2 = e.touches[1];

  const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const newZoom = clampZoom(startZoom * (newDist / startDist));
  const newMid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };

  // Keep the content point that was under startMid anchored under newMid
  const contentX = startMid.x / startZoom - startPanX;
  const contentY = startMid.y / startZoom - startPanY;

  updateTransform({
    zoom: newZoom,
    panX: newMid.x / newZoom - contentX,
    panY: newMid.y / newZoom - contentY,
  });
}, [updateTransform]);
```

Add both to the return object:

```ts
return {
  transform,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToScreen,
  handleWheel,
  setZoomLevel,
  pan,
  handleTouchStart,
  handleTouchMove,
};
```

- [ ] **Step 4: Run all unit tests — all must pass**

```bash
npm run test:run -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|useGridTransform"
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/hooks/useGridTransform.ts packages/app/src/hooks/useGridTransform.test.ts
git commit -m "$(cat <<'EOF'
feat(viewport): add handleTouchStart/handleTouchMove for two-finger pan+zoom

Two-finger gestures now simultaneously pan (midpoint delta) and zoom
(distance ratio), anchored to the content point under the initial
finger midpoint. Single-touch is ignored.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire new touch handlers in `GridViewport` and `WorkspacePage`

**Files:**
- Modify: `packages/app/src/components/GridViewport.tsx`
- Modify: `packages/app/src/pages/WorkspacePage.tsx`

- [ ] **Step 1: Update `GridViewportProps` interface and component signature in `GridViewport.tsx`**

Replace the existing interface (lines 4–12) and function signature. Remove `setZoomLevel` (its only consumer was the old pinch `useEffect` being deleted). Add the two new touch props:

```ts
interface GridViewportProps {
  children: ReactNode;
  transform: GridTransform;
  handleWheel: (e: WheelEvent, rect: DOMRect) => void;
  pan: (dx: number, dy: number) => void;
  isSpaceHeldRef: MutableRefObject<boolean>;
  viewportRef?: RefObject<HTMLDivElement | null>;
  handleTouchStart: (e: TouchEvent) => void;
  handleTouchMove: (e: TouchEvent) => void;
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
}: GridViewportProps) {
```

- [ ] **Step 2: Remove the old pinch-to-zoom `useEffect` and add the new one**

Remove the entire third `useEffect` (lines 86–121 — the one that declares `lastPinchDist`, `lastPinchZoom`, `getDistance`, `onTouchStart`, `onTouchMove`).

In its place add:

```ts
// Two-finger pan + zoom touch support
useEffect(() => {
  const viewport = ref.current;
  if (!viewport) return;

  // passive: false required — handlers call preventDefault() to suppress browser scroll/zoom
  viewport.addEventListener('touchstart', handleTouchStart, { passive: false });
  viewport.addEventListener('touchmove', handleTouchMove, { passive: false });

  return () => {
    viewport.removeEventListener('touchstart', handleTouchStart);
    viewport.removeEventListener('touchmove', handleTouchMove);
  };
}, [handleTouchStart, handleTouchMove, ref]);
```

- [ ] **Step 3: Update `WorkspacePage.tsx` to pass new props**

In `WorkspacePage.tsx`, update the `useGridTransform` destructure (around line 75):

```ts
const {
  transform, zoomIn, zoomOut, resetZoom, fitToScreen,
  handleWheel, setZoomLevel, pan, handleTouchStart, handleTouchMove,
} = useGridTransform();
```

Update the `<GridViewport>` JSX (around line 306) — remove `setZoomLevel`, add the two new props:

```tsx
<GridViewport
  viewportRef={viewportRef}
  transform={transform}
  handleWheel={handleWheel}
  pan={pan}
  isSpaceHeldRef={isSpaceHeldRef}
  handleTouchStart={handleTouchStart}
  handleTouchMove={handleTouchMove}
>
```

Note: `setZoomLevel` is still used by `handleFitToScreen` and elsewhere in `WorkspacePage.tsx` — keep it in the `useGridTransform` destructure, just don't pass it to `GridViewport` anymore.

- [ ] **Step 4: Run linter and unit tests**

```bash
cd /home/michael/projects/gridfinitycustomizer
npm run lint && npm run test:run
```

Expected: No lint errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/GridViewport.tsx packages/app/src/pages/WorkspacePage.tsx
git commit -m "$(cat <<'EOF'
feat(viewport): wire handleTouchStart/handleTouchMove into GridViewport

Replaces the old pinch-scale-only useEffect with the new hook-provided
handlers. GridViewportProps removes setZoomLevel (no longer used by component).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fix existing E2E wheel zoom tests

The `Wheel Zoom` tests in `zoom-pan.spec.ts` use `page.mouse.wheel` which dispatches wheel events without `ctrlKey`. After Task 1, those events now trigger pan, not zoom. Update them to dispatch ctrl+wheel events.

**Files:**
- Modify: `packages/app/e2e/tests/zoom-pan.spec.ts`

- [ ] **Step 1: Add a `ctrlWheel` helper to `zoom-pan.spec.ts`**

Add after the imports, before `test.describe`:

```ts
async function ctrlWheel(page: Page, deltaY: number) {
  const viewport = page.locator('[data-testid="preview-viewport"]');
  await viewport.hover();
  const box = await viewport.boundingBox();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.evaluate(
    ({ cx, cy, deltaY }) => {
      document.elementFromPoint(cx, cy)?.dispatchEvent(
        new WheelEvent('wheel', { deltaY, ctrlKey: true, bubbles: true, cancelable: true }),
      );
    },
    { cx, cy, deltaY },
  );
  await page.waitForTimeout(50);
}
```

Also add `import type { Page } from '@playwright/test';` if not already present (it may already be imported via `{ test, expect }` — only add the `Page` type if missing).

- [ ] **Step 2: Replace `Wheel Zoom` tests to use `ctrlWheel`**

Replace the entire `test.describe('Wheel Zoom', ...)` block:

```ts
test.describe('Wheel Zoom', () => {
  test('ctrl+scroll up zooms in', async ({ page }) => {
    await ctrlWheel(page, -200);

    const zoomLevel = page.locator('.zoom-level');
    const text = await zoomLevel.textContent();
    const percent = parseInt(text!.replace('%', ''), 10);
    expect(percent).toBeGreaterThan(100);
  });

  test('ctrl+scroll down zooms out', async ({ page }) => {
    await ctrlWheel(page, 200);

    const zoomLevel = page.locator('.zoom-level');
    const text = await zoomLevel.textContent();
    const percent = parseInt(text!.replace('%', ''), 10);
    expect(percent).toBeLessThan(100);
  });
});
```

- [ ] **Step 3: Run E2E tests for zoom-pan suite only**

```bash
cd /home/michael/projects/gridfinitycustomizer
npm run test:e2e -- --grep "Zoom and Pan"
```

Expected: All tests pass, including the updated `Wheel Zoom` tests.

- [ ] **Step 4: Commit**

```bash
git add packages/app/e2e/tests/zoom-pan.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): update wheel zoom tests to use ctrlKey dispatch

page.mouse.wheel() no longer zooms (it now pans). Tests that verify
zoom via wheel now dispatch a ctrlKey=true WheelEvent directly.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add E2E pan gesture tests

**Files:**
- Create: `packages/app/e2e/tests/pan-gestures.spec.ts`

- [ ] **Step 1: Create `pan-gestures.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';
import { GridPage } from '../pages/GridPage';

// Helper: dispatch a wheel event with optional ctrlKey
async function dispatchWheel(page: Page, deltaX: number, deltaY: number, ctrlKey = false) {
  const viewport = page.locator('[data-testid="preview-viewport"]');
  const box = await viewport.boundingBox();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.evaluate(
    ({ cx, cy, deltaX, deltaY, ctrlKey }) => {
      document.elementFromPoint(cx, cy)?.dispatchEvent(
        new WheelEvent('wheel', { deltaX, deltaY, ctrlKey, bubbles: true, cancelable: true }),
      );
    },
    { cx, cy, deltaX, deltaY, ctrlKey },
  );
  await page.waitForTimeout(50);
}

// Helper: read the CSS transform of .preview-content
async function getContentTransform(page: Page): Promise<string> {
  return page.locator('.preview-content').evaluate((el) => el.style.transform);
}

// Helper: dispatch a two-finger touch sequence
async function twoFingerTouch(
  page: Page,
  start: [{ x: number; y: number }, { x: number; y: number }],
  end: [{ x: number; y: number }, { x: number; y: number }],
) {
  const viewport = page.locator('[data-testid="preview-viewport"]');
  const box = await viewport.boundingBox();
  const ox = box!.x;
  const oy = box!.y;

  await page.evaluate(
    ({ ox, oy, start, end }) => {
      const el = document.querySelector('[data-testid="preview-viewport"]')!;

      const makeTouch = (id: number, x: number, y: number) =>
        new Touch({ identifier: id, target: el, clientX: ox + x, clientY: oy + y });

      const t1s = makeTouch(1, start[0].x, start[0].y);
      const t2s = makeTouch(2, start[1].x, start[1].y);
      el.dispatchEvent(new TouchEvent('touchstart', {
        touches: [t1s, t2s], cancelable: true, bubbles: true,
      }));

      const t1e = makeTouch(1, end[0].x, end[0].y);
      const t2e = makeTouch(2, end[1].x, end[1].y);
      el.dispatchEvent(new TouchEvent('touchmove', {
        touches: [t1e, t2e], cancelable: true, bubbles: true,
      }));
    },
    { ox, oy, start, end },
  );
  await page.waitForTimeout(50);
}

test.describe('Pan Gestures', () => {
  let gridPage: GridPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
  });

  test.describe('Trackpad scroll pans', () => {
    test('scroll right pans the grid (no zoom change)', async ({ page }) => {
      // Dispatch scroll right (deltaX positive) without ctrlKey
      await dispatchWheel(page, 200, 0, false);

      const transform = await getContentTransform(page);
      // Transform should contain a translate (pan happened)
      expect(transform).toContain('translate(');
      // Zoom display should still be 100%
      await expect(page.locator('.zoom-level')).toHaveText('100%');
    });

    test('scroll down pans the grid (no zoom change)', async ({ page }) => {
      await dispatchWheel(page, 0, 200, false);

      const transform = await getContentTransform(page);
      expect(transform).toContain('translate(');
      await expect(page.locator('.zoom-level')).toHaveText('100%');
    });

    test('ctrl+scroll still zooms (not pans)', async ({ page }) => {
      await dispatchWheel(page, 0, -200, true);

      // Zoom should have changed
      const zoomText = await page.locator('.zoom-level').textContent();
      const percent = parseInt(zoomText!.replace('%', ''), 10);
      expect(percent).toBeGreaterThan(100);
    });
  });

  test.describe('Two-finger touch pan', () => {
    test('two fingers moving right pans the grid', async ({ page }) => {
      // Both fingers shift 100px right — no distance change, so no zoom
      await twoFingerTouch(
        page,
        [{ x: 100, y: 200 }, { x: 200, y: 200 }],
        [{ x: 200, y: 200 }, { x: 300, y: 200 }],
      );

      const transform = await getContentTransform(page);
      expect(transform).toContain('translate(');
      await expect(page.locator('.zoom-level')).toHaveText('100%');
    });
  });

  test.describe('Two-finger touch zoom', () => {
    test('fingers spreading apart zooms in', async ({ page }) => {
      // Fingers spread: dist 100 → 200, midpoint stays fixed
      await twoFingerTouch(
        page,
        [{ x: 150, y: 200 }, { x: 250, y: 200 }],
        [{ x: 100, y: 200 }, { x: 300, y: 200 }],
      );

      const zoomText = await page.locator('.zoom-level').textContent();
      const percent = parseInt(zoomText!.replace('%', ''), 10);
      expect(percent).toBeGreaterThan(100);
    });

    test('fingers pinching together zooms out', async ({ page }) => {
      // Start zoomed in so we can zoom out
      await page.getByLabel('Zoom in').click();
      await page.getByLabel('Zoom in').click();

      // Fingers pinch: dist 200 → 100
      await twoFingerTouch(
        page,
        [{ x: 100, y: 200 }, { x: 300, y: 200 }],
        [{ x: 150, y: 200 }, { x: 250, y: 200 }],
      );

      const zoomText = await page.locator('.zoom-level').textContent();
      const percent = parseInt(zoomText!.replace('%', ''), 10);
      // Started at 120%, pinch halves it to ~60%
      expect(percent).toBeLessThan(120);
    });
  });

  test.describe('Two-finger blended pan and zoom', () => {
    test('fingers spreading and moving right both pans and zooms', async ({ page }) => {
      // Spread (dist 100→200) AND shift right (midpoint 150→200)
      await twoFingerTouch(
        page,
        [{ x: 100, y: 200 }, { x: 200, y: 200 }],
        [{ x: 100, y: 200 }, { x: 300, y: 200 }],
      );

      // Zoom should have increased
      const zoomText = await page.locator('.zoom-level').textContent();
      const percent = parseInt(zoomText!.replace('%', ''), 10);
      expect(percent).toBeGreaterThan(100);

      // Transform should also contain a translate (pan occurred)
      const transform = await getContentTransform(page);
      expect(transform).toContain('translate(');
    });
  });
});
```

- [ ] **Step 2: Run the new E2E tests**

```bash
cd /home/michael/projects/gridfinitycustomizer
npm run test:e2e -- --grep "Pan Gestures"
```

Expected: All tests pass.

- [ ] **Step 3: Run the full E2E suite to check for regressions**

```bash
npm run test:e2e
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/app/e2e/tests/pan-gestures.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): add pan gesture tests for trackpad scroll and two-finger touch

Covers: trackpad scroll pans (no zoom), ctrl+scroll zooms, two-finger
touch pan-only, zoom-only, and simultaneous pan+zoom.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full lint + unit test + E2E suite**

```bash
cd /home/michael/projects/gridfinitycustomizer
npm run lint && npm run test:run && npm run test:e2e
```

Expected: No lint errors. All unit tests pass. All E2E tests pass.

- [ ] **Step 2: Done**

All five files changed. No new architectural files added. The feature is complete.
