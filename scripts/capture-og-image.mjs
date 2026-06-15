// Re-captures the social share image (public/og-image.jpg): a designed editorial
// card — brand lockup + a Fraunces tagline + a faded product peek — rendered
// INSIDE the loaded app so the real design tokens and self-hosted brand fonts
// (Fraunces, JetBrains Mono, Geist) apply without any font-path wrangling.
//
// The 1200×630 output matches the og:image dimensions declared in index.html.
// Run whenever the brand lockup, tagline, or app visuals change.
//
// Prereqs: dev server running (`npm run dev`; override the origin with BASE).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public');
const BASE = process.env.BASE || 'http://localhost:8080';

const W = 1200;
const H = 630;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
    localStorage.setItem('quantive_analytics_consent', 'denied');
    localStorage.setItem('quantive-test-plan', 'pro'); // unlock the Pro forecast view for the peek
  } catch { /* storage unavailable — capture still works */ }
});

const page = await ctx.newPage();
await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 30_000 });
const demoBtn = page.getByRole('button', { name: /try demo/i });
if (await demoBtn.isVisible({ timeout: 2000 }).catch(() => false)) await demoBtn.click();
await page.waitForSelector('[id="performance"]', { timeout: 10_000 }).catch(() => null);

// Capture the forecast content (chrome-less) to use as the card's faded peek.
// Demo data is in-memory, so reach /forecast via a client-side nav (sidebar
// click) — a full reload would drop the seed and land on the empty state.
await page.addStyleTag({ content: '.q-topbar,.q-footer,footer,[aria-label="Demo data notice"]{display:none!important}' });
await page.getByRole('link', { name: /^forecast/i }).first().click();
await page.waitForURL(/forecast/, { timeout: 10_000 });
await page.waitForSelector('.q-grid--3', { timeout: 10_000 });
await page.waitForTimeout(2400); // entrance animation + chart draw
const peekPng = await page.locator('#main-content').screenshot();
const peekDataUrl = 'data:image/png;base64,' + peekPng.toString('base64');

// Render the card in the app context (tokens + fonts already loaded), then shoot it.
await page.evaluate((peek) => {
  document.body.innerHTML = `
    <div id="ogcard" style="
      position:fixed; inset:0; width:1200px; height:630px; overflow:hidden;
      background:var(--bg); color:var(--fg); box-sizing:border-box;
      font-family:var(--font-body); display:flex; flex-direction:column;
      padding:64px 72px;">
      <div style="position:absolute; top:-180px; right:-160px; width:680px; height:680px;
        background:radial-gradient(circle at center, var(--accent-raw), transparent 62%);
        opacity:.20; filter:blur(8px); pointer-events:none;"></div>
      <img src="${peek}" alt="" style="
        position:absolute; right:-120px; bottom:-40px; width:760px; border-radius:16px;
        transform:rotate(-3deg); opacity:.26;
        -webkit-mask-image:linear-gradient(100deg, transparent 0%, #000 55%);
                mask-image:linear-gradient(100deg, transparent 0%, #000 55%);
        pointer-events:none;"/>
      <div style="position:relative; display:flex; align-items:center; gap:14px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="var(--accent-raw)" stroke-width="1.6" fill="none"/>
          <line x1="14.2" y1="14.2" x2="20.5" y2="20.5" stroke="var(--accent-raw)" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="2.2" fill="var(--accent-raw)"/>
        </svg>
        <span style="font-family:var(--font-display); font-size:27px; letter-spacing:-.02em;">quantive</span>
      </div>
      <div style="position:relative; margin-top:auto;">
        <h1 style="font-family:var(--font-serif); font-weight:400; font-size:66px;
          line-height:1.05; letter-spacing:-.02em; margin:0; max-width:760px;">
          Net worth, <span style="color:var(--accent-raw);">end-to-end encrypted</span>.
        </h1>
        <p style="font-family:var(--font-mono); font-size:20px; color:var(--fg-muted);
          margin:22px 0 0; letter-spacing:-.01em;">
          The server only ever stores ciphertext · No bank connection · EU-hosted
        </p>
      </div>
      <div style="position:relative; margin-top:40px; display:flex; align-items:center; gap:16px;">
        <span style="font-family:var(--font-mono); font-size:20px; color:var(--fg-subtle);">usequantive.app</span>
        <span style="font-family:var(--font-mono); font-size:14px; padding:5px 12px; border-radius:999px;
          background:var(--accent-faint-raw); color:var(--accent-raw);
          border:1px solid var(--accent-soft-raw);">Free forever</span>
      </div>
    </div>`;
}, peekDataUrl);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const cardPng = await page.locator('#ogcard').screenshot(); // 2400×1260

const encoder = await ctx.newPage();
await encoder.goto('about:blank');
const jpgB64 = await encoder.evaluate(async ({ b64, w, h }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d');
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', 0.86).split(',')[1];
}, { b64: cardPng.toString('base64'), w: W, h: H });
await browser.close();

const out = path.join(outDir, 'og-image.jpg');
fs.writeFileSync(out, Buffer.from(jpgB64, 'base64'));
console.log(`og-image.jpg ${(fs.statSync(out).size / 1024).toFixed(0)} KB (${W}×${H})`);
