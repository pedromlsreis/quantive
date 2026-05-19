import type { Page } from '@playwright/test';

/**
 * Test credentials must be provisioned outside the test run.
 * Set TEST_USER_EMAIL and TEST_USER_PASSWORD in your shell or .env.
 * The user must exist in Supabase with email_confirmed_at set.
 *
 * TEST_USER_2_* is optional — only the A→B account-swap spec needs it.
 */
export function getTestCreds(slot: 1 | 2 = 1) {
  const emailKey = slot === 2 ? 'TEST_USER_2_EMAIL' : 'TEST_USER_EMAIL';
  const passwordKey = slot === 2 ? 'TEST_USER_2_PASSWORD' : 'TEST_USER_PASSWORD';
  const email = process.env[emailKey];
  const password = process.env[passwordKey];
  if (!email || !password) {
    throw new Error(
      `${emailKey} and ${passwordKey} must be set. See e2e/helpers/auth.ts.`,
    );
  }
  return { email, password };
}

/**
 * Open the auth modal (signin), fill credentials, submit, and wait for the
 * post-auth dashboard. Assumes the user is on the landing page.
 */
export async function signIn(page: Page, slot: 1 | 2 = 1) {
  const { email, password } = getTestCreds(slot);

  await page.getByRole('button', { name: /sign in to your account/i }).first().click();

  // AuthModal exposes email/password by placeholder + autocomplete.
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Post-signin, the app redirects to /dashboard once unlock resolves.
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  // Wait for the dashboard shell to settle so the next assertion isn't racing
  // a still-mounting tree.
  await page.waitForLoadState('networkidle').catch(() => null);
}

/**
 * Click the account menu and trigger Sign out. Waits for the post-logout
 * redirect to the landing route.
 */
export async function signOutViaProfileMenu(page: Page) {
  await page.getByRole('button', { name: /account menu/i }).click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  // After signOut(), AuthContext flips user to null. The dashboard route
  // stays guest-accessible by design, but the in-app shell drops the
  // authed-only chrome. We don't assert URL because /dashboard can stay.
  await page.waitForLoadState('networkidle').catch(() => null);
}

/** Read a key from the page's localStorage (returns null when absent). */
export async function readLocalStorageKey(page: Page, key: string) {
  return await page.evaluate((k) => window.localStorage.getItem(k), key);
}
