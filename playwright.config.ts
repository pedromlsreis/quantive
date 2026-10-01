import { defineConfig, devices } from '@playwright/test';
// Load .env so specs can read TEST_USER_EMAIL / TEST_USER_PASSWORD etc.
// Vite handles this for the app at runtime; tests run in plain Node and
// would otherwise see nothing.
import 'dotenv/config';

const FAMILY_SPECS = /(rls-portfolios|family-sharing)\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  // Mints test-user sessions once (the project enforces CAPTCHA, so specs sign
  // in via the admin path — see e2e/helpers/auth.ts). No-op without E2E secrets.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: FAMILY_SPECS,
    },
    // The Family specs make test user 1 a partner in test user 2's
    // portfolio. Most specs sign in as user 1, so these run after all of
    // them. They also reset the same two users, so one worker runs them one
    // after the other; that holds with --no-deps too, which skips only the
    // wait for chromium.
    {
      name: 'family',
      use: { ...devices['Desktop Chrome'] },
      testMatch: FAMILY_SPECS,
      dependencies: ['chromium'],
      workers: 1,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Overrides .env; only applies when Playwright starts dev. Force the
    // Turnstile key empty so E2E renders no widget (no gating, no Cloudflare
    // script), and force dev-auto-login off so specs start logged out and drive
    // auth themselves (see e2e/helpers/auth.ts).
    env: { VITE_TURNSTILE_SITE_KEY: '', DEV_AUTOLOGIN: '0' },
  },
});
