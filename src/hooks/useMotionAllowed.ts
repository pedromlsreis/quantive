import { useEffect, useState } from 'react';

/**
 * True once mounted, when the visitor allows motion and the page is not being
 * driven by automation. Always false on first render, so the prerendered HTML
 * and the first client render never differ; the prerender (webdriver +
 * reduced-motion context) and E2E runs never turn it on.
 */
export function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    if (navigator.webdriver) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: no-preference)');
    if (!mq) return;
    const update = () => setAllowed(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return allowed;
}
