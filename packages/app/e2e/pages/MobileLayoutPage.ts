import type { Page, Locator } from '@playwright/test';

export class MobileLayoutPage {
  readonly page: Page;
  readonly settingsStrip: Locator;
  readonly libraryStrip: Locator;
  readonly settingsToggleBtn: Locator;
  readonly libraryToggleBtn: Locator;
  readonly sidebar: Locator;
  readonly libraryPanel: Locator;
  readonly backdrop: Locator;
  readonly gridContainer: Locator;
  readonly libraryItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.settingsStrip = page.locator('.mobile-panel-strip--left');
    this.libraryStrip = page.locator('.mobile-panel-strip--right');
    this.settingsToggleBtn = page.locator('.mobile-panel-strip--left .mobile-toggle-btn');
    this.libraryToggleBtn = page.locator('.mobile-panel-strip--right .mobile-toggle-btn');
    this.sidebar = page.locator('.sidebar');
    this.libraryPanel = page.locator('.library-panel');
    // Element only exists in the DOM when a panel is open (conditionally rendered)
    this.backdrop = page.locator('.mobile-backdrop--visible');
    this.gridContainer = page.locator('.grid-container');
    this.libraryItems = page.locator('.library-item-card');
  }

  async gotoMobile(): Promise<void> {
    await this.page.goto('/');
    await this.gridContainer.waitFor({ state: 'visible' });
  }

  async isSettingsOpen(): Promise<boolean> {
    return await this.sidebar.evaluate((el) =>
      el.classList.contains('sidebar--open'),
    );
  }

  async isLibraryOpen(): Promise<boolean> {
    return await this.libraryPanel.evaluate((el) =>
      el.classList.contains('library-panel--open'),
    );
  }

  async openSettings(): Promise<void> {
    await this.settingsToggleBtn.click();
  }

  async closeSettings(): Promise<void> {
    // Close via backdrop click
    await this.backdrop.click();
  }

  async openLibrary(): Promise<void> {
    await this.libraryToggleBtn.click();
  }

  async closeLibrary(): Promise<void> {
    // Close via backdrop click
    await this.backdrop.click();
  }

  async openAndWaitForLibraryReady(): Promise<void> {
    await this.openLibrary();
    await this.page.locator('.item-library').waitFor({ state: 'visible' });
    await this.page
      .locator('.library-loading')
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});
    await this.libraryItems.first().waitFor({ state: 'visible', timeout: 10000 });
  }
}
