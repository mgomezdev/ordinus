import type { Page, Locator } from '@playwright/test';

export class SavedConfigsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get cards(): Locator {
    // Exclude the "New Configuration" card (.new-config is on the element itself)
    return this.page.locator('.saved-config-card:not(.new-config)');
  }

  get emptyState(): Locator {
    return this.page.locator('.saved-configs-empty');
  }

  get errorBanner(): Locator {
    return this.page.locator('.saved-configs-error');
  }

  card(name: string): Locator {
    return this.page.locator('.saved-config-card', { hasText: name });
  }

  editButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Edit' });
  }

  deleteButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Delete' });
  }

  confirmDeleteButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Confirm' });
  }

  submitButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Submit' });
  }

  withdrawButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Withdraw' });
  }

  duplicateButton(name: string): Locator {
    return this.card(name).getByRole('button', { name: 'Duplicate' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/configs');
  }

  async waitForLoaded(): Promise<void> {
    await this.page
      .locator('.saved-configs-grid, .saved-configs-empty')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 });
  }
}
