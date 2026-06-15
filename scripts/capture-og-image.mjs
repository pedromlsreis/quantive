// Re-captures the social share image (public/og-image.jpg): the forecast
// trajectory view rendered with the /demo seed data, framed to 1200×630 to
// match the og:image dimensions declared in index.html.
//
// Run whenever the forecast view or app chrome changes visibly so the link
// preview stays current.
//
// Prereqs: dev server running (`npm run dev`; override the origin with BASE).
// Capture is 2× then downscaled in a canvas to a crisp 1200×630 JPEG, so no
// image tooling is needed.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public');
const BASE = process.env.BASE || 'http://localhost:8080';
const HEADLESS = process.env.HEADLESS !== 'false';

const W = 1200;
const H = 630;

const browser = await chromium.launch({ headless: HEADLESS });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
// Suppress the welcome modal and cookie banner for a clean capture, and unlock
// Pro via the dev-only override so the forecast renders the trajectory chart
// rather than the Pro upsell gate (Forecast is a Pro feature; the demo seed is
// free-tier). The override is honoured only under `import.meta.env.DEV`.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
    localStorage.setItem('quantive_analytics_consent', 'denied');
    localStorage.setItem('quantive-test-plan', 'pro');
  } catch {
    /* storage unavailable — banners will show, capture still works */
  }
});

const page = await ctx.newPage();
// /demo seeds mock data (in-memory) then redirects into the app. The seed lives
// in React state, not localStorage, so reaching /forecast must be a client-side
// nav (sidebar click) — a full page.goto reload would drop the demo data and
// land on the empty state.
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 30_000 });
const demoBtn = page.getByRole('button', { name: /try demo/i });
if (await demoBtn.isVisible({ timeout: 2000 }).catch(() => false)) await demoBtn.click();
await page.waitForSelector('[id="performance"]', { timeout: 10_000 }).catch(() => null);
await page.getByRole('link', { name: /^forecast/i }).first().click();
await page.waitForURL(/forecast/, { timeout: 10_000 });
await page.waitForSelector('.q-grid--3', { timeout: 10_000 }); // percentile cards rendered
await page.waitForTimeout(2800); // entrance animation + chart draw

// Hide the fixed demo banner so it can't overlap the captured content, and read
// the app background so the letterbox margins match seamlessly.
// Hide the sticky topbar (it overlaps the heading in an element capture) and the
// footer, plus the demo banner, so only the forecast content remains.
await page.addStyleTag({ content: '.q-topbar,.q-footer,footer,[aria-label="Demo data notice"]{display:none!important}' });
const bg = await page.evaluate(() => {
  const el = document.querySelector('.q-app') || document.body;
  return getComputedStyle(el).backgroundColor || '#0a0a0a';
});

// Capture only the forecast content (heading + chart + percentile cards),
// excluding the sidebar/topbar chrome — the original og-image's composition.
const content = page.locator('#main-content');
const png = await content.screenshot();

const encoder = await ctx.newPage();
await encoder.goto('about:blank');
const jpgB64 = await encoder.evaluate(async ({ b64, w, h, bg }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d');
  cx.fillStyle = bg;
  cx.fillRect(0, 0, w, h);
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  // Contain the content within the 1200×630 frame with a small margin.
  const pad = 0.94;
  const scale = Math.min((w * pad) / img.naturalWidth, (h * pad) / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  cx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return cv.toDataURL('image/jpeg', 0.85).split(',')[1];
}, { b64: png.toString('base64'), w: W, h: H, bg });
await browser.close();

const out = path.join(outDir, 'og-image.jpg');
fs.writeFileSync(out, Buffer.from(jpgB64, 'base64'));
console.log(`og-image.jpg ${(fs.statSync(out).size / 1024).toFixed(0)} KB (${W}×${H})`);
