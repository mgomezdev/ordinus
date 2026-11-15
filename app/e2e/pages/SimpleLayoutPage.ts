import type { Page } from '@playwright/test';

export class SimpleLayoutPage {
  constructor(readonly page: Page) {}
  get panel() { return this.page.getByRole('region', { name: 'Simple bin library' }); }
  async open() { await this.page.goto('/'); await this.page.getByRole('button', { name: 'Simple', exact: true }).click(); }
  async keyboardRectangle(x: number, y: number, width: number, depth: number) {
    const details = this.panel.locator('details').filter({ has: this.page.getByText('Enter a rectangle with the keyboard', { exact: true }) });
    if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click();
    for (const [label, value] of [['Column', x], ['Row', y], ['Width', width], ['Depth', depth]] as const) await details.getByLabel(label, { exact: true }).fill(String(value));
    await details.getByRole('button', { name: 'Use footprint' }).click();
  }
  async draw(x: number, y: number, width: number, depth: number, reverse = false) {
    await this.panel.getByRole('button', { name: /^(Draw bin|Redraw bin)$/ }).click();
    const surface = this.page.locator('.draw-footprint-surface');
    const box = await surface.boundingBox();
    if (!box) throw new Error('Drawing surface unavailable');
    const grid = this.page.locator('.grid-container');
    const columns = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    const rows = await grid.evaluate(el => getComputedStyle(el).gridTemplateRows.split(' ').length);
    const start = { x: box.x + box.width * x / columns + 1, y: box.y + box.height * y / rows + 1 };
    const end = { x: box.x + box.width * (x + width) / columns - 1, y: box.y + box.height * (y + depth) / rows - 1 };
    await this.page.mouse.move(reverse ? end.x : start.x, reverse ? end.y : start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(reverse ? start.x : end.x, reverse ? start.y : end.y, { steps: 8 });
    await this.page.mouse.up();
  }
}
