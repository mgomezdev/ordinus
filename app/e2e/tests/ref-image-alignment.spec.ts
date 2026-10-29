import { test, expect, type Page, type Locator } from '@playwright/test';
import sharp from 'sharp';
import { GridPage } from '../pages/GridPage';
import { LibraryPage } from '../pages/LibraryPage';
import { pointerDragDrop } from '../utils/drag-drop';

/**
 * Corner alignment: the user marks the grid's 4 corners on a reference photo
 * and the photo is perspective-warped onto the grid. Runs against the real
 * server so the warp endpoint and layout persistence are exercised end to end.
 */

const API_BASE = process.env.TARGET === 'docker'
  ? 'http://localhost:32888/api/v1'
  : 'http://localhost:3001/api/v1';

type NormPoint = { x: number; y: number };
type NormQuad = [NormPoint, NormPoint, NormPoint, NormPoint];

const PHOTO_W = 800;
const PHOTO_H = 600;

// Photo framed almost square-on: minimal distortion needed
const NEAR_RECT: NormQuad = [
  { x: 0.12, y: 0.1 },
  { x: 0.9, y: 0.12 },
  { x: 0.88, y: 0.9 },
  { x: 0.1, y: 0.88 },
];

// Drawer shot at an angle: the far edge looks narrower
const TRAPEZOID: NormQuad = [
  { x: 0.3, y: 0.2 },
  { x: 0.7, y: 0.2 },
  { x: 0.9, y: 0.8 },
  { x: 0.1, y: 0.8 },
];

const HANDLE_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];
const POSITION_TOLERANCE = 0.015;

/** A fake drawer photo with the given quad outlined and coloured corner dots. */
async function drawerPhoto(quad: NormQuad): Promise<Buffer> {
  const pts = quad.map(p => `${p.x * PHOTO_W},${p.y * PHOTO_H}`).join(' ');
  const colours = ['#e11d48', '#16a34a', '#2563eb', '#f59e0b'];
  const dots = quad
    .map((p, i) => `<circle cx="${p.x * PHOTO_W}" cy="${p.y * PHOTO_H}" r="10" fill="${colours[i]}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PHOTO_W}" height="${PHOTO_H}">
    <rect width="100%" height="100%" fill="#d6c4a8"/>
    <polygon points="${pts}" fill="#8b6b4a" stroke="#222" stroke-width="4"/>
    ${dots}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function uploadPhoto(page: Page, name: string, quad: NormQuad): Promise<number> {
  const res = await page.request.post(`${API_BASE}/ref-images`, {
    multipart: { image: { name, mimeType: 'image/png', buffer: await drawerPhoto(quad) } },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data.id as number;
}

async function placePhotoOnGrid(page: Page, gridPage: GridPage, name: string): Promise<Locator> {
  await page.locator('.library-cat-tab', { hasText: 'Images' }).click();
  const card = page.locator('.ref-image-card', { hasText: name });
  await expect(card).toBeVisible();
  await pointerDragDrop(page, card, gridPage.gridContainer);
  const overlay = page.locator('.reference-image-overlay').last();
  await expect(overlay).toBeVisible();
  await overlay.click();
  await expect(overlay.locator('.reference-image-overlay__toolbar')).toBeVisible();
  return overlay;
}

async function openCornerEditor(page: Page, overlay: Locator, buttonName: RegExp): Promise<Locator> {
  await overlay.getByRole('button', { name: buttonName }).click();
  const dialog = page.getByRole('dialog', { name: /align photo to grid/i });
  await expect(dialog).toBeVisible();
  // Wait for the photo so angle checks run in its pixel space
  await expect.poll(() => dialog.locator('.corner-editor__image').evaluate(
    (img: HTMLImageElement) => img.complete && img.naturalWidth,
  )).toBeGreaterThan(0);
  return dialog;
}

async function dragHandleTo(page: Page, dialog: Locator, index: number, target: NormPoint): Promise<void> {
  const stage = await dialog.getByTestId('corner-editor-stage').boundingBox();
  const handle = await dialog.getByRole('button', { name: `${HANDLE_LABELS[index]} corner` }).boundingBox();
  if (!stage || !handle) throw new Error('corner editor not laid out');
  const startX = handle.x + handle.width / 2;
  const startY = handle.y + handle.height / 2;
  const endX = stage.x + target.x * stage.width;
  const endY = stage.y + target.y * stage.height;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + ((endX - startX) * i) / steps, startY + ((endY - startY) * i) / steps);
  }
  await page.mouse.up();
}

async function handlePositions(dialog: Locator): Promise<NormPoint[]> {
  const stage = await dialog.getByTestId('corner-editor-stage').boundingBox();
  if (!stage) throw new Error('stage not laid out');
  const result: NormPoint[] = [];
  for (const label of HANDLE_LABELS) {
    const box = await dialog.getByRole('button', { name: `${label} corner` }).boundingBox();
    if (!box) throw new Error(`${label} handle not laid out`);
    result.push({
      x: (box.x + box.width / 2 - stage.x) / stage.width,
      y: (box.y + box.height / 2 - stage.y) / stage.height,
    });
  }
  return result;
}

async function markCornersAndApply(page: Page, dialog: Locator, quad: NormQuad) {
  for (let i = 0; i < 4; i++) await dragHandleTo(page, dialog, i, quad[i]);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  const warpResponse = page.waitForResponse(r => /\/ref-images\/\d+\/warp$/.test(r.url()));
  await dialog.getByRole('button', { name: /^apply$/i }).click();
  const res = await warpResponse;
  expect(res.status()).toBe(200);
  await expect(dialog).toBeHidden();
  return (await res.json()).data as { warpedImageUrl: string; x: number; y: number; width: number; height: number };
}

test.describe('Reference image corner alignment', () => {
  let gridPage: GridPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
    await new LibraryPage(page).waitForLibraryReady();
  });

  for (const [label, quad] of [
    ['near-rectangular (minimal distortion)', NEAR_RECT],
    ['trapezoid', TRAPEZOID],
  ] as const) {
    test(`aligns a ${label} quad onto the grid and overflows past it`, async ({ page }) => {
      const name = `align-${label.split(' ')[0]}-${Date.now()}.png`;
      await uploadPhoto(page, name, quad);
      await page.reload();
      await gridPage.waitForGridReady();

      const overlay = await placePhotoOnGrid(page, gridPage, name);
      const dialog = await openCornerEditor(page, overlay, /align corners/i);

      // The limitation is spelled out in the flow
      await expect(dialog).toContainText('convex');
      await expect(dialog).toContainText('50°');
      await expect(dialog).toContainText('135°');

      const warp = await markCornersAndApply(page, dialog, quad);
      expect(warp.warpedImageUrl).toMatch(/^ref-warp\//);

      // Overlay now shows the warped image and extends beyond every grid edge
      await expect(overlay.locator('img')).toHaveAttribute('src', new RegExp(warp.warpedImageUrl));
      const gridBox = await gridPage.gridContainer.boundingBox();
      const overlayBox = await overlay.boundingBox();
      expect(gridBox && overlayBox).toBeTruthy();
      expect(overlayBox!.x).toBeLessThan(gridBox!.x);
      expect(overlayBox!.y).toBeLessThan(gridBox!.y);
      expect(overlayBox!.x + overlayBox!.width).toBeGreaterThan(gridBox!.x + gridBox!.width);

      // Scale/rotate no longer apply to an aligned photo
      await overlay.click();
      await expect(overlay.locator('#scale-slider')).toHaveCount(0);

      // Corners can be redefined: the editor reopens on the original with the saved points
      const reopened = await openCornerEditor(page, overlay, /edit corners/i);
      await expect(reopened.locator('.corner-editor__image')).toHaveAttribute('src', /ref-lib\//);
      const positions = await handlePositions(reopened);
      positions.forEach((p, i) => {
        expect(Math.abs(p.x - quad[i].x)).toBeLessThan(POSITION_TOLERANCE);
        expect(Math.abs(p.y - quad[i].y)).toBeLessThan(POSITION_TOLERANCE);
      });
      await reopened.getByRole('button', { name: /cancel/i }).click();
    });
  }

  test('warns and blocks Apply when a corner angle is outside 50°–135°', async ({ page }) => {
    const name = `align-steep-${Date.now()}.png`;
    await uploadPhoto(page, name, NEAR_RECT);
    await page.reload();
    await gridPage.waitForGridReady();

    const overlay = await placePhotoOnGrid(page, gridPage, name);
    const dialog = await openCornerEditor(page, overlay, /align corners/i);
    await dragHandleTo(page, dialog, 0, { x: 0.47, y: 0.6 });
    await dragHandleTo(page, dialog, 1, { x: 0.53, y: 0.6 });

    await expect(dialog.getByRole('alert')).toContainText(/between 50° and 135°/);
    await expect(dialog.getByRole('button', { name: /^apply$/i })).toBeDisabled();
  });

  test('saves the original photo, corners and warped photo with the layout', async ({ page }) => {
    const name = `align-save-${Date.now()}.png`;
    await uploadPhoto(page, name, TRAPEZOID);
    await page.reload();
    await gridPage.waitForGridReady();

    const overlay = await placePhotoOnGrid(page, gridPage, name);
    const dialog = await openCornerEditor(page, overlay, /align corners/i);
    const warp = await markCornersAndApply(page, dialog, TRAPEZOID);

    await page.locator('.layout-save-btn').click();
    await page.getByPlaceholder('My Layout').fill(`Aligned ${Date.now()}`);
    const saveResponse = page.waitForResponse(r => /\/layouts$/.test(r.url()) && r.request().method() === 'POST');
    await page.locator('.submit-button', { hasText: 'Save' }).click();
    const saved = await saveResponse;
    expect(saved.status()).toBe(201);
    const layoutId = (await saved.json()).data.id as number;

    const detail = await (await page.request.get(`${API_BASE}/layouts/${layoutId}`)).json();
    const placement = detail.data.refImagePlacements[0];
    expect(placement.imageUrl).toMatch(/^ref-lib\//);
    expect(placement.warpedImageUrl).toBe(warp.warpedImageUrl);
    placement.corners.forEach((p: NormPoint, i: number) => {
      expect(Math.abs(p.x - TRAPEZOID[i].x)).toBeLessThan(POSITION_TOLERANCE);
      expect(Math.abs(p.y - TRAPEZOID[i].y)).toBeLessThan(POSITION_TOLERANCE);
    });
    expect(placement.x).toBeLessThan(0);
  });

  test('corner editor is usable at phone size', async ({ page }) => {
    const name = `align-mobile-${Date.now()}.png`;
    await uploadPhoto(page, name, TRAPEZOID);
    await page.reload();
    await gridPage.waitForGridReady();

    const overlay = await placePhotoOnGrid(page, gridPage, name);
    const dialog = await openCornerEditor(page, overlay, /align corners/i);
    await page.setViewportSize({ width: 390, height: 844 });

    // Full-screen, with finger-sized handles and everything reachable
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox!.width).toBeGreaterThanOrEqual(388);
    for (const label of HANDLE_LABELS) {
      const box = await dialog.getByRole('button', { name: `${label} corner` }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(dialog).toContainText('50°');

    await markCornersAndApply(page, dialog, TRAPEZOID);
    await expect(overlay.locator('img')).toHaveAttribute('src', /ref-warp\//);
  });

  test('re-aligning and unaligning delete the replaced warped images', async ({ page }) => {
    const name = `align-cleanup-${Date.now()}.png`;
    await uploadPhoto(page, name, TRAPEZOID);
    await page.reload();
    await gridPage.waitForGridReady();

    const overlay = await placePhotoOnGrid(page, gridPage, name);
    const first = await markCornersAndApply(page, await openCornerEditor(page, overlay, /align corners/i), TRAPEZOID);

    await overlay.click();
    const second = await markCornersAndApply(page, await openCornerEditor(page, overlay, /edit corners/i), NEAR_RECT);
    expect(second.warpedImageUrl).not.toBe(first.warpedImageUrl);
    await expect.poll(async () => (await page.request.get(`${API_BASE}/images/${first.warpedImageUrl}`)).status())
      .toBe(404);

    await overlay.click();
    await overlay.getByRole('button', { name: /remove alignment/i }).click();
    await expect(overlay.locator('img')).toHaveAttribute('src', /ref-lib\//);
    await expect.poll(async () => (await page.request.get(`${API_BASE}/images/${second.warpedImageUrl}`)).status())
      .toBe(404);
  });
});
