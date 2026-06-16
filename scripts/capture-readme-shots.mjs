// Re-captures the README hero (public/images/dashboard.jpg) from the /demo seed
// data so it matches the current dashboard. Run whenever the dashboard or app
// chrome changes visibly. Mirrors the framing of capture-landing-poster.mjs but
// emits a JPEG sized for GitHub rendering.
//
// The other README image (public/images/recovery-code.png) shows the
// recovery-code modal, which needs an unlocked session to reach in the real app;
// it is refreshed manually rather than by this script.
//
// Prereqs: dev server running (`npm run dev`; override the origin with BASE).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:8080';
const OUT = process.env.OUT || path.join(root, 'public', 'images', 'dashboard.jpg');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
    localStorage.setItem('quantive_analytics_consent', 'denied');
    sessionStorage.setItem('quantive.demoBanner.dismissed', '1');
  } catch {
    /* storage unavailable — banners will show, capture still works */
  }
});

const page = await ctx.newPage();
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(2800); // entrance animation + chart draw + stagger

const png = await page.screenshot();

const encoder = await ctx.newPage();
await encoder.goto('about:blank');
const jpgB64 = await encoder.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  cv.getContext('2d').drawImage(img, 0, 0);
  return cv.toDataURL('image/jpeg', 0.86).split(',')[1];
}, png.toString('base64'));
await browser.close();

fs.writeFileSync(OUT, Buffer.from(jpgB64, 'base64'));
console.log(`${path.basename(OUT)} ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
