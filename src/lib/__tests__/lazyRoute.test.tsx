import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lazyRoute } from '../lazyRoute';

const Fallback = () => <p>loading</p>;

function pageModule(onMount = () => {}) {
  function Page() {
    useEffect(onMount, []);
    return <p>page</p>;
  }
  return { default: Page };
}

describe('lazyRoute', () => {
  it('renders a preloaded page on the first commit, without the Suspense fallback', async () => {
    const Route = lazyRoute(() => Promise.resolve(pageModule()));
    await Route.preload();

    render(
      <Suspense fallback={<Fallback />}>
        <Route />
      </Suspense>,
    );

    expect(screen.getByText('page')).toBeInTheDocument();
    expect(screen.queryByText('loading')).toBeNull();
  });

  it('falls back to lazy loading when not preloaded', async () => {
    const Route = lazyRoute(() => Promise.resolve(pageModule()));

    render(
      <Suspense fallback={<Fallback />}>
        <Route />
      </Suspense>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(await screen.findByText('page')).toBeInTheDocument();
  });

  it('loads the chunk once however often it is preloaded', async () => {
    const load = vi.fn(() => Promise.resolve(pageModule()));
    const Route = lazyRoute(load);
    await Promise.all([Route.preload(), Route.preload()]);
    await Route.preload();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not remount the page when the parent re-renders after the chunk loaded', async () => {
    const onMount = vi.fn();
    const Route = lazyRoute(() => Promise.resolve(pageModule(onMount)));
    let bump: () => void = () => {};
    function Parent({ children }: { children: ReactNode }) {
      const [n, setN] = useState(0);
      bump = () => setN((x) => x + 1);
      return <div data-n={n}>{children}</div>;
    }

    render(
      <Parent>
        <Suspense fallback={<Fallback />}>
          <Route />
        </Suspense>
      </Parent>,
    );
    await screen.findByText('page');
    act(() => bump());
    act(() => bump());

    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('retries after a failed preload', async () => {
    const load = vi
      .fn<() => Promise<{ default: () => JSX.Element }>>()
      .mockRejectedValueOnce(new Error('chunk 404'))
      .mockResolvedValue(pageModule());
    const Route = lazyRoute(load);

    await expect(Route.preload()).rejects.toThrow('chunk 404');
    await expect(Route.preload()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
