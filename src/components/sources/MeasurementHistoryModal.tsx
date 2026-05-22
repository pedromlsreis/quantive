import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { useFxRates } from '@/hooks/useFxRates';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies';
import { parseLocalizedNumber } from '@/lib/utils';
import { modalOverlay, modalContent } from '@/lib/motion';
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

function formatRowDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
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
  const trapRef = useFocusTrap<HTMLDivElement>(open);

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

  // Don't intercept Escape when a stacked dialog is open — let those close first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing && !deleting) onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, editing, deleting, onOpenChange]);

  const handleConfirmDelete = () => {
    if (!deleting || !idSource) return;
    deleteMeasurement(deleting.date, idSource);
    toast.success(`Deleted measurement from ${formatRowDate(deleting.date)}`);
    setDeleting(null);
  };

  // Last-measurement warning copy: source disappears from "current" surfaces
  // but the volatility/liquidity metadata stays so a future measurement
  // re-attaches cleanly.
  const isLastMeasurement = rows.length === 1;

  return (
    <AnimatePresence>
      {open && idSource && (
        <motion.div
          variants={modalOverlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 grid place-items-center"
          aria-modal="true"
          role="dialog"
          aria-labelledby="measurement-history-title"
          style={{ background: 'oklch(0% 0 0 / 0.5)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            className="absolute inset-0"
            onClick={() => {
              if (!editing && !deleting) onOpenChange(false);
            }}
          />

          <motion.div
            ref={trapRef}
            variants={modalContent}
            className="q-modal relative"
            style={{ width: 'min(640px, calc(100vw - 32px))' }}
          >
            <div className="q-modal-head">
              <div>
                <div className="q-modal-title" id="measurement-history-title">
                  Measurements for {idSource}
                </div>
                <div className="q-modal-sub">
                  {rows.length === 0
                    ? 'No measurements recorded yet for this source.'
                    : `${rows.length} record${rows.length === 1 ? '' : 's'}, newest first. Edit a value or remove an entry.`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="q-icon-btn"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="q-modal-body" style={{ paddingTop: 0 }}>
              {rows.length === 0 ? (
                <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)', margin: 'var(--s-3) 0' }}>
                  Add a measurement to start tracking this source.
                </p>
              ) : (
                <div
                  role="region"
                  aria-label="Measurement history"
                  style={{
                    maxHeight: '60vh',
                    // Both axes: prevents the action icons from being clipped
                    // on narrow viewports if a future column ever widens.
                    overflow: 'auto',
                    border: '1px solid var(--border-raw)',
                    borderRadius: 'var(--r-2)',
                  }}
                >
                  <table className="q-table q-table--responsive" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead
                      style={{
                        position: 'sticky',
                        top: 0,
                        background: 'var(--surface, var(--bg))',
                        boxShadow: 'inset 0 -1px 0 var(--border-raw)',
                        zIndex: 1,
                      }}
                    >
                      <tr style={{ textAlign: 'left' }}>
                        <th scope="col" style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--fg-subtle)' }}>Date</th>
                        <th scope="col" style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--fg-subtle)', textAlign: 'right' }}>Value</th>
                        <th scope="col" data-col="secondary" style={{ padding: '8px 10px', fontWeight: 500, color: 'var(--fg-subtle)' }}>Currency</th>
                        <th scope="col" aria-label="Actions" style={{ width: 80 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const symbol = CURRENCIES[row.currency]?.symbol ?? row.currency;
                        return (
                          <tr key={row.date.getTime()} style={{ borderBottom: '1px solid var(--border-raw)' }}>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{formatRowDate(row.date)}</td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'var(--font-mono)',
                                fontVariantNumeric: 'tabular-nums',
                                color: row.sourceVl < 0 ? 'var(--negative)' : 'var(--fg)',
                              }}
                            >
                              {symbol}{row.sourceVl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td data-col="secondary" style={{ padding: '8px 10px', color: 'var(--fg-muted)' }}>
                              <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>{row.currency}</span>
                            </td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              {/* Flex + gap satisfies touch-spacing (≥8px between adjacent
                                  targets). Right-aligned via justify-content so the cell
                                  still reads as an "actions" column. */}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)' }}>
                                <button
                                  type="button"
                                  onClick={() => setEditing(row)}
                                  className="q-icon-btn"
                                  aria-label={`Edit measurement from ${formatRowDate(row.date)}`}
                                  title="Edit"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleting(row)}
                                  className="q-icon-btn"
                                  aria-label={`Delete measurement from ${formatRowDate(row.date)}`}
                                  title="Delete"
                                  style={{ color: 'var(--negative)' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="q-modal-foot q-modal-foot--split">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="q-btn q-btn--secondary q-btn--md"
              >
                Done
              </button>
            </div>
          </motion.div>

          {/* Stacked Edit sub-modal */}
          {editing && (
            <EditMeasurementModal
              row={editing}
              idSource={idSource}
              onClose={() => setEditing(null)}
              onSubmit={(patch) => {
                updateMeasurement(editing.date, idSource, patch);
                toast.success(`Updated measurement from ${formatRowDate(editing.date)}`);
                setEditing(null);
              }}
            />
          )}

          {/* Stacked delete confirmation */}
          <AlertDialog
            open={!!deleting}
            onOpenChange={(o) => { if (!o) setDeleting(null); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete measurement from {deleting ? formatRowDate(deleting.date) : ''}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isLastMeasurement
                    ? `This is the only measurement for ${idSource}. Deleting it will hide the source from your dashboard until you record a new value.`
                    : 'This will permanently remove the measurement. This cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete measurement
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>
      )}
    </AnimatePresence>
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
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const valueInputRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState<string>(() => String(row.sourceVl));
  const [currency, setCurrency] = useState<CurrencyCode>(row.currency);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

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

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="edit-measurement-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: 'oklch(0% 0 0 / 0.5)', backdropFilter: 'blur(8px)' }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <motion.div
        ref={trapRef}
        variants={modalContent}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="q-modal relative"
        style={{ width: 'min(440px, calc(100vw - 32px))' }}
      >
        <div className="q-modal-head">
          <div>
            <div id="edit-measurement-title" className="q-modal-title">Edit measurement</div>
            <div className="q-modal-sub">
              {idSource} · {formatRowDate(row.date)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="q-icon-btn"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-end' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>Value</span>
                <div className="q-input">
                  <input
                    ref={valueInputRef}
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(null); }}
                    autoFocus
                    aria-invalid={error ? true : undefined}
                    aria-label="Measurement value"
                    style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </label>
              <label style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>Currency</span>
                <div className="q-input">
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    aria-label="Currency"
                  >
                    {CURRENCY_CODES.map((code) => (
                      <option key={code} value={code}>
                        {CURRENCIES[code].symbol} · {code}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            {previewInDisplay !== null && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', margin: 0 }}>
                ≈ {displayCurrency.symbol}{previewInDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at the {formatRowDate(row.date)} rate.
              </p>
            )}

            {error && (
              <div role="alert" style={{ fontSize: 'var(--text-xs)', color: 'var(--negative)' }}>
                {error}
              </div>
            )}
          </div>

          <div className="q-modal-foot q-modal-foot--split">
            <button
              type="button"
              onClick={onClose}
              className="q-btn q-btn--ghost q-btn--md"
            >
              Cancel
            </button>
            <button type="submit" className="q-btn q-btn--primary q-btn--md">
              Save changes
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
