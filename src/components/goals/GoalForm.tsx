import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Goal } from '@/lib/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies';
import { parseLocalizedNumber } from '@/lib/utils';

interface GoalFormProps {
  open: boolean;
  /** When provided, the form prefills + saves via updateGoal; otherwise addGoal. */
  goal: Goal | null;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    targetAmount: number;
    targetCurrency: CurrencyCode;
    targetDate: string;
  }) => void;
}

function isoDateInputToday(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function GoalForm({ open, goal, onClose, onSubmit }: GoalFormProps) {
  const { currency: displayCurrency } = useCurrency();
  const trapRef = useFocusTrap<HTMLDivElement>(open, {
    initialFocus: () => document.getElementById('goal-name'),
  });

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>(displayCurrency.code);
  const [targetDate, setTargetDate] = useState(isoDateInputToday());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (goal) {
      setName(goal.name);
      setAmount(String(goal.targetAmount));
      setCurrency(goal.targetCurrency);
      setTargetDate(goal.targetDate);
    } else {
      setName('');
      setAmount('');
      setCurrency(displayCurrency.code);
      setTargetDate(isoDateInputToday());
    }
    setError(null);
  }, [open, goal, displayCurrency.code]);

  useModalLayer(open, onClose);

  // A stray backdrop click must not discard a half-written goal; the close
  // button and Escape always close.
  const hasUserInput = name.trim().length > 0 || amount.trim().length > 0;
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    if (hasUserInput) return;
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the goal a short name so you can recognise it later.');
      return;
    }
    const parsed = parseLocalizedNumber(amount);
    if (typeof parsed === 'string' || !Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a target amount above zero.');
      return;
    }
    if (!targetDate || targetDate <= todayIso()) {
      setError('Pick a target date after today.');
      return;
    }
    onSubmit({ name: trimmed, targetAmount: parsed, targetCurrency: currency, targetDate });
  };

  if (!open) return null;

  return createPortal(
    <div className="q-modal-backdrop q-modal-backdrop--top" onClick={handleBackdropClick}>
      <div
        ref={trapRef}
        className="q-modal"
        style={{ maxWidth: 480 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-form-title"
        aria-describedby="goal-form-sub"
      >
        <div className="q-modal-head">
          <div>
            <h2 id="goal-form-title" className="q-modal-title">{goal ? 'Edit goal' : 'Add a goal'}</h2>
            <p id="goal-form-sub" className="q-modal-sub">
              Name an amount and a date. Progress is measured against your latest net worth.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="q-icon-btn">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div className="q-field">
              <label className="q-field-label" htmlFor="goal-name">Goal name</label>
              <span className="q-input">
                <input
                  id="goal-name"
                  type="text"
                  placeholder="e.g. House deposit"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null); }}
                  maxLength={120}
                />
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px', gap: 'var(--s-3)' }}>
              <div className="q-field">
                <label className="q-field-label" htmlFor="goal-amount">Target amount</label>
                <span className="q-input">
                  <input
                    id="goal-amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); setError(null); }}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                </span>
              </div>
              <div className="q-field">
                <label className="q-field-label" htmlFor="goal-currency">Currency</label>
                <span className="q-input">
                  <select id="goal-currency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
                    {CURRENCY_CODES.map((code) => (
                      <option key={code} value={code}>{`${CURRENCIES[code].symbol} ${code}`}</option>
                    ))}
                  </select>
                </span>
              </div>
            </div>

            <div className="q-field">
              <label className="q-field-label" htmlFor="goal-date">Target date</label>
              <span className="q-input">
                <input
                  id="goal-date"
                  type="date"
                  value={targetDate}
                  min={tomorrowIso()}
                  onChange={(e) => { setTargetDate(e.target.value); setError(null); }}
                />
              </span>
            </div>

            {error && <p className="q-field-error" role="alert" style={{ margin: 0 }}>{error}</p>}
          </div>

          <div className="q-modal-foot q-modal-foot--split">
            <button type="button" onClick={onClose} className="q-btn q-btn--ghost q-btn--md">Cancel</button>
            <button type="submit" className="q-btn q-btn--primary q-btn--md">{goal ? 'Save changes' : 'Add goal'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
