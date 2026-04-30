import { test, expect } from '@playwright/test';
import { GridPage } from '../pages/GridPage';

test.describe('Unit Toggle', () => {
  let gridPage: GridPage;

  test.beforeEach(async ({ page }) => {
    gridPage = new GridPage(page);
    await gridPage.goto();
    await gridPage.waitForGridReady();
  });

  test('defaults to metric (mm)', async ({ page }) => {
    const mmButton = page.locator('.unit-toggle-compact button').first();
    await expect(mmButton).toHaveClass(/active/);
    await expect(mmButton).toHaveText('mm');
  });

  test('can switch to imperial (in)', async ({ page }) => {
    const mmButton = page.locator('.unit-toggle-compact button').first();
    const inButton = page.locator('.unit-toggle-compact button').last();

    // Initially mm should be active
    await expect(mmButton).toHaveClass(/active/);
    await expect(inButton).not.toHaveClass(/active/);

    // Click on imperial button
    await inButton.click();

    // Now imperial should be active
    await expect(inButton).toHaveClass(/active/);
    await expect(mmButton).not.toHaveClass(/active/);
  });

  test('can switch back to metric', async ({ page }) => {
    const mmButton = page.locator('.unit-toggle-compact button').first();
    const inButton = page.locator('.unit-toggle-compact button').last();

    // Switch to imperial
    await inButton.click();
    await expect(inButton).toHaveClass(/active/);

    // Switch back to metric
    await mmButton.click();
    await expect(mmButton).toHaveClass(/active/);
  });

  test('shows format toggle when in imperial mode', async ({ page }) => {
    // Format toggle should not be visible in metric mode
    const formatToggle = page.locator('.format-toggle-compact');
    await expect(formatToggle).not.toBeVisible();

    // Switch to imperial
    const inButton = page.locator('.unit-toggle-compact button').last();
    await inButton.click();

    // Format toggle should now be visible
    await expect(formatToggle).toBeVisible();
  });

  test('can toggle between decimal and fractional format', async ({ page }) => {
    // Switch to imperial first
    const inButton = page.locator('.unit-toggle-compact button').last();
    await inButton.click();

    // Find format buttons
    const decimalButton = page.locator('.format-toggle-compact button').first();
    const fractionalButton = page.locator('.format-toggle-compact button').last();

    // Decimal should be default
    await expect(decimalButton).toHaveClass(/active/);

    // Switch to fractional
    await fractionalButton.click();
    await expect(fractionalButton).toHaveClass(/active/);
    await expect(decimalButton).not.toHaveClass(/active/);
  });

  test('dimension values convert when switching units', async ({ page }) => {
    // Get initial value (should be in mm)
    const widthInput = page.locator('input').first();
    const initialValue = await widthInput.inputValue();

    // Should be 168 (default mm value)
    expect(parseFloat(initialValue)).toBe(168);

    // Switch to imperial
    const inButton = page.locator('.unit-toggle-compact button').last();
    await inButton.click();

    // Value should be converted to inches (~6.614)
    const convertedValue = await widthInput.inputValue();
    const inchValue = parseFloat(convertedValue);

    // 168mm ≈ 6.614 inches
    expect(inchValue).toBeGreaterThan(6);
    expect(inchValue).toBeLessThan(7);
  });
});
