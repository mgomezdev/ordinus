import type { Page, Locator } from '@playwright/test';

/**
 * Performs drag and drop using pointer events (mouse movements).
 * This simulates the full drag-and-drop flow using the Pointer Events API
 * that the application now uses instead of HTML5 Drag and Drop.
 */
export async function pointerDragDrop(
  page: Page,
  source: Locator,
  target: Locator,
  targetPosition?: { x: number; y: number }
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Could not get bounding box for drag operation');
  }

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;

  let dropX: number, dropY: number;
  if (targetPosition) {
    dropX = targetBox.x + targetPosition.x;
    dropY = targetBox.y + targetPosition.y;
  } else {
    dropX = targetBox.x + targetBox.width / 2;
    dropY = targetBox.y + targetBox.height / 2;
  }

  // Use mouse methods which generate pointer events in the browser
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();

  // Move in steps to exceed the 5px drag threshold
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const x = sourceX + (dropX - sourceX) * (i / steps);
    const y = sourceY + (dropY - sourceY) * (i / steps);
    await page.mouse.move(x, y);
  }

  await page.mouse.up();

  // Wait for React state to update
  await page.waitForTimeout(150);
}

/**
 * Drags an element to a specific grid cell position
 */
export async function dragToGridCell(
  page: Page,
  source: Locator,
  gridContainer: Locator,
  cellX: number,
  cellY: number,
  gridWidth: number,
  gridHeight: number
): Promise<void> {
  const gridBox = await gridContainer.boundingBox();

  if (!gridBox) {
    throw new Error('Could not get bounding box for grid container');
  }

  const cellWidth = gridBox.width / gridWidth;
  const cellHeight = gridBox.height / gridHeight;

  // Calculate target position within the target element
  const targetX = (cellX + 0.5) * cellWidth;
  const targetY = (cellY + 0.5) * cellHeight;

  await pointerDragDrop(page, source, gridContainer, { x: targetX, y: targetY });
}

/**
 * Gets the grid container element
 */
export function getGridContainer(page: Page): Locator {
  return page.locator('.grid-container');
}

/**
 * Gets a library item card by name
 */
export function getLibraryItemByName(page: Page, name: string): Locator {
  return page.locator('.library-item-card').filter({ hasText: name });
}

/**
 * Gets a placed item overlay by its position
 */
export function getPlacedItemAt(page: Page, x: number, y: number): Locator {
  return page.locator('.placed-item').filter({
    has: page.locator(`[data-x="${x}"][data-y="${y}"]`)
  });
}

/**
 * Gets all placed items on the grid
 */
export function getAllPlacedItems(page: Page): Locator {
  return page.locator('.placed-item');
}

/**
 * Performs a drag and drop to a specific grid cell using pointer events
 */
export async function dragAndDropToGrid(
  page: Page,
  source: Locator,
  targetX: number,
  targetY: number
): Promise<void> {
  const gridContainer = getGridContainer(page);
  const gridBox = await gridContainer.boundingBox();

  if (!gridBox) {
    throw new Error('Could not get grid container bounding box');
  }

  // Get grid dimensions from the DOM
  const gridStyle = await gridContainer.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      columns: style.gridTemplateColumns.split(' ').length,
      rows: style.gridTemplateRows.split(' ').length,
    };
  });

  const cellWidth = gridBox.width / gridStyle.columns;
  const cellHeight = gridBox.height / gridStyle.rows;

  await pointerDragDrop(page, source, gridContainer, {
    x: (targetX + 0.5) * cellWidth,
    y: (targetY + 0.5) * cellHeight,
  });
}
