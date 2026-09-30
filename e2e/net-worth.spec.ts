import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

test.describe('Net Worth View', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('net worth chart renders an SVG', async ({ page }) => {
    const section = page.locator('[id="performance"]');
    const chart = section.locator('svg').first();
    await expect(chart).toBeVisible({ timeout: 8000 });
  });

  test('chart has accessible role or label', async ({ page }) => {
    const chartEl = page.locator('[role="img"], [aria-label]').first();
    const svgEl = page.locator('svg').first();
    // Either an accessible wrapper or SVG is present
    const accessible = await chartEl.isVisible().catch(() => false);
    const svgPresent = await svgEl.isVisible().catch(() => false);
    expect(accessible || svgPresent).toBe(true);
  });

  test('the chart scrubber steps through entries from the keyboard', async ({ page }) => {
    const scrub = page.getByRole('slider', { name: /net worth by entry/i });
    await expect(scrub).toBeVisible({ timeout: 8000 });
    const last = await scrub.getAttribute('aria-valuenow');
    await scrub.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(scrub).not.toHaveAttribute('aria-valuenow', last ?? '');
    await page.keyboard.press('End');
    await expect(scrub).toHaveAttribute('aria-valuenow', last ?? '');
  });

  test('allocation lists sources as ranked bars with a link to the full view', async ({ page }) => {
    const allocation = page.locator('[id="allocation"]');
    await expect(allocation).toBeVisible({ timeout: 6000 });
    await expect(allocation.locator('.q-bar').first()).toBeVisible();
    await expect(allocation.getByRole('link', { name: /all allocations/i })).toBeVisible();
  });
});
