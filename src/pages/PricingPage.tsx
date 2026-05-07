import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-20 pt-32">
        <h1 className="mb-4 text-center text-4xl font-extrabold text-foreground">Simple, transparent pricing</h1>
        <p className="mx-auto mb-3 max-w-lg text-center text-muted-foreground">
          Start free, upgrade when you're ready. End-to-end encryption is included on every tier.
        </p>
        <p className="mx-auto mb-14 max-w-xl text-center text-sm font-medium text-primary">
          Sign up free now → get your first month of Pro on us when it launches.
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
                'Rolling 12-month history view',
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
            <p className="mt-1 text-3xl font-extrabold text-foreground">€69<span className="text-sm font-normal text-muted-foreground">/year</span></p>
            <p className="mt-1 text-xs text-muted-foreground">~€5.75/mo · or €9/mo billed monthly</p>

            <div className="mt-5 space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Know if you're on track</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Full historical view — every snapshot since you started, charted and tabular</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Forecasting engine — CAGR projection with 95% confidence intervals</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>
                      Milestone &amp; goal tracking
                      <span className="ml-2 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
                      </span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>
                      Benchmark comparison (vs. inflation, S&amp;P 500, MSCI World)
                      <span className="ml-2 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
                      </span>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>
                      Month-by-month summary table
                      <span className="ml-2 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        In development
                      </span>
                    </span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Get your data out</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Excel &amp; CSV export</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>PDF wealth report (one-page summary for advisors or annual review)</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Support</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    <span>Priority support (24h response)</span>
                  </li>
                </ul>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                const email = String(data.get('email') ?? '').trim();
                if (!email) return;
                // TODO: wire to waitlist endpoint
                form.reset();
                form.querySelector<HTMLElement>('[data-waitlist-success]')?.removeAttribute('hidden');
              }}
              className="mt-6"
            >
              <label htmlFor="pro-waitlist-pricing" className="block text-xs font-medium text-foreground">
                Join the Pro waitlist
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="pro-waitlist-pricing"
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
                >
                  Notify me
                </button>
              </div>
              <p data-waitlist-success hidden className="mt-2 text-xs text-accent">
                Thanks — we'll email you when Pro launches.
              </p>
            </form>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Existing free users get their first month of Pro on us.
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
