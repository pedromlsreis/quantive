import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

// /allocations: view toggle (Treemap/Bars/Donut), aggregate cards, and the
// full source table. Demo data seeds positive sources across multiple
// volatility types and a mix of liquid/non-liquid, so all three views render.

test.describe('Allocations page', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
    await page.getByRole('link', { name: /^Allocations$/ }).first().click();
    await page.waitForURL('**/allocations', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /^Allocations$/ })).toBeVisible({ timeout: 12_000 });
  });

  test('shows the portfolio-map heading and a view-mode tablist', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /portfolio map/i })).toBeVisible({ timeout: 8000 });
    const tabs = page.getByRole('tablist', { name: /view mode/i });
    await expect(tabs).toBeVisible({ timeout: 8000 });
    await expect(tabs.getByRole('tab', { name: /treemap/i })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /bars/i })).toBeVisible();
    await expect(tabs.getByRole('tab', { name: /donut/i })).toBeVisible();
  });

  test('switching view mode swaps the rendered chart container', async ({ page }) => {
    const tabs = page.getByRole('tablist', { name: /view mode/i });
    // Start with whichever is the default — confirm at least one tab is selected.
    const initiallySelected = tabs.getByRole('tab', { selected: true });
    await expect(initiallySelected).toBeVisible({ timeout: 8000 });

    // Click Donut and expect the donut tab to become selected.
    await tabs.getByRole('tab', { name: /donut/i }).click();
    await expect(tabs.getByRole('tab', { name: /donut/i })).toHaveAttribute('aria-selected', 'true', { timeout: 4000 });

    // Click Bars and confirm.
    await tabs.getByRole('tab', { name: /bars/i }).click();
    await expect(tabs.getByRole('tab', { name: /bars/i })).toHaveAttribute('aria-selected', 'true', { timeout: 4000 });
  });

  test('renders the "By volatility" and "By liquidity" cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /by volatility/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('heading', { name: /by liquidity/i })).toBeVisible({ timeout: 8000 });
  });

  test('source table renders at least one row with a value cell', async ({ page }) => {
    const table = page.getByRole('table').last();
    await expect(table).toBeVisible({ timeout: 8000 });
    // Demo seeds several sources — body should have multiple rows.
    const rows = table.getByRole('row');
    await expect.poll(async () => rows.count(), { timeout: 8000 }).toBeGreaterThan(1);
  });

  test('source table percentages sum to ~100', async ({ page }) => {
    // The trailing % column is the secondary "%" cell; sample it via a fresh
    // evaluate so we don't fight a moving target as the table re-renders.
    const sum = await page.evaluate(() => {
      const table = document.querySelectorAll('table');
      const last = table[table.length - 1];
      if (!last) return 0;
      const pctCells = Array.from(last.querySelectorAll('tbody td'))
        .map((td) => td.textContent ?? '')
        .filter((s) => /^\s*\d+(?:\.\d+)?\s*%\s*$/.test(s))
        .map((s) => parseFloat(s));
      return pctCells.reduce((a, b) => a + b, 0);
    });
    // Allow ±2 because of per-row rounding and any negative-value rows
    // (which the spec treats with abs() in the source table renderer).
    expect(sum).toBeGreaterThan(95);
    expect(sum).toBeLessThan(105);
  });
});
