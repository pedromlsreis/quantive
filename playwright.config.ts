import { defineConfig, devices } from '@playwright/test';
// Load .env so specs can read TEST_USER_EMAIL / TEST_USER_PASSWORD etc.
// Vite handles this for the app at runtime; tests run in plain Node and
// would otherwise see nothing.
import 'dotenv/config';

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
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Force the Turnstile key empty so E2E renders no widget (no gating, no
    // Cloudflare script). Overrides .env; only applies when Playwright starts dev.
    env: { VITE_TURNSTILE_SITE_KEY: '' },
  },
});
