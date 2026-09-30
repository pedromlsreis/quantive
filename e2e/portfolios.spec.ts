import 'dotenv/config';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { hasE2EAuth, getTestCreds, signIn } from './helpers/auth';
import { seedClean } from './helpers/seedClean';
import { openNewSourceForm } from './helpers/composer';

/**
 * Extra portfolios for one user (Family plan, phase 1). The Family plan is
 * granted with the dev override; the server side needs the portfolios
 * migration (20260930120000), so the spec skips until it's applied.
 * Test user 1's portfolios are deleted before and after.
 *
 * A full page load locks the keys, so the spec moves around with in-app
 * links and unlocks again after its one deliberate reload.
 */

const PORTFOLIO = 'E2E joint';

function serviceClient() {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

// A plain select: a HEAD request to a missing table comes back 204 with no error.
async function portfoliosTableExists(): Promise<boolean> {
  const { error } = await serviceClient().from('portfolios').select('id').limit(1);
  return !error;
}

async function userIdFromPage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    return JSON.parse(localStorage.getItem(key!)!).user.id as string;
  });
}

async function deletePortfolios(userId: string) {
  await serviceClient().from('portfolios').delete().eq('owner_id', userId);
}

async function unlockAfterReload(page: Page) {
  const { password } = getTestCreds(1);
  const unlock = page.getByRole('dialog', { name: /unlock your data/i });
  await unlock.waitFor({ state: 'visible', timeout: 15_000 });
  await unlock.getByLabel('Password', { exact: true }).fill(password);
  await unlock.getByRole('button', { name: /^unlock$/i }).click();
  await unlock.waitFor({ state: 'detached', timeout: 15_000 });
}

async function addEntry(page: Page, name: string, value: string) {
  await page.getByRole('button', { name: /add your first entry/i }).click();
  const dialog: Locator = page.getByRole('dialog', { name: /add entry/i });
  await expect(dialog).toBeVisible({ timeout: 6000 });
  await openNewSourceForm(dialog);
  const form = dialog.locator('.q-new-src-form');
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.locator('input[inputmode="decimal"]').fill(value);
  await form.getByRole('button', { name: /^add source$/i }).click();
  await dialog.getByRole('button', { name: /save entry/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 6000 });
}

const sidebar = (page: Page) => page.locator('.q-sidebar');
const switcher = (page: Page) => sidebar(page).getByRole('button', { name: /^portfolio:/i });

async function openManagePortfolios(page: Page) {
  await switcher(page).click();
  await page.getByRole('menuitem', { name: 'Manage portfolios' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolios', level: 2 })).toBeVisible({ timeout: 10_000 });
}

test.describe('Extra portfolios', () => {
  let userId: string | null = null;

  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2EAuth(1), 'E2E auth secrets not set.');
    test.skip(!(await portfoliosTableExists()), 'Portfolios migration not applied.');
    await seedClean(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('quantive-test-plan', 'family'));
    await signIn(page);
    userId = await userIdFromPage(page);
    await deletePortfolios(userId);
  });

  test.afterEach(async () => {
    if (userId) await deletePortfolios(userId);
  });

  test('create, fill, reopen after reload, switch back and delete', async ({ page }) => {
    await openManagePortfolios(page);
    await page.getByLabel('New portfolio').fill(PORTFOLIO);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(switcher(page)).toHaveAccessibleName(`Portfolio: ${PORTFOLIO}. Switch portfolio`, { timeout: 10_000 });

    // A new portfolio opens empty, without the demo shortcut.
    await sidebar(page).getByRole('link', { name: 'Overview' }).click();
    await expect(page.getByRole('button', { name: /add your first entry/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /try demo/i })).toHaveCount(0);

    await addEntry(page, 'Joint savings', '4200');
    await expect(page.locator('#performance')).toBeVisible({ timeout: 8000 });
    // Let save_portfolio finish before the reload drops the tab.
    await page.waitForLoadState('networkidle');

    // The reload locks the keys; after unlocking, the same portfolio reopens with its entry.
    await page.reload();
    await unlockAfterReload(page);
    await expect(switcher(page)).toHaveAccessibleName(`Portfolio: ${PORTFOLIO}. Switch portfolio`, { timeout: 10_000 });
    await expect(page.locator('#performance')).toBeVisible({ timeout: 10_000 });

    // Back to Personal through the switcher.
    await switcher(page).click();
    await page.getByRole('menuitemradio', { name: 'Personal' }).click();
    await expect(switcher(page)).toHaveAccessibleName('Portfolio: Personal. Switch portfolio', { timeout: 10_000 });

    // Delete from Settings.
    await openManagePortfolios(page);
    await page.getByRole('button', { name: `Delete ${PORTFOLIO}` }).click();
    await page.getByRole('button', { name: 'Delete portfolio' }).click();
    await expect(page.getByRole('button', { name: `Delete ${PORTFOLIO}` })).toHaveCount(0, { timeout: 10_000 });
  });
});
