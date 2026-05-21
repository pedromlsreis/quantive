import { test, expect } from '@playwright/test';
import {
  signIn,
  signOutViaProfileMenu,
  readLocalStorageKey,
  getTestCreds,
} from './helpers/auth';
import { seedClean } from './helpers/seedClean';

/**
 * Verifies the client-side cleanup contract from
 * docs/logout-data-leak-remediation.md. The PortfolioContext user-id watcher
 * is the load-bearing piece — these tests should red if it regresses.
 *
 * Skipped automatically when TEST_USER_EMAIL / TEST_USER_PASSWORD are not
 * set, so a contributor without credentials still sees a clean suite.
 */
const hasCreds = (() => {
  try { getTestCreds(); return true; } catch { return false; }
})();

const hasCreds2 = (() => {
  try { getTestCreds(2); return true; } catch { return false; }
})();

test.describe('Logout data persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-dismiss WelcomeModal via addInitScript so it can't intercept clicks
    // on the account menu after a fresh sign-in. The user-id watcher wipes
    // per-user keys but not this app-wide UI flag, so re-seeding before each
    // navigation is the safe default. Playwright contexts are per-test
    // isolated, so localStorage starts empty — no explicit clear() needed.
    await seedClean(page);
    await page.goto('/');
  });

  test('authed user never writes plaintext portfolio-data to localStorage', async ({ page }) => {
    test.skip(!hasCreds, 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set.');
    await signIn(page);

    // Give the cloud-load + any addMeasurement flow a moment.
    await page.waitForTimeout(500);

    const cached = await readLocalStorageKey(page, 'portfolio-data');
    expect(cached).toBeNull();
  });

  test('sign-out wipes portfolio-data and resets the dashboard', async ({ page }) => {
    test.skip(!hasCreds, 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set.');
    await signIn(page);

    // Seed something so a regression has data to leak.
    await page.evaluate(() => {
      localStorage.setItem('portfolio-data', JSON.stringify({
        facts: [{ date: '2026-01-01', idSource: 'leak', sourceVl: 999, currency: 'EUR' }],
        refSources: [{ idSource: 'leak', volatType: 'Cash', transferableInDays: true }],
      }));
      localStorage.setItem('portfolio-data-is-mock', 'false');
      localStorage.setItem('add-measurement-draft', '[{"name":"leak"}]');
    });

    await signOutViaProfileMenu(page);

    // Allow the watcher's microtask to flush.
    await page.waitForTimeout(300);

    expect(await readLocalStorageKey(page, 'portfolio-data')).toBeNull();
    expect(await readLocalStorageKey(page, 'portfolio-data-is-mock')).toBeNull();
    expect(await readLocalStorageKey(page, 'add-measurement-draft')).toBeNull();

    // Reload — the guest-load gate should not rehydrate any data because
    // the cache is gone.
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => null);
    expect(await readLocalStorageKey(page, 'portfolio-data')).toBeNull();
  });

  test('RequireUnlock "Sign out instead" wipes data without unlocking', async ({ page }) => {
    test.skip(!hasCreds, 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set.');
    await signIn(page);

    // Seed something so a regression has data to leak.
    await page.evaluate(() => {
      localStorage.setItem('portfolio-data', JSON.stringify({
        facts: [{ date: '2026-01-01', idSource: 'leak', sourceVl: 999, currency: 'EUR' }],
        refSources: [{ idSource: 'leak', volatType: 'Cash', transferableInDays: true }],
      }));
      localStorage.setItem('portfolio-data-is-mock', 'false');
    });

    // Reload: the auth session restores from sb-* but keySession is in-memory
    // only, so status flips to 'locked' and RequireUnlock mounts on protected
    // paths. Navigate to /dashboard explicitly so we land on a protected route.
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle').catch(() => null);

    const unlockModal = page.getByRole('dialog', { name: /unlock your data/i });
    await expect(unlockModal).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /sign out instead/i }).click();
    await page.waitForLoadState('networkidle').catch(() => null);

    // The watcher must have wiped the cache even though we never unlocked.
    expect(await readLocalStorageKey(page, 'portfolio-data')).toBeNull();
    expect(await readLocalStorageKey(page, 'portfolio-data-is-mock')).toBeNull();
  });

  test('account-swap A → B in the same tab leaves no A state', async ({ page }) => {
    test.skip(
      !hasCreds || !hasCreds2,
      'TEST_USER_EMAIL / PASSWORD and TEST_USER_2_EMAIL / PASSWORD must both be set.',
    );

    // Sign in as user A and seed every per-user key we expect the watcher to wipe.
    await signIn(page, 1);
    const aLabel = await page.evaluate(() => {
      // Grab whatever displayName / email is showing in the account menu —
      // we'll later assert it isn't visible after the swap.
      const btn = document.querySelector('button[aria-label="Account menu"]');
      return btn?.textContent?.trim() ?? null;
    });

    await page.evaluate(() => {
      localStorage.setItem('portfolio-data', JSON.stringify({
        facts: [{ date: '2026-01-01', idSource: 'A-leak', sourceVl: 111, currency: 'EUR' }],
        refSources: [{ idSource: 'A-leak', volatType: 'Cash', transferableInDays: true }],
      }));
      localStorage.setItem('portfolio-data-is-mock', 'false');
      localStorage.setItem('add-measurement-draft', '[{"name":"A-leak"}]');
    });

    await signOutViaProfileMenu(page);
    await page.waitForTimeout(300);

    // signIn helper clicks the landing-page sign-in trigger; after sign-out
    // we may be on /dashboard (guest-accessible). Bounce to landing first.
    await page.goto('/');

    // Sign in as user B in the same tab.
    await signIn(page, 2);
    await page.waitForTimeout(300);

    // Watcher contract: no A keys may survive.
    expect(await readLocalStorageKey(page, 'portfolio-data')).toBeNull();
    expect(await readLocalStorageKey(page, 'portfolio-data-is-mock')).toBeNull();
    expect(await readLocalStorageKey(page, 'add-measurement-draft')).toBeNull();

    // ProfileMenu must not flash A's label. We don't pin the exact format of
    // B's label (test-user emails may differ between projects), only that
    // whatever shows differs from A's.
    if (aLabel) {
      const bLabel = await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="Account menu"]');
        return btn?.textContent?.trim() ?? null;
      });
      expect(bLabel).not.toBe(aLabel);
    }
  });

  test('/settings redirects to landing when unauthed', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 5_000 });
    expect(page.url()).toMatch(/\/$/);
  });

  test('/admin redirects to landing when unauthed', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 5_000 });
    expect(page.url()).toMatch(/\/$/);
  });
});
