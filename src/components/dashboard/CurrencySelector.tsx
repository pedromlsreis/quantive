import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';

const OPTIONS: {code: CurrencyCode;label: string;}[] = [
{ code: 'EUR', label: '€ EUR' },
{ code: 'USD', label: '$ USD' },
{ code: 'GBP', label: '£ GBP' },
{ code: 'NOK', label: 'NOK' }];


export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();

  return (
    <select
      value={currency.code}
      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
      className="rounded-lg border border-border bg-secondary py-2 text-xs text-foreground transition-colors hover:bg-secondary/80 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 px-[9px]"
      aria-label="Select currency">
      
      {OPTIONS.map((o) =>
      <option key={o.code} value={o.code}>{o.label}</option>
      )}
    </select>);

}