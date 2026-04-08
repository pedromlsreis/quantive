import { Link } from 'react-router-dom';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import {
  Eye, Brain, TrendingUp, Table2,
  LineChart, PieChart, Compass, Globe,
  Upload, Search, Target,
  ShieldCheck, WifiOff, HardDrive, Download,
  Briefcase, BarChart3, FileSpreadsheet, Sparkles,
  Star,
} from 'lucide-react';

/* ---------- tiny reusable card ---------- */
function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="group rounded-xl border border-border/40 bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

/* ============================================= */
export default function LandingPage() {
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
          A finance cockpit for personal-finance nerds who enjoy giving themselves a well-earned pat on the back.
        </p>
        <div className="relative z-10 mt-8 flex flex-wrap justify-center gap-4">
          <Link
            to="/dashboard"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105"
          >
            Get Started Free
          </Link>
          <Link
            to="/demo"
            className="rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-transform hover:scale-105"
          >
            Try Demo
          </Link>
        </div>

        {/* dashboard screenshot */}
        <div className="relative z-10 mx-auto mt-16 w-full max-w-4xl">
          <div className="animate-hero-glow-slow absolute -inset-4 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card p-1">
            <img
              src="/images/dashboard.png"
              alt="Networth Analysis dashboard preview"
              className="w-full h-auto rounded-lg"
            />
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
              { icon: Table2, title: 'Ditch the spreadsheet chaos', desc: 'Upload once, get beautiful charts and KPIs. No formulas, no formatting.' },
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
              { icon: Globe, title: 'Multi-Currency', desc: 'Support for EUR, USD, GBP, and CHF with live conversion.' },
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
              { icon: Upload, step: '1', title: 'Upload your Excel', desc: 'Drop your spreadsheet with net worth snapshots. We\'ll parse it instantly.' },
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
        <section className="flex justify-center border-t border-border/30 px-6 py-14">
          <Link
            to="/demo"
            className="rounded-lg bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105"
          >
            Try the Demo — No Sign Up Needed
          </Link>
        </section>

        {/* ───── PRIVACY ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">Your data stays yours</h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground">
            We don't connect to your bank. We don't harvest your data. Period.
          </p>
          <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ShieldCheck, text: 'No bank connections' },
              { icon: WifiOff, text: 'No tracking' },
              { icon: HardDrive, text: 'Local-first mindset' },
              { icon: Download, text: 'Export anytime' },
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
              { icon: BarChart3, title: 'Investors', desc: 'Tracking performance across portfolios.' },
              { icon: FileSpreadsheet, title: 'Spreadsheet Lovers', desc: 'Who want visuals without the formulas.' },
              { icon: Sparkles, title: 'Clarity Seekers', desc: 'Who want simplicity over complexity.' },
            ].map((p) => (
              <FeatureCard key={p.title} icon={p.icon} title={p.title} desc={p.desc} />
            ))}
          </div>
        </section>

        {/* ───── TESTIMONIALS ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">Trusted by people who want clarity</h2>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
            {[
              { name: 'Ana M.', quote: 'I finally understand where my money goes each month. The charts are beautiful.' },
              { name: 'James K.', quote: 'Replaced three different tools with this single dashboard. Love the forecasting.' },
              { name: 'Priya S.', quote: 'The privacy-first approach sold me. No bank logins, just my spreadsheet.' },
            ].map((t) => (
              <div key={t.name} className="flex flex-col items-center gap-4 rounded-xl border border-border/40 bg-card/50 p-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Star className="h-4 w-4 text-primary" />
                </div>
                <p className="text-sm italic leading-relaxed text-muted-foreground">"{t.quote}"</p>
                <span className="text-xs font-semibold text-foreground">{t.name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ───── FOUNDER STORY ───── */}
        <section className="border-t border-border/30 px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-6 text-3xl font-bold text-foreground">Built because existing tools weren't enough</h2>
            <p className="text-muted-foreground leading-relaxed">
              I built this because every finance app wanted my bank credentials, sold my data, or was bloated with features I didn't need.
              I wanted something simple: upload a spreadsheet, get beautiful insights, and track progress over time.
            </p>
            <p className="mt-4 text-sm italic text-primary">
              "A finance cockpit for personal-finance nerds who enjoy giving themselves a well-earned pat on the back."
            </p>
          </div>
        </section>

        {/* ───── PRICING ───── */}
        <section id="pricing" className="border-t border-border/30 px-6 py-20">
          <h2 className="mb-4 text-center text-3xl font-bold text-foreground">Simple, transparent pricing</h2>
          <p className="mx-auto mb-12 max-w-lg text-center text-muted-foreground">Start free, upgrade when you're ready.</p>
          <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
            {/* Free */}
            <div className="rounded-xl border border-border/40 bg-card/50 p-8">
              <h3 className="text-lg font-bold text-foreground">Free</h3>
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
            <Link
              to="/demo"
              className="rounded-lg border border-border bg-secondary px-6 py-3 text-sm font-semibold text-secondary-foreground transition-transform hover:scale-105"
            >
              Try Demo
            </Link>
          </div>
        </section>

      </div>

      <Footer />
    </div>
  );
}
