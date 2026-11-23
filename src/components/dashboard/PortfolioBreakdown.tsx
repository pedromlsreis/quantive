import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useFxRates } from '@/hooks/useFxRates';
import { useFormat } from '@/hooks/useFormat';
import { formatDate } from '@/lib/formatters';
import { PERSONAL_PORTFOLIO_ID } from '@/lib/portfolios';
import { DEFAULT_SHARE, combinedStart, parseShareInput, summariseParts, type PartSummary } from '@/lib/allPortfolios';

/**
 * A share as typed in the field: "33.33" in the number locale, no % sign.
 * Latin digits always, since parseShareInput reads only those.
 */
function shareNumber(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false, numberingSystem: 'latn' }).format(share);
}

/**
 * "All portfolios" only: each portfolio's latest value, the user's share of
 * it, and what it adds to the total. The rows add up to the net worth above
 * them. Shares of extra portfolios are set here; Personal is always 100%.
 */
export function PortfolioBreakdown() {
  const { portfolioParts, setPortfolioShare } = usePortfolio();
  const { convertAt } = useFxRates();
  const f = useFormat();
  const display = f.currency.code;
  const { asOf, rows, total } = useMemo(
    () => summariseParts(portfolioParts, (value, currency, date) => convertAt(value, currency, display, date)),
    [portfolioParts, convertAt, display],
  );
  const since = useMemo(() => combinedStart(portfolioParts), [portfolioParts]);
  if (rows.length === 0) return null;

  return (
    <section className="q-sec" aria-labelledby="by-portfolio-title">
      <div className="q-sec-head">
        <div>
          <h2 className="q-h2" id="by-portfolio-title">By portfolio</h2>
          {asOf && <div className="q-sec-sub">Each portfolio at its latest entry, valued on {formatDate(asOf)}</div>}
          {since && (
            <div className="q-sec-sub">
              The combined history starts on {formatDate(since)}, the first day every counted portfolio has an entry.
            </div>
          )}
        </div>
      </div>
      <table className="q-table q-table--responsive q-parts">
        <caption className="sr-only">Each portfolio's latest value, your share of it, and what it adds to your net worth</caption>
        <thead>
          <tr>
            <th scope="col">Portfolio</th>
            <th scope="col" className="num" data-col="secondary">Value</th>
            <th scope="col" className="num">Your share</th>
            <th scope="col" className="num">Counted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {row.name}
                <span className="q-table-sub">{row.lastEntry ? `Last entry ${formatDate(row.lastEntry)}` : 'No entries yet'}</span>
              </td>
              <td className="num" data-col="secondary">{f.money(row.value ?? NaN)}</td>
              <td className="num">
                {row.id === PERSONAL_PORTFOLIO_ID ? (
                  <span className="q-parts-fixed">{shareNumber(DEFAULT_SHARE, f.ctx.locale)}%</span>
                ) : (
                  // Keyed on the share, so the field shows a share saved elsewhere.
                  <ShareField key={`${row.id}:${row.share}`} row={row} locale={f.ctx.locale} onShare={setPortfolioShare} />
                )}
              </td>
              <td className="num">{f.money(row.counted ?? NaN)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td data-col="secondary" />
            <td />
            <td className="num">{f.money(total)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="q-sec-foot">
        A share applies to the whole of a portfolio's history. Shares are encrypted with your personal portfolio, so only you see them.
      </p>
    </section>
  );
}

function ShareField({ row, locale, onShare }: {
  row: PartSummary;
  locale: string;
  onShare: (portfolioId: string, share: number) => Promise<boolean>;
}) {
  const shown = shareNumber(row.share, locale);
  const [draft, setDraft] = useState(shown);
  // Escape blurs too; the blur then puts the saved share back instead of saving.
  const cancelled = useRef(false);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(shown);
      return;
    }
    // Tabbing through the field changes nothing.
    if (draft === shown) return;
    const parsed = parseShareInput(draft);
    if (parsed.value === null) {
      toast.error(parsed.error);
      setDraft(shown);
      return;
    }
    if (parsed.value === row.share) {
      setDraft(shown);
      return;
    }
    void onShare(row.id, parsed.value);
  };

  return (
    <label className="q-input q-input--inline q-share-field">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        aria-label={`Your share of ${row.name}, in percent`}
      />
      <span aria-hidden="true">%</span>
    </label>
  );
}
