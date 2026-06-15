import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Where global-setup stashes minted sessions for the spec workers to read.
 * Playwright runs from the package root, so cwd is stable. Gitignored via
 * e2e/.auth/.
 */
const SESSIONS_FILE = join(process.cwd(), 'e2e', '.auth', 'sessions.json');

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
 * Supabase project config for the captcha-free sign-in path below.
 *
 * The anon project enforces Cloudflare Turnstile on the password grant
 * (Auth → CAPTCHA), so a headless test can never complete the AuthModal form —
 * GoTrue rejects tokenless `/token?grant_type=password` with `captcha_failed`.
 * The service-role key lets us mint a session through the admin path instead,
 * which is captcha-exempt. It is read only here in the test process and never
 * reaches the app bundle.
 */
function getSupabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set for E2E auth.',
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY must be set for E2E auth — the project enforces ' +
        'CAPTCHA, so sign-in goes through the admin path. See e2e/helpers/auth.ts.',
    );
  }
  return { url, anonKey, serviceRoleKey };
}

/** True when every secret the programmatic sign-in needs is present. */
export function hasE2EAuth(slot: 1 | 2 = 1): boolean {
  try {
    getTestCreds(slot);
    getSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}

/**
 * Mint a real Supabase session for a test user WITHOUT touching the
 * captcha-gated password grant.
 *
 * `admin.generateLink` (service role) and `verifyOtp({ token_hash })` are both
 * captcha-exempt in GoTrue, so this works against the production project with
 * CAPTCHA fully on. We let supabase-js itself persist the session into an
 * in-memory store so we capture the exact `sb-<ref>-auth-token` key/value
 * shape for the installed library version — the browser client then restores
 * it verbatim on boot. No hand-rolled storage payload to drift out of sync.
 *
 * Returns the localStorage entries to replay into the page.
 */
async function mintSessionStorage(slot: 1 | 2): Promise<Record<string, string>> {
  const { url, anonKey, serviceRoleKey } = getSupabaseEnv();
  const { email } = getTestCreds(slot);

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    throw new Error(
      `admin.generateLink failed for ${email}: ${linkErr?.message ?? 'no hashed_token returned'}`,
    );
  }

  const store: Record<string, string> = {};
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      storage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; },
      },
    },
  });
  const { error: verifyErr } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyErr) {
    throw new Error(`verifyOtp failed for ${email}: ${verifyErr.message}`);
  }

  return store;
}

/**
 * Mint sessions for every configured slot and write them to SESSIONS_FILE.
 * Called once from global-setup so the per-user `admin.generateLink` runs
 * exactly once, sequentially — parallel workers each minting for the same user
 * would invalidate each other's one-time tokens ("Email link is invalid or has
 * expired"). The minted access token is a reusable bearer token, so all
 * parallel specs can safely share it.
 */
export async function prepareSessions(): Promise<void> {
  const sessions: Record<string, Record<string, string>> = {};
  for (const slot of [1, 2] as const) {
    if (!hasE2EAuth(slot)) continue;
    sessions[slot] = await mintSessionStorage(slot);
  }
  mkdirSync(dirname(SESSIONS_FILE), { recursive: true });
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions), 'utf8');
}

function readStoredSession(slot: 1 | 2): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(SESSIONS_FILE, 'utf8');
  } catch {
    throw new Error(
      `No minted session found at ${SESSIONS_FILE}. global-setup should have ` +
        'written it; check that SUPABASE_SERVICE_ROLE_KEY and TEST_USER_* are set.',
    );
  }
  const session = (JSON.parse(raw) as Record<string, Record<string, string>>)[slot];
  if (!session) {
    throw new Error(`No minted session for slot ${slot}. See e2e/global-setup.ts.`);
  }
  return session;
}

/**
 * Sign a test user in and unlock their encrypted data.
 *
 * Auth is done programmatically (see mintSessionStorage) because the project
 * enforces CAPTCHA on the AuthModal form. We inject the minted session before
 * any app JS runs, land on a protected route so RequireUnlock mounts, then
 * drive the real unlock UI with the user's password — exercising the same
 * KEK-derivation + DK-unwrap path a real sign-in would.
 */
export async function signIn(page: Page, slot: 1 | 2 = 1) {
  const { password } = getTestCreds(slot);
  const store = readStoredSession(slot);

  // Write the session into localStorage once, like a real login would. We use
  // a one-shot evaluate rather than addInitScript on purpose: addInitScript
  // re-fires on every later navigation and would resurrect the session after a
  // deliberate sign-out, breaking the logout/account-swap specs. Callers always
  // land on the app origin (beforeEach goto('/')) before signing in, so
  // localStorage is reachable here.
  await page.evaluate((entries: Record<string, string>) => {
    for (const [k, v] of Object.entries(entries)) {
      try { window.localStorage.setItem(k, v); } catch { /* sandboxed */ }
    }
  }, store);

  // Authed-but-locked on a protected path → RequireUnlock mounts.
  await page.goto('/dashboard');

  const unlock = page.getByRole('dialog', { name: /unlock your data/i });
  await unlock.waitFor({ state: 'visible', timeout: 15_000 });
  await unlock.getByPlaceholder('Password').fill(password);
  await unlock.getByRole('button', { name: /^unlock$/i }).click();
  await unlock.waitFor({ state: 'detached', timeout: 15_000 });

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
