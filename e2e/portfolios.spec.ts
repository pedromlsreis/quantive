import 'dotenv/config';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { hasE2EAuth, getTestCreds, signIn } from './helpers/auth';
import { seedClean } from './helpers/seedClean';
import { openNewSourceForm } from './helpers/composer';

/**
 * Extra portfolios for one user (Family plan, phase 1), and the "All
 * portfolios" view over them. The Family plan is granted with the dev
 * override; the server side needs the portfolios migration
 * (20260930120000), so the spec skips until it's applied.
 *
 * Runs as test user 2: specs run in parallel and most sign in as user 1, whose
 * sidebar would otherwise show this spec's portfolio mid-run. User 2's
 * portfolios are deleted before and after.
 *
 * A full page load locks the keys, so the spec moves around with in-app
 * links and unlocks again after its one deliberate reload.
 */

const PORTFOLIO = 'E2E joint';
const SLOT = 2;

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

// Setting a share writes the personal snapshot, creating it if user 2 had none.
async function hasPersonalSnapshot(userId: string): Promise<boolean> {
  const { data, error } = await serviceClient().from('portfolio_snapshots').select('user_id').eq('user_id', userId);
  // A failed check must not read as "none", or the cleanup would delete user 2's snapshot.
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function unlockAfterReload(page: Page) {
  const { password } = getTestCreds(SLOT);
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
  // Wait for the save itself: a reload while it's in flight aborts it.
  const saved = page.waitForResponse((r) => r.url().includes('/rpc/save_portfolio') && r.ok(), { timeout: 10_000 });
  await dialog.getByRole('button', { name: /save entry/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 6000 });
  await saved;
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
  let hadPersonal = true;

  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2EAuth(SLOT), 'E2E auth secrets for test user 2 not set.');
    test.skip(!(await portfoliosTableExists()), 'Portfolios migration not applied.');
    await seedClean(page);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('quantive-test-plan', 'family'));
    await signIn(page, SLOT);
    userId = await userIdFromPage(page);
    await deletePortfolios(userId);
    hadPersonal = await hasPersonalSnapshot(userId);
  });

  test.afterEach(async () => {
    if (!userId) return;
    await deletePortfolios(userId);
    if (!hadPersonal) await serviceClient().from('portfolio_snapshots').delete().eq('user_id', userId);
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

    // The reload locks the keys; after unlocking, the same portfolio reopens with its entry.
    await page.reload();
    await unlockAfterReload(page);
    await expect(switcher(page)).toHaveAccessibleName(`Portfolio: ${PORTFOLIO}. Switch portfolio`, { timeout: 10_000 });
    await expect(page.locator('#performance')).toBeVisible({ timeout: 10_000 });

    // All portfolios counts the portfolio at the share set here. The share is
    // saved encrypted in the personal snapshot, so it survives a reload.
    await switcher(page).click();
    await page.getByRole('menuitemradio', { name: 'All portfolios' }).click();
    await expect(switcher(page)).toHaveAccessibleName('Portfolio: All portfolios. Switch portfolio', { timeout: 10_000 });
    const share = page.getByRole('textbox', { name: `Your share of ${PORTFOLIO}, in percent` });
    await expect(share).toHaveValue('100', { timeout: 10_000 });
    const shareSaved = page.waitForResponse(
      (r) => r.url().includes('/portfolio_snapshots') && r.request().method() === 'POST' && r.ok(),
      { timeout: 10_000 },
    );
    await share.fill('50');
    await share.press('Enter');
    await shareSaved;
    // Half of 4,200. Personal's own entries vary with what user 2 holds, so only this row is checked.
    const counted = page.getByRole('region', { name: 'By portfolio' }).getByRole('row').filter({ hasText: PORTFOLIO });
    await expect(counted).toContainText('2,100');

    await page.reload();
    await unlockAfterReload(page);
    await expect(switcher(page)).toHaveAccessibleName('Portfolio: All portfolios. Switch portfolio', { timeout: 10_000 });
    await expect(share).toHaveValue('50', { timeout: 10_000 });
    await expect(counted).toContainText('2,100');

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
