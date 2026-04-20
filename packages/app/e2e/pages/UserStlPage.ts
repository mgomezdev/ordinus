import type { Page } from '@playwright/test';

export class UserStlPage {
  constructor(private readonly page: Page) {}

  get uploadButton() { return this.page.getByRole('button', { name: /upload model/i }); }
  get fileInput() { return this.page.locator('input[type="file"][accept*=".stl"]'); }
  get nameInput() { return this.page.getByLabel(/name/i); }
  get submitButton() { return this.page.getByRole('button', { name: /^upload$/i }); }
  get errorAlert() { return this.page.getByRole('alert'); }

  async openUploadModal() { await this.uploadButton.click(); }

  async uploadFile(filePath: string, name: string) {
    await this.fileInput.setInputFiles(filePath);
    await this.nameInput.clear();
    await this.nameInput.fill(name);
    await this.submitButton.click();
  }

  itemByName(name: string) { return this.page.getByText(name); }
  processingBadge() { return this.page.getByLabel('Processing'); }
}
