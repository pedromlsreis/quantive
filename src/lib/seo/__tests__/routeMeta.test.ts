import { describe, it, expect } from 'vitest';
import {
  BASE_URL,
  DEFAULT_TITLE,
  DEFAULT_DESC,
  PUBLIC_ROUTES,
  getRouteMeta,
  canonicalFor,
} from '@/lib/seo/routeMeta';

// Read by both usePageMeta (runtime) and the seo-route-html plugin (build), so
// the static and client heads stay in sync. These tests lock the lookup and
// canonical-URL rules both depend on.
describe('getRouteMeta', () => {
  it('returns the exact metadata for a known public route', () => {
    const meta = getRouteMeta('/pricing');
    expect(meta.path).toBe('/pricing');
    expect(meta.title).toBe('Pricing - Quantive');
    expect(meta.description).toContain('free forever');
  });

  it('returns the home defaults for the root path', () => {
    const meta = getRouteMeta('/');
    expect(meta.title).toBe(DEFAULT_TITLE);
    expect(meta.description).toBe(DEFAULT_DESC);
  });

  it('falls back to home defaults for an unknown path (e.g. an app route)', () => {
    const meta = getRouteMeta('/dashboard');
    expect(meta.title).toBe(DEFAULT_TITLE);
    expect(meta.description).toBe(DEFAULT_DESC);
    // Echoes the requested path so callers can still set canonical.
    expect(meta.path).toBe('/dashboard');
  });

  it('does not match on a trailing slash (lookup is exact)', () => {
    expect(getRouteMeta('/pricing/').title).toBe(DEFAULT_TITLE);
  });

  it.each(PUBLIC_ROUTES.map((r) => r.path))(
    'round-trips the registered route %s to its own metadata',
    (path) => {
      const meta = getRouteMeta(path);
      const expected = PUBLIC_ROUTES.find((r) => r.path === path)!;
      expect(meta).toEqual(expected);
    },
  );
});

describe('canonicalFor', () => {
  it('renders root with no trailing slash (matches index.html)', () => {
    expect(canonicalFor('/')).toBe(BASE_URL);
    expect(canonicalFor('/')).not.toMatch(/\/$/);
  });

  it('appends a non-root path to the base URL', () => {
    expect(canonicalFor('/pricing')).toBe(`${BASE_URL}/pricing`);
    expect(canonicalFor('/security')).toBe('https://usequantive.app/security');
  });

  it('produces an absolute https URL for every public route', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(canonicalFor(route.path)).toMatch(/^https:\/\/usequantive\.app/);
    }
  });
});

describe('PUBLIC_ROUTES integrity', () => {
  it('has unique paths (no duplicate route entries)', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every route a non-empty title and description', () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.title.length).toBeGreaterThan(0);
      expect(route.description.length).toBeGreaterThan(0);
    }
  });
});
