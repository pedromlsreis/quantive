import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

// Dashboard chrome behaviours that aren't covered by dashboard.spec.ts:
//   - Topbar privacy toggle obfuscates monetary values (CSS blur on <html>.privacy-mode)
//   - Global search opens via the `/` shortcut and lists nav pages
//   - Section anchors line up with the sidebar shortcut targets

test.describe('Topbar privacy mode', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('toggling privacy adds/removes the .privacy-mode class on <html>', async ({ page }) => {
    const btn = page.getByRole('button', { name: /hide monetary values|show monetary values/i });
    await expect(btn).toBeVisible({ timeout: 8000 });

    // Initial state — pressed=false, no .privacy-mode class on <html>.
    await expect(btn).toHaveAttribute('aria-pressed', 'false', { timeout: 4000 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('privacy-mode')),
      { timeout: 6000 },
    ).toBe(false);

    // Toggle on — pressed=true, class added.
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('privacy-mode')),
      { timeout: 6000 },
    ).toBe(true);

    // Toggle off — class removed.
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false', { timeout: 4000 });
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('privacy-mode')),
      { timeout: 6000 },
    ).toBe(false);
  });

  test('blurred values become visually-blurred via CSS filter', async ({ page }) => {
    const btn = page.getByRole('button', { name: /hide monetary values|show monetary values/i });
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true', { timeout: 4000 });

    // .privacy-mode .q-metric-value applies filter: blur(8px). Pick any
    // .q-metric-value rendered on the dashboard and read its computed style.
    const filterValue = await page.locator('.q-metric-value').first().evaluate((el) => {
      return window.getComputedStyle(el).filter;
    });
    expect(filterValue).toMatch(/blur\(/);

    // The coverage audit propagated the `.num` class to every other money
    // figure (deltas, table cells, chart readouts, goal targets). Confirm a
    // representative `.num` element also blurs under the same toggle.
    const numFilter = await page.locator('.num').first().evaluate((el) => {
      return window.getComputedStyle(el).filter;
    });
    expect(numFilter).toMatch(/blur\(/);
  });

  test('auto-blur on focus loss hides values when the window blurs and reveals on return', async ({ page }) => {
    // Hydrate the opt-in preference before the app boots so PreferencesProvider
    // attaches the focus listeners on mount.
    await page.addInitScript(() => localStorage.setItem('pref-privacy-auto-blur', 'true'));
    await loadDemo(page);

    // Focused + visible → values shown.
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('privacy-mode')),
      { timeout: 6000 },
    ).toBe(false);

    // Window loses focus (alt-tab / screen-share picker) → values blur.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('privacy-mode')),
      { timeout: 6000 },
    ).toBe(true);

    // Focus returns → values reveal again (no persistent toggle set).
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('privacy-mode')),
      { timeout: 6000 },
    ).toBe(false);
  });

  test('privacy toggle stays reachable in the top bar on a small phone', async ({ page }) => {
    // A quick blur switch matters most on mobile; it must not be hidden there.
    await page.setViewportSize({ width: 375, height: 812 });
    await loadDemo(page);

    const btn = page.getByRole('button', { name: /hide monetary values|show monetary values/i });
    await expect(btn).toBeVisible({ timeout: 8000 });
    await btn.click();
    await expect.poll(
      () => page.evaluate(() => document.documentElement.classList.contains('privacy-mode')),
      { timeout: 6000 },
    ).toBe(true);
  });
});

test.describe('Global search palette', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
  });

  test('opens with the `/` shortcut and lists navigable pages', async ({ page }) => {
    // Make sure focus isn't already inside an input — bring it to <body>.
    await page.locator('body').click();
    await page.keyboard.press('/');
    const combobox = page.getByRole('combobox', { name: /quick search/i });
    await expect(combobox).toBeFocused({ timeout: 4000 });
    await expect(combobox).toHaveAttribute('aria-expanded', 'true');

    // Page entries land in the "Pages" group with the hint "Page".
    // Match by option role+name (label + hint together) to avoid strict-mode
    // collisions with volatility-type hints that mention "open allocations".
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 4000 });
    await expect(listbox.getByRole('option', { name: /Overview\s+Page/i })).toBeVisible();
    await expect(listbox.getByRole('option', { name: /Allocations\s+Page/i })).toBeVisible();
    await expect(listbox.getByRole('option', { name: /Sources\s+Page/i })).toBeVisible();
  });

  test('typing a keyword narrows results, Escape closes the palette', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('/');
    const combobox = page.getByRole('combobox', { name: /quick search/i });
    await combobox.fill('forecast');

    const listbox = page.getByRole('listbox');
    await expect(listbox.getByRole('option', { name: /Forecast\s+Page/i })).toBeVisible({ timeout: 4000 });
    // Allocations Page should NOT match the query "forecast" — but we look for
    // the page entry specifically so volatility-type hints don't interfere.
    await expect(listbox.getByRole('option', { name: /Allocations\s+Page/i })).toHaveCount(0);

    // Escape closes the listbox.
    await combobox.press('Escape');
    await expect(combobox).toHaveAttribute('aria-expanded', 'false', { timeout: 4000 });
  });

  test('Enter on a page result navigates to that page', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('/');
    const combobox = page.getByRole('combobox', { name: /quick search/i });
    await combobox.fill('allocations');
    // First match is highlighted by default — pressing Enter activates it.
    await combobox.press('Enter');
    await page.waitForURL('**/allocations', { timeout: 10_000 });
  });
});
