import { lazyRoute, type PreloadableRoute } from '@/lib/lazyRoute';

// In-app pages. Unlike the public pages they are never preloaded before the
// first render; the shell prefetches a page's chunk on intent (pointer over,
// focus or touch on its nav link) so the route change itself doesn't suspend.
export const Index = lazyRoute(() => import('@/pages/Index'));
export const AllocationsPage = lazyRoute(() => import('@/pages/AllocationsPage'));
export const SourcesPage = lazyRoute(() => import('@/pages/SourcesPage'));
export const ForecastPage = lazyRoute(() => import('@/pages/ForecastPage'));
export const PerformancePage = lazyRoute(() => import('@/pages/PerformancePage'));
export const GoalsPage = lazyRoute(() => import('@/pages/GoalsPage'));
export const SettingsPage = lazyRoute(() => import('@/pages/SettingsPage'));

const APP_ROUTES_BY_PATH: Readonly<Record<string, PreloadableRoute>> = {
  '/dashboard': Index,
  '/allocations': AllocationsPage,
  '/sources': SourcesPage,
  '/forecast': ForecastPage,
  '/performance': PerformancePage,
  '/goals': GoalsPage,
  '/settings': SettingsPage,
};

/** Starts loading a page's chunk. Safe to call repeatedly; failures retry later. */
export function prefetchAppRoute(path: string): void {
  APP_ROUTES_BY_PATH[path]?.preload().catch(() => undefined);
}

/** Handlers that prefetch a page when pointer, focus or touch lands on its link. */
export function intentPrefetch(to: string) {
  const go = () => prefetchAppRoute(to);
  return { onPointerEnter: go, onFocus: go, onTouchStart: go };
}
