// Stamps the current date into the freshness signals that answer engines and
// search crawlers read, only for pages whose own content is staged:
//   - each public page in PAGE_SOURCES: its sitemap <lastmod>;
//   - the homepage also: the `dateModified` fields in the index.html JSON-LD;
//   - /changelog: its sitemap <lastmod> becomes the newest staged entry's date.
//
// Run from the pre-commit hook (see .husky/pre-commit). Shared chrome (footer,
// nav, page shell), tests and backend code own no page, so a commit that only
// touches them leaves every date alone and each date keeps signalling a real
// content change rather than "last commit". Every public route except
// /changelog needs a PAGE_SOURCES entry; stampFreshness.test.ts checks that.
//
// When it does stamp, it edits the staged copies of index.html and sitemap.xml
// so the refreshed date lands in the same commit that changed the page — no
// "one commit behind" drift — and an unstaged edit to either file stays out.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
const SITE = 'https://usequantive.app';
const CHANGELOG_FILE = 'src/content/changelog.ts';

// The files that own each public page's content. A trailing slash matches a
// whole directory. Shared chrome (PublicFooter, StickyNav, PublicPage) belongs
// to every page, so it dates none of them.
const PAGE_SOURCES = {
  '/': [
    'index.html',
    'src/pages/LandingPage.tsx',
    'src/pages/landing/',
    'src/components/landing/EmailCapture.tsx',
    'src/components/landing/RollingFigure.tsx',
    'src/lib/billing/planCopy.ts',
  ],
  '/pricing': [
    'src/pages/PricingPage.tsx',
    'src/components/landing/RollingFigure.tsx',
    'src/lib/billing/planCopy.ts',
    'src/lib/billing/plans.ts',
  ],
  '/security': ['src/pages/SecurityPage.tsx', 'src/pages/security/'],
  '/privacy': ['docs/legal/privacy-policy.md'],
  '/terms': ['docs/legal/terms-of-service.md'],
  '/impressum': ['docs/legal/impressum.md'],
};

const isTest = (file) => file.includes('/__tests__/') || /\.test\.[cm]?[jt]sx?$/.test(file);
const owns = (sources) => (file) =>
  !isTest(file) && sources.some((s) => (s.endsWith('/') ? file.startsWith(s) : file === s));

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

// Paths staged for the pending commit, relative to the repo root.
function stagedFiles() {
  const out = git(['diff', '--cached', '--name-only']);
  return out ? out.split('\n').filter(Boolean) : [];
}

/**
 * Applies `edit` to the staged copy of `rel` and, separately, to the working
 * copy, so an unstaged edit to the same file stays out of the commit. A file
 * the index doesn't have yet is staged whole. Returns whether the commit's
 * copy changed.
 */
async function stampFile(rel, edit) {
  const file = path.join(root, rel);
  const work = await readFile(file, 'utf8');
  const workOut = edit(work);
  if (workOut !== work) await writeFile(file, workOut, 'utf8');

  if (!git(['ls-files', '--', rel])) {
    if (workOut !== work) git(['add', '--', rel]);
    return workOut !== work;
  }
  // Untrimmed: the blob goes back into the index byte for byte.
  const staged = execFileSync('git', ['show', `:${rel}`], { cwd: root, encoding: 'utf8' });
  const stagedOut = edit(staged);
  if (stagedOut === staged) return false;
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: stagedOut, encoding: 'utf8' }).trim();
  const mode = git(['ls-files', '--stage', '--', rel]).split(' ')[0];
  git(['update-index', '--cacheinfo', `${mode},${blob},${rel}`]);
  return true;
}

/** The sitemap source with one route's <lastmod> set to `date`. */
function withLastmod(sitemap, route, date) {
  const escaped = `${SITE}${route}`.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`(<loc>${escaped}</loc>\\s*<lastmod>)\\d{4}-\\d{2}-\\d{2}(</lastmod>)`);
  return sitemap.replace(re, `$1${date}$2`);
}

// Read from the index, not the working tree: an entry drafted but not staged
// (a security fix waiting for its deploy) must not date this commit. Entries
// are newest first, so the first date in the file is the newest.
function newestChangelogDate() {
  return git(['show', `:${CHANGELOG_FILE}`]).match(/date:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1] ?? null;
}

const staged = stagedFiles();
const stamps = []; // [route, date]
for (const [route, sources] of Object.entries(PAGE_SOURCES)) {
  if (staged.some(owns(sources))) stamps.push([route, today]);
}
if (staged.includes(CHANGELOG_FILE)) {
  const newest = newestChangelogDate();
  if (newest) stamps.push(['/changelog', newest]);
}

if (!stamps.length) {
  console.log('  · stamp:freshness skipped — no page content staged');
} else {
  if (stamps.some(([route]) => route === '/')) {
    const stamped = await stampFile('index.html', (src) =>
      src.replace(/"dateModified":\s*"\d{4}-\d{2}-\d{2}"/g, `"dateModified": "${today}"`),
    );
    console.log(stamped ? `  ✓ index.html dateModified → ${today}` : '  · index.html dateModified already current');
  }

  const stamped = await stampFile('public/sitemap.xml', (src) =>
    stamps.reduce((xml, [route, date]) => withLastmod(xml, route, date), src),
  );
  console.log(
    stamped
      ? `  ✓ sitemap.xml lastmod → ${stamps.map(([route, date]) => `${route} ${date}`).join(', ')}`
      : '  · sitemap.xml lastmod already current',
  );
}
