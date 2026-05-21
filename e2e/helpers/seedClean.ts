import type { Page } from '@playwright/test';

/**
 * Pre-seed the page's localStorage with defaults that prevent modal/banner
 * backdrops from intercepting clicks during E2E flows.
 *
 * Uses `page.addInitScript` so the values are written BEFORE any page script
 * runs, on every navigation in the context. This eliminates the race where the
 * `WelcomeModal` (rendered by `FileUpload` on the empty-state dashboard) or
 * the analytics `ConsentBanner` appears on first render and blocks subsequent
 * clicks on sidebar links / CTAs.
 *
 * Must be called BEFORE the first `page.goto()` in the test or `beforeEach`.
 *
 * `opts.plan` lets you set the dev-only Pro/Free override in the same shot —
 * the override is read on first render by `useEntitlements`, so it must also
 * land via `addInitScript` for FeatureGate to see it on the initial mount.
 */
export async function seedClean(
  page: Page,
  opts: { plan?: 'pro' | 'free' } = {},
) {
  await page.addInitScript((plan) => {
    try {
      window.localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
      window.localStorage.setItem('quantive_analytics_consent', 'denied');
      if (plan) window.localStorage.setItem('quantive-test-plan', plan);
    } catch {
      /* localStorage may be inaccessible in some sandboxed contexts */
    }
  }, opts.plan ?? null);
}
