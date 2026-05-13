import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type NumberFormat = 'auto' | 'us' | 'eu' | 'in';

interface PreferencesContextType {
  numberFormat: NumberFormat;
  setNumberFormat: (f: NumberFormat) => void;
  privacyMode: boolean;
  setPrivacyMode: (v: boolean) => void;
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
    readStored<boolean>(PM_KEY, false, (v) => (v === 'true' ? true : v === 'false' ? false : null)),
  );

  useEffect(() => {
    const root = document.documentElement;
    if (privacyMode) root.classList.add('privacy-mode');
    else root.classList.remove('privacy-mode');
  }, [privacyMode]);

  const setNumberFormat = useCallback((f: NumberFormat) => {
    setNumberFormatState(f);
    try { localStorage.setItem(NF_KEY, f); } catch { /* ignore */ }
  }, []);

  const setPrivacyMode = useCallback((v: boolean) => {
    setPrivacyModeState(v);
    try { localStorage.setItem(PM_KEY, String(v)); } catch { /* ignore */ }
  }, []);

  const value = useMemo<PreferencesContextType>(() => ({
    numberFormat,
    setNumberFormat,
    privacyMode,
    setPrivacyMode,
    numberLocale: LOCALE_MAP[numberFormat],
  }), [numberFormat, setNumberFormat, privacyMode, setPrivacyMode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
