// Re-records the landing tour clip (public/landing/tour.mp4 + tour.webm):
// the dashboard overview scrolling to the end, the allocations view switching
// treemap → bars, then the forecast page and the performance page scrolled
// down to "Highs and lows".
//
// Run whenever those screens change visibly, together with
// capture-landing-poster.mjs so the clip and its poster stay in sync. If the
// sequence changes, update the video's aria-label in
// src/pages/landing/TourVideo.tsx to describe it.
//
// Prereqs: dev server running (`npm run dev`; override the origin with BASE)
// and ffmpeg on PATH (`scoop install ffmpeg`). Playwright records the whole
// session to a raw webm; the lazy-route pre-warm at the start is trimmed off
// by encoding from the measured offset. Headed launch is deliberate: headless
// rendering takes a slightly different font/AA path and the clip should match
// what users see. Automation turns the app's CSS motion off, so the clip shows
// the static UI, as reduced-motion users see it.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'landing');
const BASE = process.env.BASE || 'http://localhost:8080';

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('ffmpeg not found on PATH — install it first (e.g. `scoop install ffmpeg`).');
  process.exit(1);
}

const rawDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantive-tour-'));

// Sidebar links only: overview sections also link to these routes.
async function nav(page, name, hold = 1600) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name }).click({ timeout: 6000 });
  await page.waitForTimeout(hold);
}

// Eased scroll, so the recording pans smoothly instead of jumping. Scrolls to
// the bottom, or to `selector` sitting `offset` px below the viewport top.
async function smoothScroll(page, ms, selector, offset = 72) {
  await page.evaluate(async ({ ms, selector, offset }) => {
    const start = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const el = selector ? document.querySelector(selector) : null;
    const end = el ? Math.min(max, start + el.getBoundingClientRect().top - offset) : max;
    const t0 = performance.now();
    await new Promise((res) => {
      function step(now) {
        const k = Math.min(1, (now - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        window.scrollTo(0, start + (end - start) * e);
        if (k < 1) requestAnimationFrame(step);
        else res();
      }
      requestAnimationFrame(step);
    });
  }, { ms, selector, offset });
}

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 760 },
  recordVideo: { dir: rawDir, size: { width: 1200, height: 760 } },
});
// Keep the consent banner out of the recording.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('quantive_analytics_consent', 'denied');
  } catch {
    /* storage unavailable — the banner will show, recording still works */
  }
});

const page = await ctx.newPage();
const t0 = Date.now();

// /demo seeds mock data then redirects to /dashboard.
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(3200);

// Pre-warm lazy routes + data (trimmed off below), then return to Overview.
await nav(page, /allocations/i, 1100);
await nav(page, /forecast/i, 1300);
await nav(page, /performance/i, 1300);
await nav(page, /overview/i, 1200);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(900);

// Everything before this point is cut; +0.25 s pads past the route settle.
const offset = ((Date.now() - t0) / 1000 + 0.25).toFixed(2);

// The tour itself.
await page.waitForTimeout(1100); // hold on overview top
await smoothScroll(page, 3600); // pan the dashboard to the bottom
await page.waitForTimeout(1100); // hold at bottom

await nav(page, /allocations/i, 1200);
const views = page.getByRole('tablist', { name: 'View mode' }).getByRole('tab');
// Treemap is the default view: hold on it, then show bars once.
await page.waitForTimeout(1500);
await views.filter({ hasText: /bars/i }).click();
await page.waitForTimeout(1800);

await nav(page, /forecast/i, 2400);

// Performance opens on the benchmark overlay; scroll to "Highs and lows",
// which sits below the fold.
await nav(page, /performance/i, 1400);
await smoothScroll(page, 2600, '#downside-title');
await page.waitForTimeout(1800);

const rawPath = await page.video().path();
await ctx.close();
await browser.close();

// 1100 px wide is what the landing layout renders; CRF values tuned to keep
// each encode well under 1 MB.
const vf = 'scale=1100:-2,fps=30';
const common = ['-y', '-ss', offset, '-i', rawPath, '-vf', vf, '-an'];
execFileSync('ffmpeg', [...common, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart', path.join(outDir, 'tour.mp4')], { stdio: 'ignore' });
execFileSync('ffmpeg', [...common, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', path.join(outDir, 'tour.webm')], { stdio: 'ignore' });

for (const f of ['tour.mp4', 'tour.webm']) {
  console.log(`${f} ${(fs.statSync(path.join(outDir, f)).size / 1024).toFixed(0)} KB`);
}
