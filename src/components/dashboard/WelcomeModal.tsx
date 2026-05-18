import { useState, useEffect } from 'react';
import { X, Plus, BarChart3, Shield, Sparkles, MonitorSmartphone } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Notice } from '@/components/ui/Notice';
import { useFocusTrap } from '@/hooks/useFocusTrap';

const STORAGE_KEY = 'finance-cockpit-welcome-dismissed';

const highlights = [
  {
    icon: <Plus className="h-4 w-4 text-primary" />,
    title: 'Start in seconds',
    description: 'Add a measurement directly from the dashboard — no upload required. Already keep a spreadsheet? Import it instead.',
  },
  {
    icon: <BarChart3 className="h-4 w-4 text-primary" />,
    title: 'Track net worth over time',
    description: 'See how your assets evolve across sources, with allocation breakdowns and forecasts.',
  },
  {
    icon: <Shield className="h-4 w-4 text-primary" />,
    title: 'Risk & liquidity insights',
    description: "Filter by volatility and liquidity to understand your portfolio's risk profile.",
  },
  {
    icon: <Sparkles className="h-4 w-4 text-primary" />,
    title: 'Milestones & motivation',
    description: 'Earn badges as your portfolio grows, and stay motivated with progress indicators.',
  },
];

export function WelcomeModal() {
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const trapRef = useFocusTrap<HTMLDivElement>(visible);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed !== 'true') {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const handleClose = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (e) {
        console.warn('[WelcomeModal] Failed to persist dismissal preference:', e);
      }
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="q-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div ref={trapRef} className="q-modal" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="q-modal-head">
          <div>
            <div className="q-modal-title" id="welcome-title">Welcome to Quantive</div>
            <div className="q-modal-sub">Your personal dashboard to track, analyse, and forecast your net worth.</div>
          </div>
          <button type="button" onClick={handleClose} className="q-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 'var(--r-3)',
            background: 'var(--accent-faint-raw)', flexShrink: 0,
          }}>
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>

          {highlights.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <div className="q-insight-icon">{item.icon}</div>
              <div>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)', margin: 0 }}>{item.title}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)', lineHeight: 1.5, marginTop: 'var(--s-1)', marginBottom: 0 }}>{item.description}</p>
              </div>
            </div>
          ))}

          <Notice variant="accent">
            <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" style={{ marginTop: 1 }} aria-hidden="true" />
            <span>Your data saves here automatically. Sign in to sync across devices.</span>
          </Notice>

          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', cursor: 'pointer', userSelect: 'none' }}>
            <Checkbox
              id="welcome-dismiss"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>Don't show this again</span>
          </label>
        </div>

        <div className="q-modal-foot">
          <button
            type="button"
            onClick={handleClose}
            className="q-btn q-btn--primary q-btn--md"
            style={{ width: '100%' }}
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}

/** Exported for testing */
export const WELCOME_STORAGE_KEY = STORAGE_KEY;
