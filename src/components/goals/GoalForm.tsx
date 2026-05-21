import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { Goal } from '@/lib/types';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { CURRENCIES, CURRENCY_CODES } from '@/lib/currencies';
import { parseLocalizedNumber } from '@/lib/utils';
import { modalOverlay, modalContent } from '@/lib/motion';

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
  const trapRef = useFocusTrap<HTMLDivElement>(open);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your goal a short name so you can recognise it later.');
      return;
    }
    const parsed = parseLocalizedNumber(amount);
    if (typeof parsed === 'string' || !Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive target amount.');
      return;
    }
    if (!targetDate || targetDate <= todayIso()) {
      setError('Pick a target date in the future.');
      return;
    }
    onSubmit({ name: trimmed, targetAmount: parsed, targetCurrency: currency, targetDate });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={modalOverlay}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="q-modal-backdrop"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            ref={trapRef}
            variants={modalContent}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="q-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="q-modal-head">
              <div>
                <div id="goal-form-title" className="q-modal-title">
                  {goal ? 'Edit goal' : 'Add a goal'}
                </div>
                <div className="q-modal-sub">
                  Set a net-worth milestone and we'll show you how close you are.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="q-icon-btn"
                style={{ background: 'transparent', border: 0, padding: 4, cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>Name</span>
                  <div className="q-input">
                    <input
                      type="text"
                      placeholder="e.g. Reach €100k by 2027"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      aria-label="Goal name"
                      maxLength={120}
                    />
                  </div>
                </label>

                <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-end' }}>
                  <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>Target amount</span>
                    <div className="q-input">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="100000"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        aria-label="Target amount"
                      />
                    </div>
                  </label>
                  <label style={{ flex: '0 0 140px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>Currency</span>
                    <div className="q-input">
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                        aria-label="Target currency"
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

                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>Target date</span>
                  <div className="q-input">
                    <input
                      type="date"
                      value={targetDate}
                      min={tomorrowIso()}
                      onChange={(e) => setTargetDate(e.target.value)}
                      aria-label="Target date"
                    />
                  </div>
                </label>

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
                  {goal ? 'Save changes' : 'Add goal'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
