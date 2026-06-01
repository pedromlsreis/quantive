// Stamps the current date into the freshness signals that answer engines and
// search crawlers read: the `dateModified` fields in the index.html JSON-LD
// and the homepage <lastmod> in sitemap.xml.
//
// Run from the pre-push hook (see .husky/pre-push) so a push that ships
// marketing/content changes also refreshes these dates. It only touches the
// homepage lastmod and the schema dateModified — the per-page <lastmod> entries
// for /pricing, /security, /privacy, /terms, /impressum stay hand-managed so
// they keep reflecting real edits rather than every push.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

async function stampIndexHtml() {
  const file = path.join(root, 'index.html');
  const src = await readFile(file, 'utf8');
  const out = src.replace(/"dateModified":\s*"\d{4}-\d{2}-\d{2}"/g, `"dateModified": "${today}"`);
  if (out !== src) {
    await writeFile(file, out, 'utf8');
    console.log(`  ✓ index.html dateModified → ${today}`);
  } else {
    console.log('  · index.html dateModified already current');
  }
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
  } else {
    console.log('  · sitemap.xml homepage lastmod already current');
  }
}

await stampIndexHtml();
await stampSitemap();
