import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useFormat } from '@/hooks/useFormat';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { useFxRates } from '@/hooks/useFxRates';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies';
import { parseLocalizedNumber } from '@/lib/utils';
import { formatDate, money } from '@/lib/formatters';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MeasurementHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The source whose measurement history to show. Trimmed identifier. */
  idSource: string | null;
}

interface HistoryRow {
  date: Date;
  sourceVl: number;
  currency: CurrencyCode;
}


/**
 * History list + edit/delete affordances for a single source's measurements.
 *
 * Each row is identified by (date, idSource). Legacy spreadsheet imports may
 * have produced duplicate facts on the same (date, source); the context-level
 * mutations treat them as a single conceptual fact (edit fans out, delete
 * removes all). We collapse them at render time too — one row per date.
 *
 * The Edit sub-modal stacks on top via the same q-modal styles. AlertDialog
 * provides the delete confirmation; its Radix portal stacks above everything
 * cleanly. Closing the parent (X / backdrop / Escape) is gated when either
 * stacked dialog is open.
 */
export function MeasurementHistoryModal({ open, onOpenChange, idSource }: MeasurementHistoryModalProps) {
  const { data, updateMeasurement, deleteMeasurement } = usePortfolio();
  const f = useFormat();
  const visible = open && !!idSource;

  const [editing, setEditing] = useState<HistoryRow | null>(null);
  const [deleting, setDeleting] = useState<HistoryRow | null>(null);

  // Reset stacked dialog state whenever the parent modal closes — otherwise
  // a closed parent leaves a hidden Edit/AlertDialog state primed to re-open.
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setDeleting(null);
    }
  }, [open]);

  // Derive rows directly from context every render. Multi-tab cloud-sync
  // updates surface immediately; no stale local snapshot. Collapse duplicate
  // (date, source) facts to one row — they are indistinguishable.
  const rows = useMemo<HistoryRow[]>(() => {
    if (!idSource || !data) return [];
    const target = idSource.trim();
    const byDate = new Map<number, HistoryRow>();
    for (const f of data.facts) {
      if (f.idSource.trim() !== target) continue;
      const key = f.date.getTime();
      // Last writer wins; duplicates should be identical, and edits propagate
      // to all of them, so the choice is stable.
      byDate.set(key, { date: f.date, sourceVl: f.sourceVl, currency: f.currency });
    }
    return Array.from(byDate.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [idSource, data]);

  // The edit layer answers Escape itself (topmost); the Radix delete
  // confirmation handles its own, so the list ignores Escape while it shows.
  const close = () => { if (!editing && !deleting) onOpenChange(false); };
  useModalLayer(visible, close);
  const trapRef = useFocusTrap<HTMLDivElement>(visible);

  const handleConfirmDelete = () => {
    if (!deleting || !idSource) return;
    // The context fires the confirmation toast — with a one-step Undo — so the
    // modal doesn't toast here too.
    deleteMeasurement(deleting.date, idSource);
    setDeleting(null);
  };

  // Last-measurement warning copy: source disappears from "current" surfaces
  // but the volatility/liquidity metadata stays so a future measurement
  // re-attaches cleanly.
  const isLastMeasurement = rows.length === 1;

  if (!visible || !idSource) return null;

  return (
    <>
      {createPortal(
        <div className="q-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div
            ref={trapRef}
            className="q-modal"
            style={{ width: 'min(600px, calc(100vw - 32px))' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="measurement-history-title"
            aria-describedby="measurement-history-sub"
          >
            <div className="q-modal-head">
              <div style={{ minWidth: 0 }}>
                <h2 className="q-modal-title" id="measurement-history-title">Entries for {idSource}</h2>
                <p className="q-modal-sub" id="measurement-history-sub">
                  {rows.length === 0
                    ? 'No entries for this source yet.'
                    : `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}, newest first.`}
                </p>
              </div>
              <button type="button" onClick={close} className="q-icon-btn" aria-label="Close">
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            <div className="q-modal-body" style={{ paddingTop: 0 }}>
              {rows.length === 0 ? (
                <p style={{ color: 'var(--fg-subtle)', fontSize: 14, margin: 'var(--s-3) 0' }}>
                  Add an entry to start this source's history.
                </p>
              ) : (
                <div role="region" aria-label="Entry history" tabIndex={0} className="q-history-scroll">
                  <table className="q-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col" className="num">Value</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.date.getTime()}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <time dateTime={row.date.toISOString().slice(0, 10)}>{formatDate(row.date)}</time>
                          </td>
                          <td className={`num${row.sourceVl < 0 ? ' q-tone-neg' : ''}`}>
                            {money(row.sourceVl, { currency: row.currency, locale: f.ctx.locale }, { cents: true })}
                          </td>
                          <td style={{ width: 96 }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)' }}>
                              <button
                                type="button"
                                onClick={() => setEditing(row)}
                                className="q-icon-btn"
                                aria-label={`Edit entry from ${formatDate(row.date)}`}
                              >
                                <Pencil size={16} strokeWidth={1.75} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleting(row)}
                                className="q-icon-btn q-icon-btn--danger"
                                aria-label={`Delete entry from ${formatDate(row.date)}`}
                              >
                                <Trash2 size={16} strokeWidth={1.75} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="q-modal-foot q-modal-foot--split">
              <button type="button" onClick={close} className="q-btn q-btn--secondary q-btn--md">
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {editing && (
        <EditMeasurementModal
          row={editing}
          idSource={idSource}
          onClose={() => setEditing(null)}
          onSubmit={(patch) => {
            updateMeasurement(editing.date, idSource, patch);
            toast.success(`Entry from ${formatDate(editing.date)} updated`);
            setEditing(null);
          }}
        />
      )}

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => { if (!o) setDeleting(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete entry from {deleting ? formatDate(deleting.date) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isLastMeasurement
                ? `This is the only entry for ${idSource}, so the source leaves your overview until you add a new value. You can undo for a few seconds.`
                : 'You can undo for a few seconds.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="q-btn--destructive"
            >
              Delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Edit sub-modal ──────────────────────────────────────────────────────────
//
// Co-located: the edit form is only ever rendered as a stacked child of the
// History modal. Keeping it in the same file avoids a second public component
// and a second import in SourcesPage.

interface EditMeasurementModalProps {
  row: HistoryRow;
  idSource: string;
  onClose: () => void;
  onSubmit: (patch: { sourceVl: number; currency: CurrencyCode }) => void;
}

function EditMeasurementModal({ row, idSource, onClose, onSubmit }: EditMeasurementModalProps) {
  const { currency: displayCurrency } = useCurrency();
  const { convertAt } = useFxRates();
  const valueInputRef = useRef<HTMLInputElement>(null);
  useModalLayer(true, onClose);
  const trapRef = useFocusTrap<HTMLDivElement>(true, { initialFocus: () => valueInputRef.current });
  const f = useFormat();

  const [amount, setAmount] = useState<string>(() => String(row.sourceVl));
  const [currency, setCurrency] = useState<CurrencyCode>(row.currency);
  const [error, setError] = useState<string | null>(null);

  // Live conversion preview when the user changes the currency. Helps catch
  // currency typos before saving — the dashboard would otherwise re-anchor
  // the historical value at the wrong base.
  const parsed = parseLocalizedNumber(amount);
  const parsedNum = typeof parsed === 'number' ? parsed : NaN;
  const previewInDisplay = useMemo(() => {
    if (!Number.isFinite(parsedNum)) return null;
    if (currency === displayCurrency.code) return null;
    const converted = convertAt(parsedNum, currency, displayCurrency.code, row.date);
    return Number.isFinite(converted) ? converted : null;
  }, [parsedNum, currency, displayCurrency.code, convertAt, row.date]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
      setError(typeof parsed === 'string' ? parsed : 'Enter a valid number.');
      // Bounce focus back to the offending field so the user can correct it
      // without re-tabbing (WCAG focus-management on submit error).
      valueInputRef.current?.focus();
      valueInputRef.current?.select();
      return;
    }
    onSubmit({ sourceVl: parsed, currency });
  };

  return createPortal(
    <div className="q-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={trapRef}
        className="q-modal"
        style={{ width: 'min(440px, calc(100vw - 32px))' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-measurement-title"
        aria-describedby="edit-measurement-sub"
      >
        <div className="q-modal-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="edit-measurement-title" className="q-modal-title">Edit entry</h2>
            <p id="edit-measurement-sub" className="q-modal-sub">{idSource}, {formatDate(row.date)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="q-icon-btn">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px', gap: 'var(--s-3)' }}>
              <div className="q-field">
                <label className="q-field-label" htmlFor="edit-measurement-value">Value</label>
                <span className="q-input">
                  <input
                    id="edit-measurement-value"
                    ref={valueInputRef}
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(null); }}
                    aria-invalid={error ? true : undefined}
                    aria-label="Entry value"
                    aria-describedby={error ? 'edit-measurement-error' : undefined}
                    style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                  />
                </span>
              </div>
              <div className="q-field">
                <label className="q-field-label" htmlFor="edit-measurement-currency">Currency</label>
                <span className="q-input">
                  <select id="edit-measurement-currency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
                    {CURRENCY_CODES.map((code) => (
                      <option key={code} value={code}>{`${CURRENCIES[code].symbol} ${code}`}</option>
                    ))}
                  </select>
                </span>
              </div>
            </div>

            {previewInDisplay !== null && (
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)', margin: 0 }}>
                {`About ${money(previewInDisplay, { currency: displayCurrency.code, locale: f.ctx.locale }, { cents: true })} at the rate of ${formatDate(row.date)}.`}
              </p>
            )}

            {error && <p className="q-field-error" id="edit-measurement-error" role="alert" style={{ margin: 0 }}>{error}</p>}
          </div>

          <div className="q-modal-foot q-modal-foot--split">
            <button type="button" onClick={onClose} className="q-btn q-btn--ghost q-btn--md">Cancel</button>
            <button type="submit" className="q-btn q-btn--primary q-btn--md">Save changes</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
