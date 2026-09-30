import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface FocusTrapOptions {
  /** Element to focus on open; defaults to the first focusable element. */
  initialFocus?: () => HTMLElement | null | undefined;
}

/**
 * Traps keyboard focus inside the returned ref element while `active` is true.
 * On close, focus returns to the element that opened the layer, or to the
 * page heading when that element has since unmounted (an empty-state button
 * that the save replaced, say), so keyboard users never land on <body>.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active: boolean, opts: FocusTrapOptions = {}) {
  const ref = useRef<T>(null);
  const initialFocusRef = useRef(opts.initialFocus);
  initialFocusRef.current = opts.initialFocus;

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;

    const focusable = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => !n.closest('[hidden]') && n.getAttribute('aria-hidden') !== 'true',
      );

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // One frame lets the layer mount its children before focus moves.
    const timer = setTimeout(() => {
      const target = initialFocusRef.current?.() ?? focusable()[0];
      target?.focus();
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !el.contains(document.activeElement)) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last || !el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      if (previouslyFocused && previouslyFocused.isConnected && previouslyFocused !== document.body) {
        previouslyFocused.focus();
      } else {
        document.querySelector<HTMLElement>('main h1[tabindex="-1"]')?.focus();
      }
    };
  }, [active]);

  return ref;
}
