import type { Page, Locator } from '@playwright/test';

export interface BOMEntry {
  name: string;
  size: string;
  quantity: number;
}

export class BOMPage {
  readonly page: Page;
  readonly bomContainer: Locator;
  readonly bomItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bomContainer = page.locator('.order-bom-table');
    this.bomItems = page.locator('.order-bom-table tbody tr');
  }

  /** Client-side navigate to Order Summary page (preserves React context). */
  async goToBOM(): Promise<void> {
    await this.page.locator('.nav-tab', { hasText: 'Order Summary' }).click();
    // Wait for either the table (has items) or empty state
    const table = this.page.locator('.order-bom-table');
    const empty = this.page.locator('.order-empty');
    await Promise.race([
      table.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
      empty.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
    ]);
  }

  /** Client-side navigate back to Workspace page (preserves React context). */
  async goToWorkspace(): Promise<void> {
    await this.page.locator('.nav-tab', { hasText: 'Workspace' }).click();
  }

  async getItemCount(): Promise<number> {
    const tableVisible = await this.bomContainer.isVisible().catch(() => false);
    if (!tableVisible) return 0;
    return await this.bomItems.count();
  }

  async getBOMEntries(): Promise<BOMEntry[]> {
    const entries: BOMEntry[] = [];
    const count = await this.bomItems.count();

    for (let i = 0; i < count; i++) {
      const row = this.bomItems.nth(i);
      const name = (await row.locator('.order-bom-name').textContent()) ?? '';
      const size = (await row.locator('.order-bom-size').textContent()) ?? '';
      const cells = await row.locator('td').allTextContents();
      const quantity = parseInt((cells[2] ?? '0').trim(), 10);

      entries.push({ name: name.trim(), size: size.trim(), quantity });
    }

    return entries;
  }

  async getEntryByName(name: string): Promise<BOMEntry | null> {
    const entries = await this.getBOMEntries();
    return entries.find((e) => e.name === name) ?? null;
  }

  async getTotalQuantity(): Promise<number> {
    const entries = await this.getBOMEntries();
    return entries.reduce((sum, entry) => sum + entry.quantity, 0);
  }

  async isEmpty(): Promise<boolean> {
    const count = await this.getItemCount();
    return count === 0;
  }

  async hasEntry(name: string): Promise<boolean> {
    const entry = await this.getEntryByName(name);
    return entry !== null;
  }
}
