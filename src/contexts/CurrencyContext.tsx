import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'NOK';

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  NOK: { code: 'NOK', symbol: 'NOK', locale: 'nb-NO' },
};

interface CurrencyContextType {
  currency: CurrencyConfig;
  setCurrency: (code: CurrencyCode) => void;
  allCurrencies: CurrencyConfig[];
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}

const STORAGE_KEY = 'preferred-currency';

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [code, setCode] = useState<CurrencyCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isCurrencyCode(saved)) return saved;
    } catch {
      // localStorage may be disabled (e.g. private browsing); fall through to default.
    }
    return 'EUR';
  });

  // Avoid re-fetching the profile on every re-render once we've adopted it for this user.
  const hydratedForUserRef = useRef<string | null>(null);

  // Profile wins on sign-in: pull preferred_currency and adopt it locally.
  useEffect(() => {
    if (!user) {
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === user.id) return;
    hydratedForUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('preferred_currency')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const remote = data?.preferred_currency;
      if (isCurrencyCode(remote)) {
        setCode(remote);
        try {
          localStorage.setItem(STORAGE_KEY, remote);
        } catch {
          // localStorage may be unavailable; remote value is still applied in-memory.
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCode(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // localStorage may be unavailable; the cloud profile write below still persists.
    }
    if (user) {
      supabase
        .from('profiles')
        .update({ preferred_currency: c })
        .eq('user_id', user.id)
        .then(({ error }) => {
          if (error) console.error('Failed to persist preferred currency:', error);
        });
    }
  }, [user]);

  return (
    <CurrencyContext.Provider value={{ currency: CURRENCIES[code], setCurrency, allCurrencies: Object.values(CURRENCIES) }}>
      {children}
    </CurrencyContext.Provider>
  );
}
