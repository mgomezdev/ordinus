import { test, expect, type Page } from '@playwright/test';
import { GridPage } from '../pages/GridPage';

// Helper: dispatch a wheel event with optional ctrlKey
async function dispatchWheel(page: Page, deltaX: number, deltaY: number, ctrlKey = false) {
  const viewport = page.locator('[data-testid="preview-viewport"]');
  await viewport.hover();
  const box = await viewport.boundingBox();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.evaluate(
    ({ cx, cy, deltaX, deltaY, ctrlKey }) => {
      const el = document.elementFromPoint(cx, cy);
      if (!el) throw new Error(`No element at (${cx}, ${cy})`);
      el.dispatchEvent(
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
  await viewport.hover();
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

      // Complete the gesture lifecycle
      el.dispatchEvent(new TouchEvent('touchend', {
        touches: [], changedTouches: [t1e, t2e], cancelable: true, bubbles: true,
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
      expect(percent).toBeLessThan(100);
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

      // Pan must also have occurred — the midpoint shifted right (from 150 to 200 in local
      // coords), so panX should be 25px MORE than a pure-zoom-only gesture would produce.
      // pure-zoom panX = mid.clientX/newZoom - mid.clientX = mid.clientX*(1/newZoom - 1)
      // blended panX   = (mid+50).clientX/newZoom - mid.clientX = pure-zoom panX + 50/newZoom
      // With newZoom ≈ 2: blended panX = pure-zoom panX + 25  → blended > pure-zoom by 25px.
      // Since both values are negative (viewport offset dominates), we verify the pan delta
      // by reading panX and checking it is strictly greater than the pure-zoom reference.
      const viewport2 = page.locator('[data-testid="preview-viewport"]');
      const box2 = await viewport2.boundingBox();
      const ox2 = box2!.x;
      const transform = await getContentTransform(page);
      const match = transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
      expect(match).not.toBeNull();
      const actualPanX = Number(match![1]);
      // Compute the panX that would result from zoom alone (no midpoint shift).
      // Assumes panX starts at 0 and zoom starts at 1 (guaranteed by beforeEach fresh load).
      const pureZoomPanX = (ox2 + 150) / 2 - (ox2 + 150); // = -(ox2/2 + 75)
      // Blended should be 25px greater than pure-zoom (midpoint shifted 50px right at zoom 2)
      expect(actualPanX).toBeGreaterThan(pureZoomPanX);
    });
  });
});
