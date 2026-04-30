import type { Page, Locator } from '@playwright/test';
import { getAllPlacedItems, dragToGridCell } from '../utils/drag-drop';

export class GridPage {
  readonly page: Page;
  readonly gridContainer: Locator;
  readonly gridPreview: Locator;
  readonly drawerContainer: Locator;

  constructor(page: Page) {
    this.page = page;
    this.gridContainer = page.locator('.grid-container');
    this.gridPreview = page.locator('.grid-preview');
    this.drawerContainer = page.locator('.drawer-container');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async waitForGridReady(): Promise<void> {
    await this.gridContainer.waitFor({ state: 'visible' });
  }

  async getGridDimensions(): Promise<{ columns: number; rows: number }> {
    return await this.gridContainer.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        columns: style.gridTemplateColumns.split(' ').length,
        rows: style.gridTemplateRows.split(' ').length,
      };
    });
  }

  async getPlacedItemCount(): Promise<number> {
    return await getAllPlacedItems(this.page).count();
  }

  async getPlacedItems(): Promise<Locator> {
    return getAllPlacedItems(this.page);
  }

  async clickPlacedItem(index: number): Promise<void> {
    await getAllPlacedItems(this.page).nth(index).click();
  }

  async getSelectedItem(): Promise<Locator | null> {
    const selected = this.page.locator('.placed-item.selected');
    if (await selected.count() > 0) {
      return selected;
    }
    return null;
  }

  async isItemSelected(index: number): Promise<boolean> {
    const item = getAllPlacedItems(this.page).nth(index);
    return await item.evaluate((el) => el.classList.contains('selected'));
  }

  async hasInvalidItems(): Promise<boolean> {
    const invalidItems = this.page.locator('.placed-item.invalid');
    return (await invalidItems.count()) > 0;
  }

  async getInvalidItemCount(): Promise<number> {
    return await this.page.locator('.placed-item.invalid').count();
  }

  async clickEmptyGridArea(): Promise<void> {
    // Click on the last grid cell (bottom-right) which should be empty
    // This reliably triggers the grid container's onClick handler for deselection
    const lastCell = this.page.locator('.grid-cell').last();
    await lastCell.click();
  }

  async setDimensions(width: number, depth: number): Promise<void> {
    const widthInput = this.page.locator('input').first();
    const depthInput = this.page.locator('input').nth(1);

    await widthInput.fill(String(width));
    await depthInput.fill(String(depth));
  }

  async placeFirstLibraryItem(): Promise<void> {
    const libraryContainer = this.page.locator('.item-library');
    await libraryContainer.waitFor({ state: 'visible' });
    await this.page.locator('.library-loading').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    const firstItem = this.page.locator('.library-item-card').first();
    await firstItem.waitFor({ state: 'visible', timeout: 10000 });
    await dragToGridCell(this.page, firstItem, this.gridContainer, 0, 0, 4, 4);
  }
}
