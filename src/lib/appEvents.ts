/** Window events that let distant components talk to the shell. */
export const ADD_MEASUREMENT_EVENT = 'quantive:add-measurement';
/** Dispatched by the composer after saving an entry for the latest date. */
export const SNAPSHOT_SAVED_EVENT = 'quantive:snapshot-saved';

/** Opens the shell's composer (one instance, owned by AppShell). */
export function openComposer() {
  window.dispatchEvent(new Event(ADD_MEASUREMENT_EVENT));
}

/** True when an authored transition may run for `el` right now. */
export function canAnimate(el: Element | null): boolean {
  if (!el) return false;
  const root = document.documentElement;
  if (root.dataset.appMotion !== 'on' || root.classList.contains('privacy-mode')) return false;
  if (document.visibilityState !== 'visible') return false;
  const r = el.getBoundingClientRect();
  const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return r.height > 0 && visible / r.height >= 0.5;
}
