// Post-build prerender for the public marketing/legal routes.
//
// Why this exists: the app is a client-rendered SPA, so the shipped HTML body
// is just <div id="root">. Google renders JS eventually, but most AI answer-
// engine crawlers (Perplexity, many GPTBot/ClaudeBot fetches, RAG ingestion)
// read raw HTML and never execute JS — to them the page is empty apart from
// the <head>. This step boots the built app in headless Chromium (the same
// browser the Playwright e2e suite already installs), captures the fully
// rendered HTML for each public route, and writes it back into dist/ so those
// crawlers get real, answer-first content.
//
// App routes (/dashboard, /settings, …) are deliberately NOT prerendered: they
// render encrypted user data and must stay client-only. The script tags remain
// in the output, so the SPA still boots and takes over on load.
//
// NOT wired into `npm run build` on purpose. This launches headless Chromium,
// which doesn't run in the Cloudflare Pages build image: that environment is
// non-root, so `playwright install --with-deps` (which apt-installs Chromium's
// shared libs) can't run, and the bare browser fails to launch. The same
// `npm run build` also runs in CI, where the right incantation differs again.
// Run this manually (`npm run prerender` after `npm run build`, or the combined
// `npm run build:prerender`) where a browser is available.
//
// In deploys this runs from .github/workflows/deploy.yml: a GitHub Actions job
// that `playwright install --with-deps chromium`, runs `build:prerender`, and
// uploads the prerendered dist/ to Cloudflare Pages via `wrangler pages deploy`
// — not from inside the CF build. That workflow is dormant until DEPLOY_ENABLED
// is set; see its header for the one-time cutover steps.
import { preview } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

// Keep this list in sync with the public (non-app, crawlable) routes in
// src/App.tsx and the <loc> entries in public/sitemap.xml. /demo is excluded:
// it is a redirect and is Disallow-ed in robots.txt.
const ROUTES = ['/', '/pricing', '/security', '/privacy', '/terms', '/impressum'];

// Flat `<route>.html`, not `<route>/index.html`: on Cloudflare Pages a flat file
// is served at the no-trailing-slash URL (/terms → 200) and 308-redirects the
// slash form, matching our sitemap and canonical tags. A directory/index.html
// inverts that and makes /terms 308-redirect to /terms/, which Google reports as
// "Page with redirect". Must stay consistent with vite-plugins/seo-route-html.ts.
const outFileFor = (route) =>
  route === '/'
    ? path.join(distDir, 'index.html')
    : path.join(distDir, `${route.replace(/^\//, '')}.html`);

async function main() {
  const server = await preview({ preview: { port: 4173, strictPort: true } });
  const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? 'http://localhost:4173';

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    for (const route of ROUTES) {
      const url = `${base}${route}`;
      // domcontentloaded + an explicit wait for rendered content is more
      // reliable than networkidle here: analytics keeps a connection warm, so
      // networkidle can time out even after the page is fully painted.
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page
        .waitForSelector('main, h1, [role="main"]', { timeout: 15000 })
        .catch(() => console.warn(`  ! ${route}: no content selector matched, snapshotting anyway`));
      await page.waitForTimeout(300);

      const html = await page.content();
      const outFile = outFileFor(route);
      await mkdir(path.dirname(outFile), { recursive: true });
      await writeFile(outFile, html, 'utf8');
      console.log(`  ✓ prerendered ${route} → ${path.relative(distDir, outFile)}`);
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}

main().catch((err) => {
  console.error('Prerender failed:', err);
  process.exit(1);
});
