import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES } from '@/lib/seo/routeMeta';
import prerenderScript from '../../../scripts/prerender.mjs?raw';
import { PUBLIC_ROUTES_BY_PATH, preloadPublicRoute, publicRouteFor } from '../publicRoutes';

describe('public route preloading', () => {
  it('covers exactly the public routes from routeMeta', () => {
    expect(Object.keys(PUBLIC_ROUTES_BY_PATH).sort()).toEqual(PUBLIC_ROUTES.map((r) => r.path).sort());
  });

  it('covers exactly the routes scripts/prerender.mjs snapshots', () => {
    const list = prerenderScript.match(/const ROUTES = \[([^\]]*)\]/)?.[1] ?? '';
    const prerendered = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(Object.keys(PUBLIC_ROUTES_BY_PATH).sort()).toEqual(prerendered.sort());
  });

  it('matches with or without a trailing slash, and nothing else', () => {
    expect(publicRouteFor('/pricing/')).toBe(PUBLIC_ROUTES_BY_PATH['/pricing']);
    expect(publicRouteFor('/')).toBe(PUBLIC_ROUTES_BY_PATH['/']);
    expect(publicRouteFor('/dashboard')).toBeUndefined();
    expect(publicRouteFor('/constructor')).toBeUndefined();
    expect(publicRouteFor('/pricing/extra')).toBeUndefined();
  });

  it('resolves immediately for routes that are not prerendered', async () => {
    await expect(preloadPublicRoute('/dashboard')).resolves.toBeUndefined();
  });
});
