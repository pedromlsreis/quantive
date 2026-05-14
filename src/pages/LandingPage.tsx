import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { AllocationChartsView } from '@/components/dashboard/AllocationCharts';
import { generateMockData, toSnapshots } from '@/lib/mockData';
import { useCurrencyFormatter } from '@/hooks/useCurrencyFormatter';
import {
  Eye, Brain, TrendingUp, Plus,
  LineChart, PieChart, Compass, Globe,
  Search, Target,
  ShieldCheck, WifiOff, Lock, Download,
  Briefcase, BarChart3, Sparkles,
  type LucideIcon,
} from 'lucide-react';

/* ---------- tiny reusable card ---------- */
function FeatureCard({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="group rounded-xl border border-border/40 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card">
      <div
        className="mb-4 transition-colors"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 40, height: 40, borderRadius: 'var(--r-2)',
          background: 'var(--accent-faint-raw)',
        }}
      >
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

/* ============================================= */
export default function LandingPage() {
  const { user, loading } = useAuth();

  usePageMeta({
    title: 'Quantive – See Your Financial Life Clearly',
    description: 'A privacy-first finance cockpit. Upload your spreadsheet, track net worth, analyse allocations, and forecast your future. Free forever.',
    path: '/',
  });
  const { fmt } = useCurrencyFormatter();

  const previewSnapshots = useMemo(() => toSnapshots(generateMockData()), []);
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      {/* ───── HERO ───── */}
      <section className="relative flex flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-32 text-center md:pt-40">
        {/* animated glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[500px] w-[500px] animate-hero-glow rounded-full bg-primary/20 blur-[120px]" />
        </div>

        <h1 className="relative z-10 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          See your financial life{' '}
          <span className="text-primary">clearly</span>
        </h1>
        <p className="relative z-10 mt-5 max-w-xl text-lg text-muted-foreground">
          Track, analyse, and forecast your net worth across accounts and currencies — end-to-end encrypted, never connected to your bank.
        </p>
        <div className="relative z-10 mt-8 flex flex-wrap justify-center gap-4">
          <Link
            to="/dashboard"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105"
          >
            Get Started Free
          </Link>
          {!user && (
            <Link
              to="/demo"
              className="rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-transform hover:scale-105"
            >
              Try Demo
            </Link>
          )}
        </div>

        {/* live allocation preview (mock data) */}
        <div className="relative z-10 mx-auto mt-24 w-full max-w-4xl text-left">
          <div className="animate-hero-glow-slow absolute -inset-4 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 sm:p-6">
            <AllocationChartsView snapshots={previewSnapshots} fmt={fmt} />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1400px]">

        {/* ───── BENEFITS ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">Why people love this tool</h2>
          <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
            {[
              { icon: Eye, title: 'See your financial life clearly', desc: 'One glance to understand where you stand — net worth, allocations, and trends.' },
              { icon: Brain, title: 'Make smarter decisions with real data', desc: 'Replace gut feelings with actual numbers. Your spreadsheet, supercharged.' },
              { icon: TrendingUp, title: 'Know your future, not just your past', desc: 'Forecasting tools that show you where you\'re heading — and how fast.' },
              { icon: Plus, title: 'Start from zero', desc: 'Add your first measurement in seconds — no template, no formulas, no spreadsheet to maintain.' },
            ].map((b) => (
              <FeatureCard key={b.title} {...b} />
            ))}
          </div>
        </section>

        {/* ───── FEATURES ───── */}
        <section id="features" className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">Powerful features, zero complexity</h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground">Everything you need to track, analyse, and forecast your wealth.</p>
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: LineChart, title: 'Net Worth Tracking', desc: 'Track your total wealth over time with interactive charts.' },
              { icon: PieChart, title: 'Allocation Analysis', desc: 'Visualise asset allocation and risk exposure at a glance.' },
              { icon: Compass, title: 'Forecasting', desc: 'Project future net worth with configurable growth models.' },
              { icon: Globe, title: 'Multi-Currency', desc: 'Display your wealth in EUR, USD, GBP, or NOK.' },
            ].map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </div>
        </section>

        {/* ───── HOW IT WORKS ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">How it works</h2>
          <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-3">
            {[
              { icon: Plus, step: '1', title: 'Add a measurement', desc: 'Record balances directly from the dashboard. Already track in Excel? Import it instead.' },
              { icon: Search, step: '2', title: 'Explore your dashboard', desc: 'Charts, KPIs, and allocation breakdowns appear automatically.' },
              { icon: Target, step: '3', title: 'Track your progress', desc: 'Add new measurements over time and watch your wealth grow.' },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                  {step}
                </div>
                <Icon className="mb-3 h-6 w-6 text-muted-foreground" />
                <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ───── MID-PAGE CTA ───── */}
        {!user && (
          <section className="flex justify-center border-t border-border/30 px-6 py-14">
            <Link
              to="/demo"
              className="rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105"
            >
              Try the Demo — No Sign Up Needed
            </Link>
          </section>
        )}

        {/* ───── PRIVACY ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">Your data stays yours</h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground">
            Your data is encrypted on your device before it ever reaches our servers. We literally can't read it.
          </p>
          <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Lock, text: 'End-to-end encrypted' },
              { icon: ShieldCheck, text: 'No bank connections' },
              { icon: WifiOff, text: 'No tracking, no ads' },
              { icon: Download, text: 'Excel import included' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex flex-col items-center gap-3 rounded-xl border border-border/40 bg-card/50 p-6 text-center">
                <Icon className="h-6 w-6 text-accent" />
                <span className="text-sm font-medium text-foreground">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ───── WHO IS THIS FOR ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">Perfect for…</h2>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Briefcase, title: 'Young Professionals', desc: 'Building wealth with intention.' },
              { icon: BarChart3, title: 'Self-Directed Investors', desc: 'Tracking performance across brokers and accounts.' },
              { icon: Globe, title: 'Globally Mobile', desc: 'Holding wealth across currencies and borders.' },
              { icon: Sparkles, title: 'Clarity Seekers', desc: 'Who want simplicity over complexity.' },
            ].map((p) => (
              <FeatureCard key={p.title} icon={p.icon} title={p.title} desc={p.desc} />
            ))}
          </div>
        </section>

        {/* ───── FOUNDER STORY ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-6 text-3xl font-bold text-foreground">Built because existing tools weren't enough</h2>
            <p className="text-muted-foreground leading-relaxed">
              Every finance app I tried wanted my bank credentials, monetised my data, or buried the basics under features I didn't need.
              I wanted something simple: track net worth, see clear charts, watch progress over time — and own my data end to end.
              So everything you enter is encrypted on your device before it syncs. Even we can't read it.
            </p>
            <p className="mt-4 text-sm italic text-primary">
              "A clear view of your net worth — without handing over your bank login or your data."
            </p>
          </div>
        </section>

        {/* ───── PRICING ───── */}
        <section id="pricing" className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">Simple, transparent pricing</h2>
          <p className="mx-auto mb-3 max-w-lg text-center text-muted-foreground">
            Start free, upgrade when you're ready. End-to-end encryption is included on every tier.
          </p>
          <p className="mx-auto mb-12 max-w-xl text-center text-sm font-medium text-primary">
            Sign up free now → get your first month of Pro on us when it launches.
          </p>
          <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
            {/* Free */}
            <div className="rounded-xl border border-border/40 bg-card/50 p-8">
              <h3 className="text-lg font-bold text-foreground">Free</h3>
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
                className="mt-8 block w-full rounded-lg border border-border bg-secondary py-2.5 text-center text-sm font-medium text-secondary-foreground transition-transform hover:scale-105"
              >
                Get Started
              </Link>
            </div>
            {/* Pro */}
            <div className="relative rounded-xl border-2 border-primary/50 bg-card p-8">
              <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                Coming Soon
              </span>
              <h3 className="text-lg font-bold text-foreground">Pro</h3>
              <p className="mt-1 text-3xl font-extrabold text-foreground">€90<span className="text-sm font-normal text-muted-foreground">/year</span></p>
              <p className="mt-1 text-xs font-normal text-muted-foreground">~€7.50/mo · or €9/mo billed monthly</p>

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

              <Link
                to="/dashboard"
                className="mt-6 block rounded-lg bg-primary py-2.5 text-center text-sm font-medium text-primary-foreground transition-transform hover:scale-105"
              >
                Sign up free — get notified when Pro launches
              </Link>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Existing free users get their first month of Pro on us.
              </p>
            </div>
          </div>
          <p className="mx-auto mt-8 max-w-lg text-center text-xs text-muted-foreground">
            A Family tier (shared portfolios for 2 users) is planned. Not yet available.
          </p>
        </section>

        {/* ───── FOOTER CTA ───── */}
        <section className="border-t border-border/30 px-6 py-20 text-center">
          <h2 className="text-3xl font-bold text-foreground">Start tracking your wealth today</h2>
          <p className="mt-3 text-muted-foreground">Free forever. No credit card required.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105"
            >
              Get Started Free
            </Link>
            {!user && (
              <Link
                to="/demo"
                className="rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-transform hover:scale-105"
              >
                Try Demo
              </Link>
            )}
          </div>
        </section>

      </div>

      <Footer />
    </div>
  );
}
