import { useEffect, useRef } from 'react';

// Open layers, most recent last. Only the top one answers Escape.
const stack: number[] = [];
let nextId = 1;

/**
 * Shared behaviour for every in-app dialog and sheet, which must render
 * through a portal to <body>: while any is open the app root is inert (so
 * screen readers and Tab stay inside the layer) and the page stops
 * scrolling; Escape closes only the topmost layer. Pass no `onEscape` for
 * layers that must not be dismissed (unlock, recovery-code display).
 */
export function useModalLayer(open: boolean, onEscape?: () => void) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const id = nextId++;
    stack.push(id);
    const root = document.getElementById('root');
    if (stack.length === 1) {
      root?.setAttribute('inert', '');
      // Keep a visible scrollbar's space so the page doesn't shift sideways
      // under the dialog; with no scrollbar there is nothing to keep.
      if (window.innerWidth > document.documentElement.clientWidth) {
        document.documentElement.style.scrollbarGutter = 'stable';
      }
      document.body.style.overflow = 'hidden';
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return;
      e.preventDefault();
      onEscapeRef.current?.();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) {
        root?.removeAttribute('inert');
        document.body.style.overflow = '';
        document.documentElement.style.scrollbarGutter = '';
      }
    };
  }, [open]);
}
