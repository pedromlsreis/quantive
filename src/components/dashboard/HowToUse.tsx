import { useState } from 'react';
import { HelpCircle, X, FileSpreadsheet, Filter, TrendingUp, CloudUpload } from 'lucide-react';

const steps = [
  {
    icon: <FileSpreadsheet className="h-4 w-4 text-primary" />,
    title: 'Upload your Excel file',
    description: 'Drop an .xlsx with your portfolio snapshots (or try the demo). Add monthly measurements for trends and forecasts. All values must use the same currency.',
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
        aria-label="How to use"
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">How to use</span>
        <span className="sm:hidden">Help</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="relative mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="mb-1 text-lg font-bold text-foreground">How to use</h2>
            <p className="mb-5 text-sm text-muted-foreground">Get the most out of your Finance Cockpit.</p>

            <div className="space-y-4">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
