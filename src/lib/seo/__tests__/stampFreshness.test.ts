import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PUBLIC_ROUTES } from '../routeMeta';

// Runs the real pre-commit script against a scratch git repo. The script takes
// its own parent directory as the repo root, so a copy under <tmp>/scripts/
// reads and stamps only the fixtures below.
const SCRIPT = join(__dirname, '..', '..', '..', '..', 'scripts', 'stamp-freshness.mjs');
const SITE = 'https://usequantive.app';
const OLD = '2000-01-01';
const NEWEST_ENTRY = '2026-09-15';

const sitemapUrl = (route: string) =>
  `  <url>\n    <loc>${SITE}${route}</loc>\n    <lastmod>${OLD}</lastmod>\n  </url>\n`;

const FIXTURES: Record<string, string> = {
  'index.html': `<script type="application/ld+json">\n{ "@type": "WebPage", "dateModified": "${OLD}" }\n</script>\n`,
  'public/sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/pricing', '/changelog'].map(sitemapUrl).join('')}</urlset>\n`,
  'src/content/changelog.ts': `export const CHANGELOG = [\n  { id: 'newer', date: '${NEWEST_ENTRY}' },\n  { id: 'older', date: '2026-08-01' },\n];\n`,
  'src/pages/PricingPage.tsx': 'export default function PricingPage() { return null; }\n',
  'src/components/landing/EmailCapture.tsx': 'export function EmailCapture() { return null; }\n',
  'src/components/landing/PublicFooter.tsx': 'export function PublicFooter() { return null; }\n',
  'src/components/landing/__tests__/EmailCapture.test.tsx': "it('renders', () => {});\n",
  'src/lib/billing/planCopy.ts': "export const PRICING_HEADLINE = '';\n",
  'supabase/functions/email-list/index.ts': 'Deno.serve(() => new Response());\n',
};

let repo: string;

// The pre-push hook runs this suite, and Git can export GIT_DIR, GIT_INDEX_FILE
// or GIT_WORK_TREE to hooks. Inherited, they would point these commands (and the
// script's own git calls) at the real repository instead of the scratch one.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const read = (file: string) => readFileSync(join(repo, file), 'utf8');
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', env }).trim();
const utcToday = () => new Date().toISOString().slice(0, 10);

function lastmod(route: string, sitemap = read('public/sitemap.xml')): string | undefined {
  const loc = `${SITE}${route}`.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return sitemap.match(new RegExp(`<loc>${loc}</loc>\\s*<lastmod>(\\d{4}-\\d{2}-\\d{2})</lastmod>`))?.[1];
}

/** Resets the fixtures and the index, stages only `files`, runs `afterStaging`, then runs the hook script. */
function runHookWithStaged(files: string[], afterStaging?: () => void) {
  git('read-tree', '--empty');
  for (const [file, content] of Object.entries(FIXTURES)) writeFileSync(join(repo, file), content);
  git('add', '--', ...files);
  afterStaging?.();
  const before = utcToday();
  execFileSync(process.execPath, [join('scripts', 'stamp-freshness.mjs')], { cwd: repo, encoding: 'utf8', env });
  return { today: [before, utcToday()], staged: git('diff', '--cached', '--name-only').split('\n') };
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'stamp-freshness-'));
  for (const file of [...Object.keys(FIXTURES), 'scripts/stamp-freshness.mjs']) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
  }
  copyFileSync(SCRIPT, join(repo, 'scripts', 'stamp-freshness.mjs'));
  git('init', '-q');
  // Fixtures are compared byte for byte; keep a system-wide autocrlf out of it.
  git('config', 'core.autocrlf', 'false');
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
});

describe('scripts/stamp-freshness.mjs', () => {
  // Value: protects=the pre-commit stamp dates only pages whose source is staged: /pricing or / get today (UTC), /changelog its newest entry, backend nothing;
  // fails_when=a PAGE_SOURCES or regex edit stamps every page, gives /changelog today's date, skips re-staging, or rewrites files on a backend-only commit;
  // why_new=sitemap.test only reads the committed /changelog lastmod; nothing runs this script, which rewrites committed files on every commit;
  // seam=none; no_claim=does not cover the /security or legal-page sources, or the husky wiring; dates come from the machine clock in UTC
  it('stamps only the pages whose own source is staged, and re-stages what it rewrites', () => {
    const pricing = runHookWithStaged(['src/pages/PricingPage.tsx']);
    expect(pricing.today, 'pricing: /pricing lastmod').toContain(lastmod('/pricing'));
    expect([lastmod('/'), lastmod('/changelog')], 'pricing: other routes').toEqual([OLD, OLD]);
    expect(read('index.html'), 'pricing: index.html').toBe(FIXTURES['index.html']);
    expect(pricing.staged, 'pricing: re-staged').toEqual(['public/sitemap.xml', 'src/pages/PricingPage.tsx']);

    runHookWithStaged(['src/content/changelog.ts']);
    expect(lastmod('/changelog'), 'changelog: newest entry date, not today').toBe(NEWEST_ENTRY);
    expect([lastmod('/'), lastmod('/pricing')], 'changelog: other routes').toEqual([OLD, OLD]);
    expect(read('index.html'), 'changelog: index.html').toBe(FIXTURES['index.html']);

    const home = runHookWithStaged(['src/components/landing/EmailCapture.tsx']);
    expect(home.today, 'homepage: / lastmod').toContain(lastmod('/'));
    expect(home.today.map((d) => `"dateModified": "${d}"`), 'homepage: JSON-LD dateModified').toContain(
      read('index.html').match(/"dateModified": "\d{4}-\d{2}-\d{2}"/)?.[0],
    );
    expect([lastmod('/pricing'), lastmod('/changelog')], 'homepage: other routes').toEqual([OLD, OLD]);
    expect(home.staged, 'homepage: re-staged').toEqual(['index.html', 'public/sitemap.xml', 'src/components/landing/EmailCapture.tsx']);

    const backend = runHookWithStaged(['supabase/functions/email-list/index.ts']);
    expect(read('public/sitemap.xml'), 'backend: sitemap').toBe(FIXTURES['public/sitemap.xml']);
    expect(read('index.html'), 'backend: index.html').toBe(FIXTURES['index.html']);
    expect(backend.staged, 'backend: staged').toEqual(['supabase/functions/email-list/index.ts']);
  });

  // Value: protects=shared chrome and tests date no page; fails_when=the homepage matcher widens back to src/components/landing/ or stops skipping tests;
  // why_new=the first case stages only page sources and a backend file; seam=none; no_claim=does not list every shared component
  it('leaves every date alone when only shared chrome or a test is staged', () => {
    for (const file of ['src/components/landing/PublicFooter.tsx', 'src/components/landing/__tests__/EmailCapture.test.tsx']) {
      const run = runHookWithStaged([file]);
      expect(read('index.html'), file).toBe(FIXTURES['index.html']);
      expect(read('public/sitemap.xml'), file).toBe(FIXTURES['public/sitemap.xml']);
      expect(run.staged, file).toEqual([file]);
    }
  });

  // Value: protects=the shared plan copy dates both pages that show it; fails_when=planCopy.ts drops out of either page's sources;
  // why_new=no other case stages a source two pages share; seam=none; no_claim=does not cover plans.ts or RollingFigure
  it('stamps the homepage and /pricing when the shared plan copy is staged', () => {
    const run = runHookWithStaged(['src/lib/billing/planCopy.ts']);
    expect(run.today, 'planCopy: / lastmod').toContain(lastmod('/'));
    expect(run.today, 'planCopy: /pricing lastmod').toContain(lastmod('/pricing'));
    expect(lastmod('/changelog'), 'planCopy: /changelog').toBe(OLD);
  });

  // Value: protects=a stamp never carries an unstaged edit to the sitemap into the commit; fails_when=the script edits the working file and stages it whole again;
  // why_new=every other case starts with the sitemap absent from the index; seam=none; no_claim=does not repeat the case for index.html, which takes the same path
  it('stamps the staged sitemap and leaves an unstaged edit to it out of the commit', () => {
    const draft = FIXTURES['public/sitemap.xml'].replace(`${SITE}/changelog`, `${SITE}/draft`);
    const run = runHookWithStaged(['public/sitemap.xml', 'src/pages/PricingPage.tsx'], () =>
      writeFileSync(join(repo, 'public/sitemap.xml'), draft),
    );
    // Untrimmed, so a lost final newline in the staged blob fails too.
    const committed = execFileSync('git', ['cat-file', 'blob', ':public/sitemap.xml'], { cwd: repo, encoding: 'utf8', env });
    const pricingAt = (date: string) =>
      FIXTURES['public/sitemap.xml'].replace(`${SITE}/pricing</loc>\n    <lastmod>${OLD}`, `${SITE}/pricing</loc>\n    <lastmod>${date}`);
    expect(run.today.map(pricingAt), 'staged: only the /pricing date changed').toContain(committed);
    expect(run.today, 'working copy: /pricing lastmod').toContain(lastmod('/pricing'));
    expect(read('public/sitemap.xml'), 'working copy: the unstaged edit').toContain(`${SITE}/draft`);
  });

  // Value: protects=every public route but /changelog has sources that date it; fails_when=a new public route ships without a PAGE_SOURCES entry, so its lastmod never moves;
  // why_new=sitemap.test only checks that a lastmod exists; seam=none; no_claim=does not check that the listed files exist
  it('gives every public route except /changelog its own sources', () => {
    const map = readFileSync(SCRIPT, 'utf8').match(/const PAGE_SOURCES = \{([\s\S]*?)\n\};/)?.[1] ?? '';
    const routes = [...map.matchAll(/^ {2}'(\/[^']*)':/gm)].map((m) => m[1]);
    expect(routes.sort()).toEqual(PUBLIC_ROUTES.map((r) => r.path).filter((p) => p !== '/changelog').sort());
  });
});
