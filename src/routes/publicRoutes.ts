import { lazyRoute, type PreloadableRoute } from '@/lib/lazyRoute';

// The prerendered public pages (scripts/prerender.mjs ROUTES, routeMeta
// PUBLIC_ROUTES). App routes (routes/appRoutes.ts) are never preloaded before
// the first render, which would only delay it; NotFound stays on plain lazy().
export const LandingPage = lazyRoute(() => import('@/pages/LandingPage'));
export const PricingPage = lazyRoute(() => import('@/pages/PricingPage'));
export const SecurityPage = lazyRoute(() => import('@/pages/SecurityPage'));
export const PrivacyPolicy = lazyRoute(() => import('@/pages/PrivacyPolicy'));
export const TermsOfService = lazyRoute(() => import('@/pages/TermsOfService'));
export const Impressum = lazyRoute(() => import('@/pages/Impressum'));

export const PUBLIC_ROUTES_BY_PATH: Readonly<Record<string, PreloadableRoute>> = {
  '/': LandingPage,
  '/pricing': PricingPage,
  '/security': SecurityPage,
  '/privacy': PrivacyPolicy,
  '/terms': TermsOfService,
  '/impressum': Impressum,
};

/** The public route for a pathname, tolerating a trailing slash. */
export function publicRouteFor(pathname: string): PreloadableRoute | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return Object.prototype.hasOwnProperty.call(PUBLIC_ROUTES_BY_PATH, path)
    ? PUBLIC_ROUTES_BY_PATH[path]
    : undefined;
}

/**
 * Loads the current public page's chunk before the first render. Never
 * rejects: on failure the app renders anyway and lazy() retries the import
 * under the normal error boundary.
 */
export function preloadPublicRoute(pathname: string): Promise<void> {
  const route = publicRouteFor(pathname);
  return route ? route.preload().catch(() => undefined) : Promise.resolve();
}
