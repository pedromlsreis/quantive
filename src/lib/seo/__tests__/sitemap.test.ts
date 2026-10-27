import { describe, expect, it } from 'vitest';
import sitemap from '../../../../public/sitemap.xml?raw';
import robots from '../../../../public/robots.txt?raw';
import llms from '../../../../public/llms.txt?raw';
import indexHtml from '../../../../index.html?raw';
import { CHANGELOG } from '@/content/changelog';
import { BASE_URL, PUBLIC_ROUTES, canonicalFor } from '../routeMeta';

// Every <loc> is the site plus the route ("/" keeps its trailing slash).
const locFor = (path: string) => `${BASE_URL}${path}`;

function lastmodOf(loc: string): string | undefined {
  const escaped = loc.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return sitemap.match(new RegExp(`<loc>${escaped}</loc>\\s*<lastmod>(\\d{4}-\\d{2}-\\d{2})</lastmod>`))?.[1];
}

describe('public/sitemap.xml', () => {
  it('lists exactly the public routes from routeMeta', () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
    expect(locs).toEqual(PUBLIC_ROUTES.map((r) => locFor(r.path)).sort());
  });

  it('gives every route a lastmod', () => {
    for (const route of PUBLIC_ROUTES) expect(lastmodOf(locFor(route.path))).toBeDefined();
  });

  // scripts/stamp-freshness.mjs keeps this in step when changelog.ts is staged;
  // this catches a commit made with --no-verify.
  it('dates /changelog by its newest entry', () => {
    expect(lastmodOf(locFor('/changelog'))).toBe(CHANGELOG[0].date);
  });
});

describe('robots.txt, llms.txt and the index.html JSON-LD', () => {
  // Value: protects=robots.txt blocks /email-updates but no sitemap route; llms.txt and the SoftwareApplication JSON-LD link the canonical /changelog URL;
  // fails_when=a robots.txt rewrite drops the line or blocks a public route by prefix, or an edit drops or breaks the changelog link in llms.txt or the JSON-LD;
  // why_new=faqs.test parses only the FAQPage node; no test reads robots.txt or llms.txt, or checks releaseNotes;
  // seam=none; no_claim=does not check how crawlers or answer engines act on these files, or the meta tags /email-updates serves
  it('keep the email-updates page out of crawls and point answer engines at the changelog', () => {
    // Disallow values are path prefixes.
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
    const blocked = (path: string) => disallowed.some((prefix) => path.startsWith(prefix));
    expect(blocked('/email-updates')).toBe(true);
    for (const route of PUBLIC_ROUTES) expect(blocked(route.path), route.path).toBe(false);

    const changelog = canonicalFor('/changelog');
    expect(llms).toContain(`](${changelog})`);
    const nodes = [...indexHtml.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
      const block = JSON.parse(m[1]);
      return block['@graph'] ?? [block];
    });
    expect(nodes.find((node) => node['@type'] === 'SoftwareApplication')?.releaseNotes).toBe(changelog);
  });
});
