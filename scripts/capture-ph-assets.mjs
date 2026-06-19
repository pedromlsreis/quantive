// Captures the two Product Hunt gallery assets into quantive-internal/docs/marketing/assets/.
// Desktop: dashboard /demo seed at 1270×760.
// Mobile:  same /demo seed at 390×844 (iPhone 14), then composited centred on a
//          1270×760 dark (#111111) canvas.
//
// Prereqs: dev server running on http://localhost:8080.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE   = process.env.BASE || 'http://localhost:8080';
const OUTDIR = 'c:/Users/pedro/Documents/Trials-and-Tribulations/quantive/quantive-internal/docs/marketing/assets';

const PH_W = 1270, PH_H = 760;

// ── helpers ────────────────────────────────────────────────────────────────

async function seedDemo(page) {
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle', timeout: 30_000 });
  const btn = page.getByRole('button', { name: /try demo/i });
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) await btn.click();
  await page.waitForSelector('[id="performance"]', { timeout: 10_000 }).catch(() => null);
  await page.waitForTimeout(2800); // animation + charts
}

async function suppressChrome(page) {
  await page.addStyleTag({
    content: '.q-topbar,.q-footer,footer,[aria-label="Demo data notice"]{display:none!important}',
  });
}

async function toPng(ctx, srcB64, outW, outH, compositeOnDark = false) {
  const enc = await ctx.newPage();
  await enc.goto('about:blank');
  const result = await enc.evaluate(
    async ({ b64, outW, outH, compositeOnDark }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = outW; cv.height = outH;
      const cx = cv.getContext('2d');
      if (compositeOnDark) {
        cx.fillStyle = '#111111';
        cx.fillRect(0, 0, outW, outH);
        // centre the mobile screenshot
        const scale = Math.min(outW / img.naturalWidth, outH / img.naturalHeight) * 0.92;
        const dw = img.naturalWidth  * scale;
        const dh = img.naturalHeight * scale;
        const dx = (outW - dw) / 2;
        const dy = (outH - dh) / 2;
        cx.drawImage(img, dx, dy, dw, dh);
      } else {
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, 0, 0, outW, outH);
      }
      return cv.toDataURL('image/png', 1.0).split(',')[1];
    },
    { b64: srcB64, outW, outH, compositeOnDark },
  );
  await enc.close();
  return result;
}

// ── desktop (1270×760) ─────────────────────────────────────────────────────

const browser = await chromium.launch({ headless: true });

{
  const ctx = await browser.newContext({
    viewport: { width: PH_W, height: PH_H },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
      localStorage.setItem('quantive_analytics_consent', 'denied');
      sessionStorage.setItem('quantive.demoBanner.dismissed', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  await seedDemo(page);
  await suppressChrome(page);
  const raw = await page.screenshot();
  const b64 = await toPng(ctx, raw.toString('base64'), PH_W, PH_H, false);
  const out = path.join(OUTDIR, 'quantive-demo-desktop.png');
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`quantive-demo-desktop.png  ${(fs.statSync(out).size / 1024).toFixed(0)} KB  (${PH_W}×${PH_H})`);
  await ctx.close();
}

// ── mobile (390×844 → composited on 1270×760 dark canvas) ─────────────────

{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('finance-cockpit-welcome-dismissed', 'true');
      localStorage.setItem('quantive_analytics_consent', 'denied');
      sessionStorage.setItem('quantive.demoBanner.dismissed', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  await seedDemo(page);
  const raw = await page.screenshot();
  const b64 = await toPng(ctx, raw.toString('base64'), PH_W, PH_H, true);
  const out = path.join(OUTDIR, 'quantive-demo-mobile.png');
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`quantive-demo-mobile.png   ${(fs.statSync(out).size / 1024).toFixed(0)} KB  (${PH_W}×${PH_H} composited)`);
  await ctx.close();
}

await browser.close();
