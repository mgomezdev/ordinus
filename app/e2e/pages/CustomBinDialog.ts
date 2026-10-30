import type { Page, Locator } from '@playwright/test';

export class CustomBinDialog {
  readonly page: Page;
  readonly openButton: Locator;
  readonly dialog: Locator;
  readonly addButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.openButton = page.getByRole('button', { name: /custom bin/i });
    this.dialog = page.getByRole('dialog', { name: 'Custom bin' });
    this.addButton = this.dialog.getByRole('button', { name: 'Add to layout' });
  }

  async open(): Promise<void> {
    await this.openButton.click();
    await this.dialog.waitFor({ state: 'visible' });
  }

  async setSize(width: number, depth: number, height: number): Promise<void> {
    await this.fillSize('Width', width);
    await this.fillSize('Depth', depth);
    await this.fillSize('Height', height);
  }

  private async fillSize(label: string, value: number): Promise<void> {
    const input = this.dialog.getByLabel(`${label} in units`);
    await input.fill(String(value));
    await input.blur();
  }

  param(name: string): Locator {
    return this.dialog.getByTestId(`param-${name}`);
  }

  async openGroup(group: string): Promise<void> {
    const details = this.dialog.locator('details', { has: this.page.locator('summary', { hasText: group }) });
    if (!(await details.evaluate(el => (el as HTMLDetailsElement).open))) {
      await details.locator('summary').click();
    }
  }

  async overrideNumber(group: string, name: string, label: string, value: number): Promise<void> {
    await this.openGroup(group);
    const field = this.param(name);
    await field.getByRole('button', { name: `Override ${label}` }).click();
    await field.getByRole('spinbutton').fill(String(value));
  }

  /** Clicks "Add to layout" and returns the request body sent to /generation/custom. */
  async add(): Promise<Record<string, unknown>> {
    const request = this.page.waitForRequest(r => r.url().endsWith('/generation/custom') && r.method() === 'POST');
    await this.addButton.click();
    return (await request).postDataJSON() as Record<string, unknown>;
  }
}
