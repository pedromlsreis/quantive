import { useState, useEffect } from 'react';
import { X, FileSpreadsheet, BarChart3, Shield, Sparkles } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const STORAGE_KEY = 'finance-cockpit-welcome-dismissed';

const highlights = [
  {
    icon: <FileSpreadsheet className="h-4 w-4 text-primary" />,
    title: 'Upload & visualise',
    description: 'Import your portfolio snapshots from Excel and get instant charts, KPIs, and trends.',
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
      } catch {
        // Storage unavailable — silently ignore
      }
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>

        <h2 className="mb-1 text-lg font-bold text-foreground">Welcome to Finance Cockpit</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Your personal dashboard to track, analyse, and forecast your net worth — all from a simple Excel file.
        </p>

        <div className="space-y-4">
          {highlights.map((item, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                {item.icon}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Checkbox
            id="welcome-dismiss"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <label htmlFor="welcome-dismiss" className="text-xs text-muted-foreground cursor-pointer select-none">
            Don't show this again
          </label>
        </div>

        <button
          onClick={handleClose}
          className="mt-4 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Get started
        </button>
      </div>
    </div>
  );
}

/** Exported for testing */
export const WELCOME_STORAGE_KEY = STORAGE_KEY;
