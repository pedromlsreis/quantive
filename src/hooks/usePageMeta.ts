import { useEffect } from 'react';

export const DEFAULT_TITLE = 'Quantive - See your financial life clearly';
export const DEFAULT_DESC =
  'Quantive is a privacy-first net-worth tracker. Track, analyse, and forecast your wealth across every account and currency, end-to-end encrypted, with no bank connections. Free forever.';
const BASE_URL = 'https://usequantive.app';

function setMeta(selector: string, content: string) {
  const el = document.querySelector(selector) as HTMLMetaElement | null;
  if (el) el.content = content;
}

function setCanonical(path: string) {
  const url = `${BASE_URL}${path}`;
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (el) {
    el.href = url;
  } else {
    el = document.createElement('link');
    el.rel = 'canonical';
    el.href = url;
    document.head.appendChild(el);
  }
}

interface PageMeta {
  title: string;
  description?: string;
  /** Path for canonical URL, e.g. "/pricing". Defaults to "/". */
  path?: string;
}

export function usePageMeta({ title, description, path = '/' }: PageMeta) {
  useEffect(() => {
    const desc = description ?? DEFAULT_DESC;

    document.title = title;
    setCanonical(path);
    setMeta('meta[name="description"]', desc);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', desc);
    setMeta('meta[property="og:url"]', `${BASE_URL}${path}`);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', desc);

    return () => {
      document.title = DEFAULT_TITLE;
      setCanonical('/');
      setMeta('meta[name="description"]', DEFAULT_DESC);
      setMeta('meta[property="og:title"]', DEFAULT_TITLE);
      setMeta('meta[property="og:description"]', DEFAULT_DESC);
      setMeta('meta[property="og:url"]', BASE_URL);
      setMeta('meta[name="twitter:title"]', DEFAULT_TITLE);
      setMeta('meta[name="twitter:description"]', DEFAULT_DESC);
    };
  }, [title, description, path]);
}
