import type { Plugin } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PUBLIC_ROUTES, canonicalFor } from '../src/lib/seo/routeMeta';

// Build-time SEO, no headless browser.
//
// After Vite emits dist/index.html (the SPA shell), this writes a per-route copy
// for each public route with route-specific <title>, meta description, canonical,
// and Open Graph / Twitter tags baked into the served HTML. Cloudflare Pages then
// serves dist/pricing/index.html for /pricing, so a crawler that never runs
// JavaScript still gets the right head instead of the homepage's tags on every
// route (which is what makes Google treat the pages as duplicates of the home
// page today).
//
// It deliberately does NOT server-render the React body. The body stays the SPA
// shell that boots and hydrates on load. Server-rendering this app would mean
// making AuthProvider, KeySessionProvider, supabase, and analytics all SSR-safe,
// which is a permanent maintenance cost out of proportion to the gain for six
// mostly-static pages. The metadata comes from src/lib/seo/routeMeta.ts, the same
// source usePageMeta uses at runtime, so the static head and the client-rendered
// head always agree. For a richer pass that also captures body content, the
// optional browser-based scripts/prerender.mjs can run on top in CI.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Replace the value inside a tag matched by `prefix"..."`, leaving the rest. */
function replaceAttr(html: string, prefix: string, value: string): string {
  const re = new RegExp(`(${prefix})[^"]*(")`);
  return html.replace(re, `$1${value}$2`);
}

export function seoRouteHtml(): Plugin {
  return {
    name: 'seo-route-html',
    apply: 'build',
    async writeBundle(options) {
      const outDir = options.dir ?? 'dist';
      const shell = await readFile(path.join(outDir, 'index.html'), 'utf8');

      for (const route of PUBLIC_ROUTES) {
        // index.html already carries the home metadata.
        if (route.path === '/') continue;

        const title = escapeHtml(route.title);
        const description = escapeHtml(route.description);
        const canonical = canonicalFor(route.path);

        let html = shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
        html = replaceAttr(html, '<meta name="description" content="', description);
        html = replaceAttr(html, '<link rel="canonical" href="', canonical);
        html = replaceAttr(html, '<meta property="og:url" content="', canonical);
        html = replaceAttr(html, '<meta property="og:title" content="', title);
        html = replaceAttr(html, '<meta property="og:description" content="', description);
        html = replaceAttr(html, '<meta name="twitter:title" content="', title);
        html = replaceAttr(html, '<meta name="twitter:description" content="', description);

        const outFile = path.join(outDir, route.path.replace(/^\//, ''), 'index.html');
        await mkdir(path.dirname(outFile), { recursive: true });
        await writeFile(outFile, html, 'utf8');
        console.log(`  seo-route-html: wrote ${path.relative(outDir, outFile)}`);
      }
    },
  };
}
