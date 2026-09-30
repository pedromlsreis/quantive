import { lazy, useState, type ComponentType } from 'react';

type PageModule = { default: ComponentType };

export interface PreloadableRoute {
  (): JSX.Element;
  /** Loads the page chunk. After it resolves, the route renders without suspending. */
  preload: () => Promise<void>;
}

/**
 * `React.lazy` with a preload hook, for prerendered public pages.
 *
 * `createRoot` discards the prerendered DOM on its first commit. With a plain
 * `lazy()` page that commit is the Suspense spinner, so a cold load flashes
 * page → spinner → page and replays every CSS entrance. Awaiting `preload()`
 * before the first render (see main.tsx) makes that commit the page itself.
 */
export function lazyRoute(load: () => Promise<PageModule>): PreloadableRoute {
  let Loaded: ComponentType | null = null;
  let pending: Promise<void> | null = null;

  const preload = () => {
    pending ??= load().then(
      (mod) => {
        Loaded = mod.default;
      },
      (err) => {
        // Let a later navigation retry a failed chunk fetch.
        pending = null;
        throw err;
      },
    );
    return pending;
  };

  const Lazy = lazy(() => preload().then(() => ({ default: Loaded as ComponentType })));

  function Route() {
    // Pinned per mount: switching from Lazy to Loaded on a later re-render
    // would change the element type and remount the page.
    const [Page] = useState<ComponentType>(() => Loaded ?? Lazy);
    return <Page />;
  }
  Route.preload = preload;
  return Route;
}
