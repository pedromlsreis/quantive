// Re-captures the landing video poster (public/landing/dashboard.webp): the
// dashboard overview rendered with the /demo seed data at 1440×900 @2x.
//
// Run whenever the dashboard or app chrome changes visibly, together with
// record-landing-tour.mjs so the poster and the clip stay in sync.
//
// Prereqs: dev server running (`npm run dev`; override the origin with BASE).
// The PNG → WebP encode happens in the Chromium canvas, so no image tooling
// is needed. Headed launch is deliberate: headless rendering takes a slightly
// different font/AA path and the capture should match what users see.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'landing');
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
// Suppress the welcome modal and cookie banner for a clean capture.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
    localStorage.setItem('quantive_analytics_consent', 'denied');
  } catch {
    /* storage unavailable — banners will show, capture still works */
  }
});

const page = await ctx.newPage();
// /demo seeds mock data then redirects to /dashboard.
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(2600); // entrance animation + chart draw + stagger

const png = await page.screenshot();

const encoder = await ctx.newPage();
await encoder.goto('about:blank');
const webpB64 = await encoder.evaluate(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  cv.getContext('2d').drawImage(img, 0, 0);
  return cv.toDataURL('image/webp', 0.82).split(',')[1];
}, png.toString('base64'));
await browser.close();

const out = path.join(outDir, 'dashboard.webp');
fs.writeFileSync(out, Buffer.from(webpB64, 'base64'));
console.log(`dashboard.webp ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
