import { test, expect } from '@playwright/test';
import { seedClean } from './helpers/seedClean';

// Covers the public, unauthenticated marketing/legal/reset surface:
//   /pricing, /security, /changelog, /privacy, /terms, /impressum, /reset-password
// These do not require Supabase auth so they run fast and are isolated from
// the auth-heavy specs. All timeouts are tuned generous to survive heavy
// machine load — first navigation has to compile + bundle on cold cache.

test.describe('Pricing page', () => {
  test.beforeEach(async ({ page }) => {
    await seedClean(page);
    await page.goto('/pricing');
    // Wait for the h1 instead of
    // networkidle (the StickyNav re-fetches subscription on each render).
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 12_000 });
  });

  test('renders the Free, Pro and Family cards', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /€0 forever/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^free$/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^pro$/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /^family$/i })).toBeVisible();
    // Free CTA is a link to /dashboard so guests aren't asked to sign up first.
    await expect(page.getByRole('link', { name: /get started/i }).first()).toBeVisible();
  });

  test('billing-interval toggle flips price and caption', async ({ page }) => {
    const group = page.getByRole('radiogroup', { name: /billing interval/i });
    await expect(group).toBeVisible();
    const monthly = group.getByRole('radio', { name: /monthly/i });
    const yearly = group.getByRole('radio', { name: /yearly/i });

    const family = page.getByRole('region', { name: /^family$/i });

    // Yearly is the default; Pro reads €90 a year and Family €120.
    await expect(yearly).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/€90/).first()).toBeVisible();
    await expect(family.getByText(/€120/).first()).toBeVisible();

    // Switch to monthly — prices flip to €9 and €14 a month.
    await monthly.click();
    await expect(monthly).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/€9\b/).first()).toBeVisible({ timeout: 6000 });
    await expect(family.getByText(/€14\b/).first()).toBeVisible({ timeout: 6000 });
    // The captions change form too.
    await expect(page.getByText(/save €18/i).first()).toBeVisible();
    await expect(family.getByText(/save €48/i)).toBeVisible();

    // And back to yearly — confirm bi-directional.
    await yearly.click();
    await expect(yearly).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/€90/).first()).toBeVisible({ timeout: 6000 });
  });

  test('paid-plan CTAs use the signed-out variant for guests', async ({ page }) => {
    // For a guest each button reads "Sign up to subscribe" and the supporting
    // line tells them checkout opens once they confirm their email.
    for (const name of [/^pro$/i, /^family$/i]) {
      const card = page.getByRole('region', { name });
      await expect(card.getByRole('button', { name: /sign up to subscribe/i })).toBeVisible();
      await expect(card.getByText(/sign up first/i)).toBeVisible();
    }
  });

  test('a guest choosing Family carries the plan through sign-up', async ({ page }) => {
    await page.getByRole('radiogroup', { name: /billing interval/i }).getByRole('radio', { name: /monthly/i }).click();
    await page.getByRole('region', { name: /^family$/i }).getByRole('button', { name: /sign up to subscribe/i }).click();
    await expect(page).toHaveURL(/\/dashboard\?intent=subscribe&plan=family-monthly/);
    await expect(page.getByRole('region', { name: /family subscription pending/i })).toContainText('€14 a month');
  });

  test('legal microcopy mentions §19 UStG (Kleinunternehmer)', async ({ page }) => {
    // The Pro price and the "Why is no VAT charged?" answer both cite it.
    const count = await page.getByText(/§\s*19\s*UStG/i).count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('Pricing page has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Wait one rAF for layout to settle on resize.
    await expect.poll(async () => {
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      const cw = await page.evaluate(() => document.documentElement.clientWidth);
      return sw - cw;
    }, { timeout: 6000 }).toBeLessThanOrEqual(2);
  });
});

test.describe('Security page', () => {
  test.beforeEach(async ({ page }) => {
    await seedClean(page);
    await page.goto('/security');
    await expect(page.getByRole('heading', { level: 1, name: /security/i })).toBeVisible({ timeout: 12_000 });
  });

  test('renders headline claim and key encryption details', async ({ page }) => {
    // Mentions XChaCha20-Poly1305 (or its variant) and Argon2id.
    await expect(page.getByText(/XChaCha20|Poly1305/i).first()).toBeVisible();
    await expect(page.getByText(/Argon2id/i).first()).toBeVisible();
  });

  test('exposes external links to the source/design-doc', async ({ page }) => {
    // We don't follow the links (rate-limited GitHub), just confirm they exist
    // with the expected host so future copy edits don't silently break them.
    const ghLinks = page.locator('a[href*="github.com/pedromlsreis/quantive"]');
    const count = await ghLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('renders the sticky nav and footer chrome', async ({ page }) => {
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
});

test.describe('Legal markdown pages', () => {
  for (const { path, name, expectText } of [
    { path: '/privacy', name: 'Privacy Policy', expectText: /privacy/i },
    { path: '/terms', name: 'Terms of Service', expectText: /terms/i },
    { path: '/impressum', name: 'Impressum', expectText: /impressum|angaben gem/i },
  ]) {
    test(`${name} renders markdown content`, async ({ page }) => {
      await seedClean(page);
      await page.goto(path);
      // MarkdownLegal renders an h1 derived from the .md frontmatter.
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toBeVisible({ timeout: 12_000 });
      await expect(heading).toContainText(expectText);
      // At least one h2 (sub-section) — protects against an empty/broken parse.
      await expect.poll(async () => page.getByRole('heading', { level: 2 }).count(), { timeout: 8000 }).toBeGreaterThan(0);
    });

    test(`${name} sticky nav links back to landing`, async ({ page }) => {
      await seedClean(page);
      await page.goto(path);
      // The brand wordmark is wrapped in a link to "/".
      const brandLink = page.getByRole('link', { name: /quantive home/i }).first();
      await expect(brandLink).toBeVisible({ timeout: 8000 });
      await brandLink.click();
      await page.waitForURL('**/', { timeout: 10_000 });
    });
  }
});

test.describe('Changelog page', () => {
  test('lists dated entries grouped by month', async ({ page }) => {
    await seedClean(page);
    await page.goto('/changelog');
    await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('heading', { level: 2, name: 'October 2026' })).toBeVisible();
    const entry = page.locator('article#change-sign-in-email');
    await expect(entry.getByRole('heading', { level: 3 })).toHaveText('Change the email you sign in with');
    await expect(entry.locator('time')).toHaveAttribute('datetime', '2026-10-20');
    await expect(entry.getByText('Prompted by feedback')).toBeVisible();
  });

  test('a shared entry link scrolls to that entry', async ({ page }) => {
    await seedClean(page);
    await page.goto('/changelog#pro-plan');
    await expect(page.locator('article#pro-plan')).toBeInViewport({ timeout: 12_000 });
  });

  test('the public footer links to it', async ({ page }) => {
    await seedClean(page);
    await page.goto('/pricing');
    await page.getByRole('contentinfo').getByRole('link', { name: /^changelog$/i }).click();
    await page.waitForURL('**/changelog', { timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible();
  });
});

// Value: protects=/email-updates is routed in App.tsx and open to signed-out visitors: an emailed link shows the confirm step and leaves no token in the URL;
// fails_when=the route is dropped, renamed, or moved behind RequireAuth, so every confirm and unsubscribe link 404s or asks for a sign-in;
// why_new=EmailUpdatesPage.test mounts the page in its own MemoryRouter, so App.tsx's route table is never exercised;
// seam=none; no_claim=never presses Confirm (that would call the live email-list function); server behaviour is untested
test.describe('Email updates page', () => {
  test('opens a confirm link signed out, without the token left in the address bar', async ({ page }) => {
    await seedClean(page);
    await page.goto(`/email-updates#confirm=${'A'.repeat(43)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Confirm your email' })).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('button', { name: 'Confirm my email' })).toBeEnabled();
    await expect(page).toHaveURL(/\/email-updates$/);
  });
});

test.describe('Reset password page', () => {
  test('shows invalid-link branch when navigated without recovery tokens', async ({ page }) => {
    await seedClean(page);
    await page.goto('/reset-password');
    // The single-state-machine in ResetPassword waits ~1.5s before flipping to
    // 'invalid' when no tokens are present. Bump the assertion timeout to be
    // safe under load.
    await expect(
      page.getByText(/invalid|expired|link/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
