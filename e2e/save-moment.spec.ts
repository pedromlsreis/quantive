import { test, expect, type Page } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

// S41: after saving the latest entry on the overview, the changed characters
// of the net worth figure swap in once and one status line announces it.
// navigator.webdriver is reported only while the document parses (so a
// reused dev server's auto-login still skips this browser) and motion is on.
async function asRealBrowser(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => document.readyState === 'loading' });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

async function saveFirstEntry(page: Page) {
  await page.getByRole('button', { name: /add your first entry/i }).click();
  const dialog = page.getByRole('dialog', { name: /add entry/i });
  const form = dialog.locator('.q-new-src-form');
  await form.getByLabel('Name', { exact: true }).fill('Cash');
  await form.locator('input[inputmode="decimal"]').fill('1000');
  // Save takes the filled new-source form without pressing "Add source".
  await dialog.getByRole('button', { name: /save entry/i }).click();
  await expect(dialog).toBeHidden();
}

async function saveCashAs(page: Page, value: string) {
  await page.evaluate(() => window.dispatchEvent(new Event('quantive:add-measurement')));
  const dialog = page.getByRole('dialog', { name: /add entry/i });
  await dialog.getByLabel('Value for Cash').fill(value);
  await dialog.getByRole('button', { name: /save entry/i }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Saving the latest entry on the overview', () => {
  test.beforeEach(async ({ page }) => {
    await asRealBrowser(page);
    await seedClean(page);
    await page.goto('/dashboard');
    await saveFirstEntry(page);
    await expect(page.locator('.q-fig--hero')).toContainText('1,000');
  });

  test('a changed total swaps its changed characters once and is announced', async ({ page }) => {
    await saveCashAs(page, '1500');
    const hero = page.locator('.q-fig--hero');
    await expect(hero).toContainText('1,500');
    await expect(hero.locator('.q-roll-ch.is-new').first()).toBeAttached();
    await expect(page.getByRole('status').filter({ hasText: /^Saved\. Net worth €1,500/ })).toBeAttached();
    // The swap ends on its own; the figure stays, the marks go.
    await expect(hero.locator('.q-roll-ch.is-new')).toHaveCount(0, { timeout: 3000 });
  });

  test('an unchanged save is announced without a swap', async ({ page }) => {
    await saveCashAs(page, '1000');
    await expect(page.getByRole('status').filter({ hasText: /^Saved\. Net worth €1,000/ })).toBeAttached();
    await expect(page.locator('.q-fig--hero .q-roll-ch.is-new')).toHaveCount(0);
  });
});
