import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';

// Dev-only auto-login.
//
// The dev server talks to the shared *prod* Supabase project, which enforces
// Cloudflare Turnstile on the password grant. Local .env ships Cloudflare's
// always-pass test site key, whose token the real secret rejects
// (`captcha_failed`), so the login modal can never complete in `npm run dev`.
//
// When DEV_AUTOLOGIN=1 is set in .env, this mints a *real* Supabase session for
// TEST_USER_EMAIL — identical to a successful login, just obtained through the
// captcha-exempt admin path the E2E suite uses (admin.generateLink → verifyOtp,
// see e2e/helpers/auth.ts) — and injects it into <head> so the app boots already
// authenticated. You still unlock with the password to exercise the real
// KEK/DK path. No console, no pasting.
//
// `apply: 'serve'` plus the flag guard mean this never runs in a build, so the
// service-role key and the minted session can never reach a shipped bundle. CI
// and prod don't have the secrets set anyway.

interface Cached {
  entries: Record<string, string>;
  mintedAt: number;
}

export function devAutoLogin(): Plugin {
  let enabled = false;
  let env: Record<string, string> = {};
  let cache: Cached | null = null;

  // Access tokens last ~1h; re-mint well before that so a long-lived dev server
  // never injects a stale token. One full-page reload after the window re-mints.
  const TTL_MS = 45 * 60_000;

  async function mintSession(): Promise<Record<string, string> | null> {
    if (cache && Date.now() - cache.mintedAt < TTL_MS) return cache.entries;

    const url = env.VITE_SUPABASE_URL;
    const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const email = env.TEST_USER_EMAIL;
    if (!url || !anonKey || !serviceRoleKey || !email) return null;

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) return null;

    // Let supabase-js persist the verified session so we capture the exact
    // sb-<ref>-auth-token key/value shape for the installed library version.
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
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error) return null;

    cache = { entries: store, mintedAt: Date.now() };
    return store;
  }

  return {
    name: 'dev-auto-login',
    apply: 'serve',
    configResolved(config) {
      // Load all .env vars (prefix '') so we can read the non-VITE secrets.
      env = loadEnv(config.mode, config.root, '');
      // A real env var wins over the .env file value, so Playwright's webServer
      // can force this off (DEV_AUTOLOGIN=0) even though .env sets it to 1.
      const flag = process.env.DEV_AUTOLOGIN ?? env.DEV_AUTOLOGIN;
      enabled = flag === '1' || flag === 'true';
    },
    async transformIndexHtml(html) {
      if (!enabled) return html;
      const entries = await mintSession().catch(() => null);
      if (!entries) return html;

      // Only set when absent so a deliberate sign-out (which clears the key)
      // isn't instantly resurrected mid-session, and so we never clobber a
      // fresher token the running app rotated in. An expired/absent session on
      // a later full reload gets a freshly minted one.
      // Skip automated browsers (navigator.webdriver) so this never logs in a
      // Playwright session — even if E2E reuses an already-running dev server
      // that has auto-login on. The E2E specs control auth themselves.
      const json = JSON.stringify(entries);
      const script =
        `<script>(function(){try{if(navigator.webdriver)return;var s=${json};` +
        `for(var k in s){if(!localStorage.getItem(k))localStorage.setItem(k,s[k]);}` +
        `}catch(e){}})();</script>`;
      return html.replace('<head>', `<head>\n    ${script}`);
    },
  };
}
