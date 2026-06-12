// Re-records the landing tour clip (public/landing/tour.mp4 + tour.webm):
// dashboard overview scrolling to the end, the allocations view cycling
// treemap → bars → donut, then the forecast and performance pages.
//
// Run whenever those screens change visibly, together with
// capture-landing-poster.mjs so the clip and its poster stay in sync.
//
// Prereqs: dev server running (`npm run dev`; override the origin with BASE)
// and ffmpeg on PATH (`scoop install ffmpeg`). Playwright records the whole
// session to a raw webm; the lazy-route pre-warm at the start is trimmed off
// by encoding from the measured offset. Headed launch is deliberate: headless
// rendering takes a slightly different font/AA path and the clip should match
// what users see.
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

async function nav(page, name, hold = 1600) {
  await page.getByRole('link', { name }).first().click({ timeout: 6000 });
  await page.waitForTimeout(hold);
}

// Eased scroll to the bottom of the page, so the recording pans smoothly
// instead of jumping.
async function smoothScroll(page, ms) {
  await page.evaluate(async (ms) => {
    const start = window.scrollY;
    const end = document.documentElement.scrollHeight - window.innerHeight;
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
  }, ms);
}

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1200, height: 760 },
  recordVideo: { dir: rawDir, size: { width: 1200, height: 760 } },
});
// Suppress the welcome modal and cookie banner for a clean recording.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
    localStorage.setItem('quantive_analytics_consent', 'denied');
  } catch {
    /* storage unavailable — banners will show, recording still works */
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
const tabs = page.locator('.q-tab');
if ((await tabs.count()) >= 3) {
  await tabs.nth(0).click();
  await page.waitForTimeout(1200);
  await tabs.nth(1).click();
  await page.waitForTimeout(1500);
  await tabs.nth(2).click();
  await page.waitForTimeout(1500);
  await tabs.nth(0).click();
  await page.waitForTimeout(1000);
}
await nav(page, /forecast/i, 2400);
await nav(page, /performance/i, 2400);
await page.waitForTimeout(400);

const rawPath = await page.video().path();
await ctx.close();
await browser.close();

// 1100 px wide is what the landing layout renders; CRF values tuned to keep
// each encode well under 1 MB.
const vf = 'scale=1100:-2,fps=30';
const common = ['-y', '-ss', offset, '-i', rawPath, '-vf', vf, '-an'];
execFileSync('ffmpeg', [...common, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', path.join(outDir, 'tour.mp4')], { stdio: 'ignore' });
execFileSync('ffmpeg', [...common, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', path.join(outDir, 'tour.webm')], { stdio: 'ignore' });

for (const f of ['tour.mp4', 'tour.webm']) {
  console.log(`${f} ${(fs.statSync(path.join(outDir, f)).size / 1024).toFixed(0)} KB`);
}
