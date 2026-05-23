import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageMeta } from '@/hooks/usePageMeta';

const DEFAULT_TITLE = 'Quantive - See Your Financial Life Clearly';
const DEFAULT_DESC =
  'A privacy-first finance cockpit. Upload your spreadsheet, track net worth, analyse allocations, and forecast your future. Free forever.';
const BASE_URL = 'https://usequantive.app';

// Helpers ─────────────────────────────────────────────────────────────────────

function addMeta(name: string, isProperty = false) {
  const el = document.createElement('meta');
  if (isProperty) el.setAttribute('property', name);
  else el.setAttribute('name', name);
  document.head.appendChild(el);
  return el;
}

function getCanonical(): HTMLLinkElement | null {
  return document.querySelector('link[rel="canonical"]');
}

// ─────────────────────────────────────────────────────────────────────────────

describe('usePageMeta', () => {
  beforeEach(() => {
    // Remove any canonical left from a previous test.
    getCanonical()?.remove();
    document.title = '';
  });

  afterEach(() => {
    getCanonical()?.remove();
    document.title = '';
  });

  it('sets document.title to the provided title', () => {
    const { unmount } = renderHook(() => usePageMeta({ title: 'My Page' }));
    expect(document.title).toBe('My Page');
    unmount();
  });

  it('creates a canonical link when none exists', () => {
    expect(getCanonical()).toBeNull();
    const { unmount } = renderHook(() => usePageMeta({ title: 'Test', path: '/pricing' }));
    const link = getCanonical();
    expect(link).not.toBeNull();
    expect(link!.href).toBe(`${BASE_URL}/pricing`);
    unmount();
  });

  it('updates an existing canonical link instead of creating a second one', () => {
    const existing = document.createElement('link');
    existing.rel = 'canonical';
    existing.href = 'https://old.example.com/';
    document.head.appendChild(existing);

    const { unmount } = renderHook(() => usePageMeta({ title: 'Test', path: '/settings' }));
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(existing.href).toBe(`${BASE_URL}/settings`);
    unmount();
    existing.remove();
  });

  it('defaults path to "/" when not provided', () => {
    const { unmount } = renderHook(() => usePageMeta({ title: 'Home' }));
    const link = getCanonical();
    expect(link!.href).toBe(`${BASE_URL}/`);
    unmount();
  });

  it('restores document.title to the default on unmount', () => {
    const { unmount } = renderHook(() => usePageMeta({ title: 'Custom Title', path: '/custom' }));
    expect(document.title).toBe('Custom Title');
    unmount();
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  it('resets canonical to "/" on unmount', () => {
    const { unmount } = renderHook(() => usePageMeta({ title: 'T', path: '/about' }));
    unmount();
    expect(getCanonical()!.href).toBe(`${BASE_URL}/`);
  });

  it('sets meta[name="description"] content when the element exists', () => {
    const meta = addMeta('description');
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'T', description: 'Custom description.' }),
    );
    expect(meta.content).toBe('Custom description.');
    unmount();
    meta.remove();
  });

  it('falls back to the default description when none is provided', () => {
    const meta = addMeta('description');
    const { unmount } = renderHook(() => usePageMeta({ title: 'T' }));
    expect(meta.content).toBe(DEFAULT_DESC);
    unmount();
    meta.remove();
  });

  it('sets og:title and og:description when those elements exist', () => {
    const ogTitle = addMeta('og:title', true);
    const ogDesc = addMeta('og:description', true);
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'OG Page', description: 'OG desc.', path: '/og' }),
    );
    expect(ogTitle.content).toBe('OG Page');
    expect(ogDesc.content).toBe('OG desc.');
    unmount();
    ogTitle.remove();
    ogDesc.remove();
  });

  it('sets og:url when the element exists', () => {
    const ogUrl = addMeta('og:url', true);
    const { unmount } = renderHook(() => usePageMeta({ title: 'T', path: '/about' }));
    expect(ogUrl.content).toBe(`${BASE_URL}/about`);
    unmount();
    ogUrl.remove();
  });

  it('sets twitter:title and twitter:description when those elements exist', () => {
    const twTitle = addMeta('twitter:title');
    const twDesc = addMeta('twitter:description');
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'TW Page', description: 'TW desc.' }),
    );
    expect(twTitle.content).toBe('TW Page');
    expect(twDesc.content).toBe('TW desc.');
    unmount();
    twTitle.remove();
    twDesc.remove();
  });

  it('restores description meta to default on unmount', () => {
    const meta = addMeta('description');
    const { unmount } = renderHook(() =>
      usePageMeta({ title: 'T', description: 'Changed.' }),
    );
    unmount();
    expect(meta.content).toBe(DEFAULT_DESC);
    meta.remove();
  });
});
