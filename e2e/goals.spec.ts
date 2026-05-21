import { test, expect, Page } from '@playwright/test';
import { loadDemo } from './helpers/loadDemo';
import { seedClean } from './helpers/seedClean';

// Goals are persisted inside the same encrypted portfolio blob (or
// localStorage `portfolio-data` for guests). Each test runs in a clean storage
// context so they don't bleed into each other.

const STORAGE_KEY = 'portfolio-data';
const PLAN_KEY = 'quantive-test-plan';
const DAY_MS = 24 * 60 * 60 * 1000;

async function clearStorage(page: Page) {
  // Seed dismissal flags BEFORE the first navigation so the WelcomeModal can't
  // appear on /dashboard (where its backdrop would intercept later clicks).
  // Playwright contexts are per-test isolated, so localStorage starts empty —
  // an explicit clear() is unnecessary.
  await seedClean(page);
  await page.goto('/dashboard');
}

/** Seed a single fact so `usePortfolio` boots with a positive net worth and a
 *  trailing growth series, which keeps the ETA caption from reading "ETA
 *  unavailable". The exact numbers don't matter for the assertions below. */
async function seedPortfolio(page: Page) {
  await page.evaluate((key) => {
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(now.getFullYear() - 1);
    const blob = {
      facts: [
        { date: yearAgo.toISOString(), idSource: 'Cash', sourceVl: 40_000, currency: 'EUR' },
        { date: now.toISOString(),     idSource: 'Cash', sourceVl: 50_000, currency: 'EUR' },
      ],
      refSources: [{ idSource: 'Cash', volatType: 'Cash', transferableInDays: true }],
    };
    localStorage.setItem(key, JSON.stringify(blob));
    localStorage.setItem('portfolio-data-is-mock', 'false');
  }, STORAGE_KEY);
}

/** Seed a goal directly into the blob with a chosen createdAt — lets us test
 *  the "past 30 days" branch without waiting 30 days. */
async function seedGoalAged(page: Page, ageDays: number) {
  await page.evaluate(({ key, ageDays }) => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const blob = JSON.parse(raw);
    const created = new Date(Date.now() - ageDays * 86_400_000);
    blob.goals = [
      {
        id: crypto.randomUUID(),
        name: 'Reach 100k',
        targetAmount: 100_000,
        targetCurrency: 'EUR',
        targetDate: '2030-12-31',
        createdAt: created.toISOString(),
      },
    ];
    localStorage.setItem(key, JSON.stringify(blob));
  }, { key: STORAGE_KEY, ageDays });
}

async function setPlan(page: Page, plan: 'free' | 'pro') {
  await page.evaluate(({ key, plan }) => {
    localStorage.setItem(key, plan);
  }, { key: PLAN_KEY, plan });
}

async function gotoGoals(page: Page) {
  await page.goto('/goals');
  await page.waitForLoadState('networkidle').catch(() => null);
}

test.describe('Goals — staged free-tier gate', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorage(page);
  });

  test('Pro user creates a goal and sees live progress', async ({ page }) => {
    await seedPortfolio(page);
    await setPlan(page, 'pro');
    await gotoGoals(page);

    await page.getByRole('button', { name: /add (your first )?goal/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /add a goal/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Goal name').fill('Reach 100k by 2030');
    await dialog.getByLabel('Target amount').fill('100000');
    await dialog.getByLabel('Target date').fill('2030-12-31');
    await dialog.getByRole('button', { name: /^add goal$/i }).click();

    // Progress bar present and labelled.
    const progress = page.getByRole('progressbar', { name: /Reach 100k by 2030/i });
    await expect(progress).toBeVisible();
    // Free-trial badge MUST NOT appear for Pro users.
    await expect(page.getByText(/Free preview/i)).toHaveCount(0);
    // No upsell card.
    await expect(page.getByRole('link', { name: /upgrade to pro/i })).toHaveCount(0);
  });

  test('Free user creates first goal and sees 30-day progress', async ({ page }) => {
    await seedPortfolio(page);
    await setPlan(page, 'free');
    await gotoGoals(page);

    await page.getByRole('button', { name: /add (your first )?goal/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /add a goal/i });
    await dialog.getByLabel('Goal name').fill('First milestone');
    await dialog.getByLabel('Target amount').fill('100000');
    await dialog.getByLabel('Target date').fill('2030-12-31');
    await dialog.getByRole('button', { name: /^add goal$/i }).click();

    // Live progress bar present.
    await expect(page.getByRole('progressbar', { name: /First milestone/i })).toBeVisible();
    // Free-trial badge present.
    await expect(page.getByText(/Free preview · \d+ days? left/i)).toBeVisible();
  });

  test('Free user with a second goal sees the upsell on it', async ({ page }) => {
    await seedPortfolio(page);
    await setPlan(page, 'free');
    await gotoGoals(page);

    // Add goal #1 (allowed for 30d).
    await page.getByRole('button', { name: /add (your first )?goal/i }).first().click();
    let dialog = page.getByRole('dialog', { name: /add a goal/i });
    await dialog.getByLabel('Goal name').fill('Milestone A');
    await dialog.getByLabel('Target amount').fill('100000');
    await dialog.getByLabel('Target date').fill('2030-12-31');
    await dialog.getByRole('button', { name: /^add goal$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Add goal #2 (gated for Free). Use the header's aria-label so we don't
    // collide with the submit button inside the form.
    await page.getByRole('button', { name: 'Add a goal' }).click();
    dialog = page.getByRole('dialog', { name: /add a goal/i });
    await dialog.getByLabel('Goal name').fill('Milestone B');
    await dialog.getByLabel('Target amount').fill('250000');
    await dialog.getByLabel('Target date').fill('2031-12-31');
    await dialog.getByRole('button', { name: /^add goal$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Milestone A still has its progress bar.
    await expect(page.getByRole('progressbar', { name: /Milestone A/i })).toBeVisible();
    // Milestone B is rendered as a locked card — no progress bar for it.
    await expect(page.getByRole('progressbar', { name: /Milestone B/i })).toHaveCount(0);
    // An upsell CTA appears (the locked card embeds an UpsellCard for `milestones`).
    await expect(page.getByRole('link', { name: /upgrade to pro/i }).first()).toBeVisible();
  });

  test('Free user past 30 days sees the upsell on their first goal', async ({ page }) => {
    await seedPortfolio(page);
    await seedGoalAged(page, 45); // older than the 30-day window
    await setPlan(page, 'free');
    await gotoGoals(page);

    // Locked card: no progress bar, upsell visible.
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /upgrade to pro/i }).first()).toBeVisible();
  });
});
