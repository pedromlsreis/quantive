import { test, expect } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';

// /sources extras not covered by measurement-history.spec.ts:
//   - Search input filters the table and reflects in ?q=
//   - Edit volatility via the dropdown action and commit by blur
//   - Toggle liquidity from the dropdown — badge flips
//
// All interactions go through in-app links to keep the in-memory demo state.

test.describe('Sources page — search, edit, liquidity', () => {
  test.beforeEach(async ({ page }) => {
    await loadDemo(page);
    await page.getByRole('link', { name: /^Sources$/ }).first().click();
    await page.waitForURL('**/sources', { timeout: 10_000 });
    await expect(page.getByRole('table')).toBeVisible({ timeout: 12_000 });
  });

  test('typing in the search input filters the rows and updates ?q=', async ({ page }) => {
    const search = page.getByRole('textbox', { name: /search sources/i });
    await expect(search).toBeVisible({ timeout: 8000 });

    // Pick the first source's name so we have a guaranteed match.
    const firstName = await page
      .getByRole('button', { name: /^Actions for /i })
      .first()
      .getAttribute('aria-label');
    expect(firstName).toBeTruthy();
    const target = firstName!.replace(/^Actions for /i, '').trim();
    expect(target.length).toBeGreaterThan(0);

    // Match only on a unique prefix of the name to keep the search robust.
    const prefix = target.slice(0, Math.min(target.length, 4));
    await search.fill(prefix);

    await expect.poll(async () => {
      const url = new URL(page.url());
      return url.searchParams.get('q');
    }, { timeout: 6000 }).toBe(prefix);

    // The matching row stays.
    await expect(page.getByText(target, { exact: false }).first()).toBeVisible({ timeout: 4000 });

    // Type a sentinel string that no demo source contains.
    await search.fill('zzzz-not-a-source');
    await expect(page.getByText(/no sources match/i)).toBeVisible({ timeout: 4000 });

    // Clearing the input strips ?q= back off the URL.
    await search.fill('');
    await expect.poll(async () => {
      const url = new URL(page.url());
      return url.searchParams.get('q');
    }, { timeout: 6000 }).toBeNull();
  });

  test('edit-volatility from dropdown commits on blur', async ({ page }) => {
    const firstActions = page.getByRole('button', { name: /^Actions for /i }).first();
    const actionsLabel = await firstActions.getAttribute('aria-label') ?? '';
    const sourceName = actionsLabel.replace(/^Actions for /i, '').trim();

    await firstActions.click();
    await page.getByRole('menuitem', { name: /edit volatility/i }).click();

    const input = page.getByRole('textbox', { name: new RegExp(`Volatility for ${sourceName}`, 'i') });
    await expect(input).toBeVisible({ timeout: 4000 });
    await input.fill('Volatile');
    // Commit by blur (per onBlur handler in SourcesPage).
    await page.locator('body').click();

    // After commit the badge reflects the new volatility.
    const row = page.locator('tr').filter({ hasText: sourceName }).first();
    await expect(row.getByText(/^Volatile$/i)).toBeVisible({ timeout: 6000 });
  });

  test('hide-stopped filter is on by default and hides newly stopped sources', async ({ page }) => {
    // Demo data ships with no stopped sources, so the toggle isn't rendered yet.
    const toggle = page.getByRole('switch', { name: /hide stopped sources/i });
    await expect(toggle).toHaveCount(0);

    // Stop the first source via the row actions dropdown.
    const firstActions = page.getByRole('button', { name: /^Actions for /i }).first();
    const actionsLabel = await firstActions.getAttribute('aria-label') ?? '';
    const sourceName = actionsLabel.replace(/^Actions for /i, '').trim();

    await firstActions.click();
    await page.getByRole('menuitem', { name: /stop measurements/i }).click();

    // Now the toggle appears, on by default, and the row is hidden from the table.
    await expect(toggle).toBeVisible({ timeout: 4000 });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('tr').filter({ hasText: sourceName })).toHaveCount(0, { timeout: 4000 });
    await expect(page.getByText(/1 stopped hidden/i)).toBeVisible();

    // Toggling off reveals the stopped row with its badge.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    const row = page.locator('tr').filter({ hasText: sourceName }).first();
    await expect(row).toBeVisible({ timeout: 4000 });
    await expect(row.getByText(/^Stopped$/)).toBeVisible();

    // Toggling back on hides it again.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('tr').filter({ hasText: sourceName })).toHaveCount(0, { timeout: 4000 });
  });

  test('toggling liquidity from the dropdown swaps the row label', async ({ page }) => {
    const firstActions = page.getByRole('button', { name: /^Actions for /i }).first();
    const actionsLabel = await firstActions.getAttribute('aria-label') ?? '';
    const sourceName = actionsLabel.replace(/^Actions for /i, '').trim();

    // Read the current label from the row's secondary line.
    const row = page.locator('tr').filter({ hasText: sourceName }).first();
    const wasLiquid = (await row.textContent())?.toLowerCase().includes('non-liquid') === false;

    await firstActions.click();
    const menuLabel = wasLiquid ? /mark as non-liquid/i : /mark as liquid/i;
    await page.getByRole('menuitem', { name: menuLabel }).click();

    // The row should now reflect the opposite state. Wait for the text swap.
    const expectedAfter = wasLiquid ? /non-liquid/i : /(^|\W)liquid(?!-)/i;
    await expect(row).toContainText(expectedAfter, { timeout: 6000 });
  });
});
