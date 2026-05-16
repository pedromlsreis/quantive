// Analytics-consent state machine. The flag itself is "strictly necessary" —
// without it we cannot remember the user's choice — so storing it does not
// itself require consent under § 25 TDDDG.

const STORAGE_KEY = 'quantive_analytics_consent';

export type ConsentState = 'granted' | 'denied' | null;

type Listener = (state: ConsentState) => void;
const listeners = new Set<Listener>();

function read(): ConsentState {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'granted' || raw === 'denied') return raw;
    return null;
  } catch {
    return null;
  }
}

function write(value: Exclude<ConsentState, null>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage unavailable — proceed in-memory only; banner will show again next visit.
  }
}

export function getConsent(): ConsentState {
  return read();
}

export function setConsent(value: Exclude<ConsentState, null>): void {
  write(value);
  for (const listener of listeners) listener(value);
}

export function subscribeConsent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
