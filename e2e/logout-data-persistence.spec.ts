import { test, expect } from '@playwright/test';
import {
  signIn,
  signOutViaProfileMenu,
  readLocalStorageKey,
  getTestCreds,
} from './helpers/auth';

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

test.describe('Logout data persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Start each test from a known-clean browser state.
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // Pre-dismiss WelcomeModal so it can't intercept clicks on the
      // account menu after a fresh sign-in. The user-id watcher only
      // wipes per-user keys, not this app-wide UI flag.
      localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
    });
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
