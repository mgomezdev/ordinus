import type { Page, Locator } from '@playwright/test';
import { dragAndDropToGrid, getLibraryItemByName } from '../utils/drag-drop';

export class LibraryPage {
  readonly page: Page;
  readonly libraryContainer: Locator;
  readonly libraryItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.libraryContainer = page.locator('.item-library');
    this.libraryItems = page.locator('.library-item-card');
  }

  async waitForLibraryReady(): Promise<void> {
    await this.libraryContainer.waitFor({ state: 'visible' });
    // Wait for loading to complete
    await this.page.locator('.library-loading').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    // Wait for at least one library item to appear
    await this.libraryItems.first().waitFor({ state: 'visible', timeout: 10000 });
  }

  async getItemCount(): Promise<number> {
    return await this.libraryItems.count();
  }

  async getItemByName(name: string): Promise<Locator> {
    return getLibraryItemByName(this.page, name);
  }

  async getItemNames(): Promise<string[]> {
    return await this.libraryItems.locator('.library-item-name').allTextContents();
  }

  async dragItemToGrid(
    itemName: string,
    gridX: number,
    gridY: number
  ): Promise<void> {
    const item = getLibraryItemByName(this.page, itemName);
    await dragAndDropToGrid(this.page, item, gridX, gridY);
  }

  async isItemVisible(name: string): Promise<boolean> {
    const item = getLibraryItemByName(this.page, name);
    return await item.isVisible();
  }

  async filterByCategory(categoryName: string): Promise<void> {
    const categoryFilter = this.page.locator('.category-filter');
    await categoryFilter.selectOption({ label: categoryName });
  }

  async searchItems(query: string): Promise<void> {
    const searchInput = this.page.locator('.library-search input');
    await searchInput.fill(query);
  }

  async clearSearch(): Promise<void> {
    const searchInput = this.page.locator('.library-search input');
    await searchInput.clear();
  }
}
