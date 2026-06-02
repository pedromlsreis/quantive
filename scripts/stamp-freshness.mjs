// Stamps the current date into the freshness signals that answer engines and
// search crawlers read: the `dateModified` fields in the index.html JSON-LD
// and the homepage <lastmod> in sitemap.xml.
//
// Run from the pre-commit hook (see .husky/pre-commit). It only stamps when the
// *staged* changes actually touch the homepage's own content — the meta /
// JSON-LD in index.html, the landing page, or its sections. A commit that only
// touches backend code, tests, other pages, or shared chrome (footer, nav)
// leaves the dates alone, so `dateModified` keeps signalling a real content
// change rather than "last commit". The per-page <lastmod> entries for
// /pricing, /security, /privacy, /terms, /impressum stay hand-managed for the
// same reason.
//
// When it does stamp, it re-stages index.html and sitemap.xml so the refreshed
// date lands in the same commit that changed the homepage — no "one commit
// behind" drift.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

// A changed file counts as a homepage content change if it owns part of what
// the homepage renders. Deliberately excludes shared chrome (Footer, nav) and
// global CSS: those aren't homepage-specific, so attributing their edits to the
// homepage's freshness would be both misleading and inconsistent with the
// hand-managed dates on the other pages.
function isHomepageContent(file) {
  return (
    file === 'index.html' ||
    file === 'src/pages/LandingPage.tsx' ||
    file.startsWith('src/components/landing/')
  );
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

// Paths staged for the pending commit, relative to the repo root.
function stagedFiles() {
  const out = git(['diff', '--cached', '--name-only']);
  return out ? out.split('\n').filter(Boolean) : [];
}

async function stampIndexHtml() {
  const file = path.join(root, 'index.html');
  const src = await readFile(file, 'utf8');
  const out = src.replace(/"dateModified":\s*"\d{4}-\d{2}-\d{2}"/g, `"dateModified": "${today}"`);
  if (out !== src) {
    await writeFile(file, out, 'utf8');
    console.log(`  ✓ index.html dateModified → ${today}`);
    return true;
  }
  console.log('  · index.html dateModified already current');
  return false;
}

async function stampSitemap() {
  const file = path.join(root, 'public', 'sitemap.xml');
  const src = await readFile(file, 'utf8');
  // Only the homepage entry (<loc>…app/</loc>) is auto-stamped.
  const out = src.replace(
    /(<loc>https:\/\/usequantive\.app\/<\/loc>\s*<lastmod>)\d{4}-\d{2}-\d{2}(<\/lastmod>)/,
    `$1${today}$2`,
  );
  if (out !== src) {
    await writeFile(file, out, 'utf8');
    console.log(`  ✓ sitemap.xml homepage lastmod → ${today}`);
    return true;
  }
  console.log('  · sitemap.xml homepage lastmod already current');
  return false;
}

if (!stagedFiles().some(isHomepageContent)) {
  console.log('  · stamp:freshness skipped — no homepage content staged');
} else {
  const wrote = [];
  if (await stampIndexHtml()) wrote.push('index.html');
  if (await stampSitemap()) wrote.push(path.join('public', 'sitemap.xml'));
  // Fold the refreshed dates into the commit that changed the homepage.
  if (wrote.length) git(['add', ...wrote]);
}
