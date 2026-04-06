import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 pb-20 pt-32">
        <h1 className="mb-4 text-center text-4xl font-extrabold text-foreground">Simple, transparent pricing</h1>
        <p className="mx-auto mb-14 max-w-lg text-center text-muted-foreground">Start free, upgrade when you're ready.</p>

        <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
          {/* Free */}
          <div className="rounded-xl border border-border/40 bg-card/50 p-8">
            <h2 className="text-lg font-bold text-foreground">Free</h2>
            <p className="mt-1 text-3xl font-extrabold text-foreground">€0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {['Net worth tracking', 'Allocation charts', 'Multi-currency support', 'Excel upload'].map((f) => (
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
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              {[
                'Everything in Free',
                'Forecasting engine',
                'Unlimited sources',
                'Excel & PDF exports',
                'New measurements on-the-fly',
                'Priority support',
              ].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-primary">✓</span> {f}
                </li>
              ))}
            </ul>
            <button
              disabled
              className="mt-8 w-full rounded-lg bg-primary/50 py-2.5 text-center text-sm font-medium text-primary-foreground opacity-60"
            >
              Coming Soon
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
