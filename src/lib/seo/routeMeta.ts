// Single source of truth for per-route SEO metadata.
//
// Consumed in two places that must always agree:
//   1. usePageMeta (runtime): updates the document head client-side once the
//      SPA boots, so in-app navigation and Googlebot's rendered view are right.
//   2. The seo-route-html Vite plugin (build time): bakes these tags into a
//      static per-route index.html, so crawlers that do not execute JavaScript
//      (most AI answer engines, and the first search-engine crawl) get the right
//      title, description, and canonical without having to render the app.
//
// Because both read from here, the static head and the client-rendered head can
// never drift apart. Keep this list in sync with the public routes in
// src/App.tsx, the <loc> entries in public/sitemap.xml, and scripts/prerender.mjs.

export const BASE_URL = 'https://usequantive.app';

export const DEFAULT_TITLE = 'Quantive - The net worth tracker that replaces your spreadsheet';
export const DEFAULT_DESC =
  'Quantive replaces the spreadsheet you keep across brokers, banks, and currencies. Enter or import balances; track net worth, allocation, and forecast, with no bank logins. End-to-end encrypted. Free forever.';

export interface RouteMeta {
  /** Canonical path, e.g. "/pricing". */
  path: string;
  title: string;
  description: string;
}

// Public, crawlable routes only. Auth-gated and in-app routes are deliberately
// absent: they render encrypted user data, must stay client-only, and must not
// be indexed (see robots.txt).
export const PUBLIC_ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
  },
  {
    path: '/pricing',
    title: 'Pricing - Quantive',
    description:
      'Quantive is free forever, with optional Pro for full history, forecasting, and exports. €9/month or €90/year.',
  },
  {
    path: '/security',
    title: 'Security & Encryption - Quantive',
    description:
      'Quantive encrypts your financial data on your device using XChaCha20-Poly1305 and Argon2id. The server only ever sees ciphertext. Learn how it works.',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy - Quantive',
    description:
      'Read the Quantive privacy policy. We store only encrypted data, use no advertising trackers, and collect only what is necessary to run the service.',
  },
  {
    path: '/terms',
    title: 'Terms of Service - Quantive',
    description:
      'Terms of Service for Quantive. Review our usage policies, acceptable use guidelines, and your rights as a user.',
  },
  {
    path: '/impressum',
    title: 'Impressum - Quantive',
    description:
      'Legal notice (Impressum) for Quantive, operated by Pedro Reis in Düsseldorf, Germany.',
  },
];

const ROUTE_BY_PATH: Record<string, RouteMeta> = Object.fromEntries(
  PUBLIC_ROUTES.map((r) => [r.path, r]),
);

/** Metadata for a public route, falling back to the home defaults if unknown. */
export function getRouteMeta(path: string): RouteMeta {
  return ROUTE_BY_PATH[path] ?? { path, title: DEFAULT_TITLE, description: DEFAULT_DESC };
}

/** Canonical URL for a path. Root has no trailing slash, matching index.html. */
export function canonicalFor(path: string): string {
  return path === '/' ? BASE_URL : `${BASE_URL}${path}`;
}
