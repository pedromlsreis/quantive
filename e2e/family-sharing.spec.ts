import 'dotenv/config';
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { getTestCreds, hasE2EAuth, signIn } from './helpers/auth';
import { seedClean } from './helpers/seedClean';
import { openNewSourceForm } from './helpers/composer';
import { OWNER_SLOT, PARTNER_SLOT, grantOwnerFamily, resetFamily, sharingTablesExist, testUser } from './helpers/family';

/**
 * Sharing a portfolio end to end, in two browsers: the owner (test user 2)
 * shares, the partner (test user 1) joins through the link, both edit at
 * once and the later save is replayed, then the owner removes the partner.
 * Runs after the other specs (project "family-ui" in playwright.config.ts).
 * On its own: `npx playwright test e2e/family-sharing.spec.ts --no-deps` (without
 * --no-deps, Playwright runs the whole chromium project first).
 *
 * A full page load locks the keys, so each side moves around with in-app
 * links, and unlocks again after every deliberate navigation.
 */

test.describe.configure({ mode: 'serial' });

const PORTFOLIO = 'E2E shared';

async function unlock(page: Page, slot: 1 | 2) {
  const dialog = page.getByRole('dialog', { name: /unlock your data/i });
  await dialog.waitFor({ state: 'visible', timeout: 15_000 });
  await dialog.getByLabel('Password', { exact: true }).fill(getTestCreds(slot).password);
  await dialog.getByRole('button', { name: /^unlock$/i }).click();
  await dialog.waitFor({ state: 'detached', timeout: 15_000 });
}

async function openSession(browser: Browser, slot: 1 | 2, plan: 'family' | 'pro'): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await seedClean(page, { plan: plan === 'family' ? undefined : plan });
  await page.goto('/');
  if (plan === 'family') await page.evaluate(() => localStorage.setItem('quantive-test-plan', 'family'));
  await signIn(page, slot);
  return page;
}

const sidebar = (page: Page) => page.locator('.q-sidebar');
const switcher = (page: Page) => sidebar(page).getByRole('button', { name: /^portfolio:/i });

async function openSettings(page: Page) {
  await sidebar(page).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Portfolios', level: 2 })).toBeVisible({ timeout: 10_000 });
}

/** Resolves on the next save_portfolio that the server accepted, after any conflicts. */
function nextSavedWrite(page: Page) {
  return page.waitForResponse(async (r) => {
    if (!r.url().includes('/rpc/save_portfolio') || !r.ok()) return false;
    const body = (await r.json().catch(() => null)) as Array<{ status: string }> | null;
    return body?.[0]?.status === 'ok';
  }, { timeout: 15_000 });
}

async function addFirstEntry(page: Page, name: string, value: string) {
  await page.getByRole('button', { name: /add your first entry/i }).click();
  const dialog: Locator = page.getByRole('dialog', { name: /add entry/i });
  await expect(dialog).toBeVisible({ timeout: 6000 });
  await openNewSourceForm(dialog);
  const form = dialog.locator('.q-new-src-form');
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.locator('input[inputmode="decimal"]').fill(value);
  await form.getByRole('button', { name: /^add source$/i }).click();
  const saved = nextSavedWrite(page);
  await dialog.getByRole('button', { name: /save entry/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 6000 });
  await saved;
}

async function addGoal(page: Page, name: string, amount: string) {
  await page.getByRole('button', { name: /add (your first )?goal/i }).first().click();
  const dialog = page.getByRole('dialog', { name: /add a goal/i });
  await dialog.getByLabel('Goal name').fill(name);
  await dialog.getByLabel('Target amount').fill(amount);
  await dialog.getByLabel('Target date').fill('2031-12-31');
  const saved = nextSavedWrite(page);
  await dialog.getByRole('button', { name: /^add goal$/i }).click();
  await saved;
}

test.describe('Sharing a portfolio', () => {
  let owner: Page;
  let partner: Page;
  let link = '';

  test.beforeAll(async ({ browser }) => {
    test.skip(!hasE2EAuth(OWNER_SLOT) || !hasE2EAuth(PARTNER_SLOT), 'E2E auth secrets for both test users not set.');
    test.skip(!(await sharingTablesExist()), 'Sharing migration not applied.');
    await resetFamily();
    await grantOwnerFamily();
    owner = await openSession(browser, OWNER_SLOT, 'family');
    partner = await openSession(browser, PARTNER_SLOT, 'pro');
  });

  test.afterAll(async () => {
    await owner?.context().close();
    await partner?.context().close();
    if (hasE2EAuth(OWNER_SLOT) && hasE2EAuth(PARTNER_SLOT) && (await sharingTablesExist())) await resetFamily();
  });

  test('the owner creates a portfolio, fills it and creates an invite link', async () => {
    await openSettings(owner);
    await owner.getByLabel('New portfolio').fill(PORTFOLIO);
    await owner.getByRole('button', { name: 'Create' }).click();
    await expect(switcher(owner)).toHaveAccessibleName(`Portfolio: ${PORTFOLIO}. Switch portfolio`, { timeout: 10_000 });

    await sidebar(owner).getByRole('link', { name: 'Overview' }).click();
    await addFirstEntry(owner, 'Joint savings', '4200');

    await openSettings(owner);
    await owner.getByRole('button', { name: `Share ${PORTFOLIO}` }).click();
    await owner.getByLabel(`Share ${PORTFOLIO}`).fill(testUser(PARTNER_SLOT).email);
    await owner.getByRole('button', { name: 'Create invite link' }).click();
    const field = owner.getByLabel(`Invite link for ${testUser(PARTNER_SLOT).email}`);
    await expect(field).toHaveValue(/\/join\/[0-9a-f-]{36}#k=[A-Za-z0-9_-]{43}$/, { timeout: 10_000 });
    link = await field.inputValue();
    await owner.getByRole('button', { name: 'Done' }).click();
    await expect(owner.getByText(`Invite sent to ${testUser(PARTNER_SLOT).email}.`, { exact: false })).toBeVisible();
  });

  test('the partner opens the link, unlocks and joins; the secret leaves the address bar', async () => {
    await partner.goto(link);
    await unlock(partner, PARTNER_SLOT);
    expect(partner.url()).not.toContain('#k=');
    await expect(partner.getByRole('heading', { name: 'Join a shared portfolio' })).toBeVisible({ timeout: 10_000 });
    await expect(partner.getByText(`${testUser(OWNER_SLOT).email} invited you`, { exact: false })).toBeVisible();
    await partner.getByRole('button', { name: 'Join portfolio' }).click();

    await expect(switcher(partner)).toHaveAccessibleName(`Portfolio: ${PORTFOLIO}. Switch portfolio`, { timeout: 15_000 });
    await expect(partner.locator('#performance')).toBeVisible({ timeout: 10_000 });
  });

  test('both edit at once; the later save is replayed on top of the earlier one', async () => {
    // Neither tab has seen the other's change: the owner's save conflicts,
    // is replayed on the partner's version and written again.
    await sidebar(owner).getByRole('link', { name: 'Goals' }).click();
    await sidebar(partner).getByRole('link', { name: 'Goals' }).click();

    await addGoal(partner, 'Holiday fund', '3000');
    await addGoal(owner, 'Emergency fund', '10000');

    await expect(owner.getByRole('progressbar', { name: /Holiday fund/i })).toBeVisible({ timeout: 10_000 });
    await expect(owner.getByRole('progressbar', { name: /Emergency fund/i })).toBeVisible();

    // The partner's tab picks up the owner's save when it regains focus.
    await partner.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(partner.getByRole('progressbar', { name: /Emergency fund/i })).toBeVisible({ timeout: 10_000 });
    await expect(partner.getByRole('progressbar', { name: /Holiday fund/i })).toBeVisible();
  });

  test('the owner removes the partner; the key is rotated and the partner loses access', async () => {
    await openSettings(owner);
    await expect(owner.getByText(`Shared with ${testUser(PARTNER_SLOT).email}.`)).toBeVisible({ timeout: 10_000 });
    const rotated = owner.waitForResponse((r) => r.url().includes('/rpc/rotate_portfolio_key') && r.ok(), { timeout: 15_000 });
    await owner.getByRole('button', { name: `Remove ${testUser(PARTNER_SLOT).email} from ${PORTFOLIO}` }).click();
    await owner.getByRole('button', { name: 'Remove partner' }).click();
    const body = (await (await rotated).json()) as Array<{ status: string; current_epoch: number }>;
    expect(body[0]).toMatchObject({ status: 'ok', current_epoch: 2 });
    await expect(owner.getByRole('button', { name: `Share ${PORTFOLIO}` })).toBeVisible({ timeout: 10_000 });

    // The partner's next load no longer lists the portfolio. (Writes are
    // refused too: rls-portfolios.spec.ts covers that at the API.)
    await partner.reload();
    const listed = partner.waitForResponse((r) => r.url().includes('/rest/v1/portfolio_members') && r.ok(), { timeout: 15_000 });
    await unlock(partner, PARTNER_SLOT);
    await listed;
    await expect(switcher(partner)).toHaveCount(0);
    await expect(partner.getByRole('progressbar', { name: /Holiday fund/i })).toHaveCount(0);
  });
});
