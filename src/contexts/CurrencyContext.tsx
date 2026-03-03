import React, { createContext, useContext, useState, useCallback } from 'react';

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

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [code, setCode] = useState<CurrencyCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved in CURRENCIES) return saved as CurrencyCode;
    } catch {}
    return 'EUR';
  });

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCode(c);
    localStorage.setItem(STORAGE_KEY, c);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency: CURRENCIES[code], setCurrency, allCurrencies: Object.values(CURRENCIES) }}>
      {children}
    </CurrencyContext.Provider>
  );
}
