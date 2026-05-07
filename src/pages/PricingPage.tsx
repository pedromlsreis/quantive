import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-20 pt-32">
        <h1 className="mb-4 text-center text-4xl font-extrabold text-foreground">Simple, transparent pricing</h1>
        <p className="mx-auto mb-14 max-w-lg text-center text-muted-foreground">
          Start free, upgrade when you're ready. End-to-end encryption is included on every tier.
        </p>

        <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
          {/* Free */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-8">
            <h2 className="text-lg font-bold text-foreground">Free</h2>
            <p className="mt-1 text-3xl font-extrabold text-foreground">€0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Forever. No credit card required.</p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {[
                'Net worth tracking with unlimited sources',
                'Allocation charts (volatility & liquidity)',
                'Multi-currency display (EUR, USD, GBP, NOK)',
                'Excel import',
                'Manual balance entry',
                'End-to-end encrypted cloud sync',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-accent">✓</span> {f}
                </li>
              ))}
            </ul>
            <Link
              to="/dashboard"
              className="mt-8 block rounded-lg border border-border bg-secondary py-2.5 text-center text-sm font-medium text-secondary-foreground transition-transform hover:scale-105"
            >
              Get Started
            </Link>
          </div>

          {/* Pro */}
          <div className="relative rounded-xl border-2 border-primary/50 bg-card p-8">
            <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
              Coming Soon
            </span>
            <h2 className="text-lg font-bold text-foreground">Pro</h2>
            <p className="mt-1 text-3xl font-extrabold text-foreground">€9<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <p className="mt-1 text-xs text-muted-foreground">or €79/year (~€6.60/mo, 2 months free)</p>
            <p className="mt-3 text-xs font-medium text-foreground">Everything in Free, plus:</p>
            <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
              {[
                { label: 'Forecasting engine — CAGR projection with 95% confidence intervals', soon: false },
                { label: 'Excel & CSV export', soon: false },
                { label: 'PDF wealth report', soon: false },
                { label: 'Milestone & goal tracking', soon: true },
                { label: 'Benchmark comparison', soon: true },
                { label: 'Month-by-month summary table', soon: true },
                { label: 'Priority support (24h response)', soon: false },
              ].map((f) => (
                <li key={f.label} className="flex items-start gap-2">
                  <span className="mt-0.5 text-primary">✓</span>
                  <span>
                    {f.label}
                    {f.soon && (
                      <span className="ml-2 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <button
              disabled
              className="mt-8 w-full rounded-lg bg-primary/50 py-2.5 text-center text-sm font-medium text-primary-foreground opacity-60"
            >
              Coming Soon
            </button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Free users at launch get at least 3 months of Pro on us.
            </p>
          </div>
        </div>

        {/* Family — planned */}
        <div className="mx-auto mt-10 max-w-3xl rounded-xl border border-dashed border-border/60 bg-card/30 p-6 text-center">
          <h3 className="text-sm font-semibold text-foreground">
            Family <span className="ml-2 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Planned</span>
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            Shared portfolio access for 2 users, plus multiple portfolios per account. Not yet available — requires shared-key encryption work first.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
