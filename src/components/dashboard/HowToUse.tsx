import { useState } from 'react';
import { HelpCircle, X, Plus, Filter, TrendingUp, CloudUpload } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const steps = [
  {
    icon: <Plus className="h-4 w-4 text-primary" />,
    title: 'Add your first measurement',
    description: 'Record balances per source from the dashboard — type the value and save. Add new measurements regularly to unlock trends and forecasts. All values must use the same currency. If you already track in a spreadsheet, you can import an .xlsx instead.',
  },
  {
    icon: <Filter className="h-4 w-4 text-primary" />,
    title: 'Filter & explore',
    description: 'Narrow by date range, sources, volatility, or liquidity. Collapse sections to focus on what matters.',
  },
  {
    icon: <TrendingUp className="h-4 w-4 text-primary" />,
    title: 'Track your progress',
    description: 'Monitor net worth, allocation, forecasts, and milestone badges as your portfolio grows.',
  },
  {
    icon: <CloudUpload className="h-4 w-4 text-primary" />,
    title: 'Sign up to sync across devices',
    description: 'Create an account and confirm your email to persist your data in the cloud.',
  },
];

export function HowToUse() {
  const [open, setOpen] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="q-icon-btn"
        aria-label="How to use"
        title="How to use"
      >
        <HelpCircle className="h-4 w-4" />
      </button>

      {open && (
        <div className="q-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="howto-title">
          <div ref={trapRef} className="q-modal" style={{ maxHeight: '85vh' }}>
            <div className="q-modal-head">
              <div>
                <div className="q-modal-title" id="howto-title">How to use</div>
                <div className="q-modal-sub">Get the most out of Quantive.</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="q-icon-btn"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
              {steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--s-3)' }}>
                  <div className="q-insight-icon">{step.icon}</div>
                  <div>
                    <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)', margin: 0 }}>{step.title}</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', lineHeight: 1.5, marginTop: 'var(--s-1)' }}>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="q-modal-foot">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="q-btn q-btn--primary q-btn--md"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
