import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type NumberFormat = 'auto' | 'us' | 'eu' | 'in';

interface PreferencesContextType {
  numberFormat: NumberFormat;
  setNumberFormat: (f: NumberFormat) => void;
  /** Persistent blur toggle — stays on until the user turns it off. */
  privacyMode: boolean;
  setPrivacyMode: (v: boolean) => void;
  /**
   * When true, monetary values are blurred automatically whenever the window
   * loses focus or the tab is hidden (screen-share, alt-tab, stepping away),
   * and revealed again on return — independent of the persistent `privacyMode`
   * toggle. Off by default.
   */
  blurOnUnfocus: boolean;
  setBlurOnUnfocus: (v: boolean) => void;
  /** Locale to use for formatting numbers, or undefined to fall back to the currency's locale. */
  numberLocale: string | undefined;
}

const Ctx = createContext<PreferencesContextType | null>(null);

export function usePreferences() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}

const NF_KEY = 'pref-number-format';
const PM_KEY = 'pref-privacy-mode';
const AB_KEY = 'pref-privacy-auto-blur';

const parseBool = (v: string): boolean | null => (v === 'true' ? true : v === 'false' ? false : null);

const LOCALE_MAP: Record<NumberFormat, string | undefined> = {
  auto: undefined,
  us: 'en-US',
  eu: 'de-DE',
  in: 'en-IN',
};

function readStored<T>(key: string, fallback: T, parse: (v: string) => T | null): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [numberFormat, setNumberFormatState] = useState<NumberFormat>(() =>
    readStored<NumberFormat>(NF_KEY, 'auto', (v) =>
      v === 'auto' || v === 'us' || v === 'eu' || v === 'in' ? v : null,
    ),
  );
  const [privacyMode, setPrivacyModeState] = useState<boolean>(() =>
    readStored<boolean>(PM_KEY, false, parseBool),
  );
  const [blurOnUnfocus, setBlurOnUnfocusState] = useState<boolean>(() =>
    readStored<boolean>(AB_KEY, false, parseBool),
  );
  // True while the window is blurred / tab hidden. Only tracked when the
  // auto-blur preference is on, so the listeners aren't attached otherwise.
  const [windowAway, setWindowAway] = useState(false);

  useEffect(() => {
    if (!blurOnUnfocus) {
      setWindowAway(false);
      return;
    }
    // `blur`/`focus` cover alt-tab and clicking into another app (including a
    // screen-share picker); `visibilitychange` covers tab switches and
    // minimise. Either signal hides the values; only regaining focus with a
    // visible tab reveals them.
    const away = () => setWindowAway(true);
    const back = () => setWindowAway(document.visibilityState === 'hidden');
    const onVis = () => setWindowAway(document.visibilityState === 'hidden');
    window.addEventListener('blur', away);
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', onVis);
    // Seed from the current state in case the window mounts already hidden.
    onVis();
    return () => {
      window.removeEventListener('blur', away);
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [blurOnUnfocus]);

  // The persistent toggle and the auto-on-unfocus state both feed one root
  // class — whichever is active wins.
  const blurActive = privacyMode || (blurOnUnfocus && windowAway);
  useEffect(() => {
    const root = document.documentElement;
    if (blurActive) root.classList.add('privacy-mode');
    else root.classList.remove('privacy-mode');
  }, [blurActive]);

  // Press-and-hold to peek on touch. Desktop reveals a blurred value on
  // `:hover`, but touch devices have no hover — so the "peek without
  // disabling privacy" affordance (which the ICP needs precisely on a phone)
  // wouldn't work. Here a non-mouse pointerdown reveals the pressed figure
  // until release. Listeners only attach while blur is active.
  useEffect(() => {
    if (!blurActive) return;
    const SELECTOR = '.num, .q-metric-value';
    let peeking: Element | null = null;
    const clear = () => {
      peeking?.classList.remove('is-peeking');
      peeking = null;
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return; // mouse already peeks via :hover
      const el = (e.target as Element | null)?.closest(SELECTOR) ?? null;
      if (!el) return;
      clear();
      peeking = el;
      el.classList.add('is-peeking');
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', clear, { passive: true });
    document.addEventListener('pointercancel', clear, { passive: true });
    return () => {
      clear();
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', clear);
      document.removeEventListener('pointercancel', clear);
    };
  }, [blurActive]);

  const setNumberFormat = useCallback((f: NumberFormat) => {
    setNumberFormatState(f);
    try { localStorage.setItem(NF_KEY, f); } catch { /* ignore */ }
  }, []);

  const setPrivacyMode = useCallback((v: boolean) => {
    setPrivacyModeState(v);
    try { localStorage.setItem(PM_KEY, String(v)); } catch { /* ignore */ }
  }, []);

  const setBlurOnUnfocus = useCallback((v: boolean) => {
    setBlurOnUnfocusState(v);
    try { localStorage.setItem(AB_KEY, String(v)); } catch { /* ignore */ }
  }, []);

  const value = useMemo<PreferencesContextType>(() => ({
    numberFormat,
    setNumberFormat,
    privacyMode,
    setPrivacyMode,
    blurOnUnfocus,
    setBlurOnUnfocus,
    numberLocale: LOCALE_MAP[numberFormat],
  }), [numberFormat, setNumberFormat, privacyMode, setPrivacyMode, blurOnUnfocus, setBlurOnUnfocus]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
