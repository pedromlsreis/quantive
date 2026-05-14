import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { CURRENCY_CODES } from '@/lib/currencies';
import './landing.css';

// Built from the canonical list so marketing copy can't drift when a new
// currency is added. Two phrasings: a comma-joined enumeration ("EUR, USD,
// GBP, …") and a "N+" count phrasing for compact spots.
const SUPPORTED_LIST = CURRENCY_CODES.join(', ');
const SUPPORTED_COUNT = CURRENCY_CODES.length;

/* ── JSON-LD structured data (AEO) ─────────────────────────── */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://usequantive.app/#website',
      url: 'https://usequantive.app/',
      name: 'Quantive',
      description:
        'Privacy-first personal finance cockpit for tracking net worth and forecasting wealth.',
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Quantive',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description:
        'Track net worth, analyse asset allocations, and forecast future wealth — end-to-end encrypted, no bank connection required.',
      offers: [
        {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'EUR',
          description:
            'Free forever — unlimited tracking, multi-currency, encrypted cloud sync',
        },
        {
          '@type': 'Offer',
          price: '90',
          priceCurrency: 'EUR',
          description:
            'Pro — full history, forecasting engine, exports, PDF reports',
        },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is Quantive?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Quantive is a privacy-first personal finance cockpit that lets you track net worth, analyse asset allocations, and forecast future wealth — without connecting to your bank or sharing your financial data.",
          },
        },
        {
          '@type': 'Question',
          name: 'Is Quantive free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Yes. Quantive's core features are free forever with no credit card required. A Pro plan with full history, advanced forecasting, and export features is coming at €90/year.",
          },
        },
        {
          '@type': 'Question',
          name: 'How does Quantive protect my financial data?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "All data is encrypted on your device before it reaches Quantive's servers using end-to-end encryption. Quantive cannot read your financial information — only you hold the key.",
          },
        },
        {
          '@type': 'Question',
          name: 'Does Quantive connect to my bank?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'No. Quantive never connects to your bank accounts or requests login credentials. You enter balances manually or import them from an existing Excel spreadsheet.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I import my existing spreadsheet?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Excel import is included in the free plan. Upload your spreadsheet and your historical balance data is preserved in the app.',
          },
        },
        {
          '@type': 'Question',
          name: 'What currencies does Quantive support?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Quantive supports ${SUPPORTED_COUNT} display currencies (${SUPPORTED_LIST}). You can hold assets in any of them and view your portfolio in your preferred currency.`,
          },
        },
        {
          '@type': 'Question',
          name: 'What is included in Quantive Pro?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Pro adds full historical views, a CAGR forecasting engine with 95% confidence bands, milestone tracking, benchmark comparisons (S&P 500, MSCI World, inflation), Excel/CSV export, PDF wealth reports, and priority support.',
          },
        },
        {
          '@type': 'Question',
          name: 'What if I lose access to my Quantive account?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'During cloud sync setup, Quantive issues a 24-word recovery phrase (BIP-39 mnemonic). Storing it safely lets you recover your encrypted data if you lose account access.',
          },
        },
      ],
    },
  ],
};

/* ── FAQ data — kept in sync with the JSON-LD above ─────────── */
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'What is Quantive?',
    a: "Quantive is a privacy-first personal finance cockpit. Track net worth, analyse asset allocations, and forecast future wealth — without connecting to your bank or sharing your financial data with anyone.",
  },
  {
    q: 'Is Quantive free to use?',
    a: 'Yes. Core features are free forever with no credit card required. A Pro plan with full history, advanced forecasting, and export features is coming at €90/year.',
  },
  {
    q: 'How does Quantive protect my financial data?',
    a: 'All data is encrypted on your device using end-to-end encryption before it ever reaches Quantive’s servers. Quantive cannot read your financial information — only you hold the decryption key.',
  },
  {
    q: 'Does Quantive connect to my bank?',
    a: 'No. Quantive never connects to your bank accounts or requests login credentials. You enter balances manually from the dashboard, or import them from an existing Excel spreadsheet.',
  },
  {
    q: 'Can I import my existing spreadsheet?',
    a: 'Yes — Excel import is included in the free plan. Upload your existing spreadsheet and your historical balance data is preserved in Quantive.',
  },
  {
    q: 'What currencies does Quantive support?',
    a: `Quantive supports ${SUPPORTED_COUNT} display currencies (${SUPPORTED_LIST}). You can hold assets in any of them and view your full portfolio in your preferred currency.`,
  },
  {
    q: "What's included in Quantive Pro?",
    a: 'Pro adds full history across all snapshots, CAGR forecasting with 95% confidence bands, milestone and goal tracking, benchmark comparisons (vs. S&P 500, MSCI World, inflation), Excel/CSV export, PDF wealth reports, and priority support.',
  },
  {
    q: 'What if I lose access to my account?',
    a: 'During cloud sync setup, Quantive issues a 24-word recovery phrase (BIP-39 mnemonic). Storing it safely lets you recover your encrypted data even if you lose account access.',
  },
];

/* ── Scroll reveal hook ─────────────────────────────────────── */
function useScrollReveal(rootRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === 'undefined') {
      root.querySelectorAll('.lp-reveal').forEach((el) => el.classList.add('is-vis'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-vis');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.07 },
    );
    root.querySelectorAll('.lp-reveal').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

/* ── Inline SVG: animated hero net worth chart ──────────────── */
function HeroChart() {
  return (
    <svg
      viewBox="0 0 560 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Net worth chart rising from €100k to €134k over two years, with a forecast continuing upward"
    >
      <defs>
        <linearGradient id="lp-hero-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-raw)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--accent-raw)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="44" y1="22" x2="548" y2="22" stroke="var(--border-soft-raw)" strokeWidth="0.5" />
      <line x1="44" y1="48" x2="548" y2="48" stroke="var(--border-soft-raw)" strokeWidth="0.5" />
      <line x1="44" y1="74" x2="548" y2="74" stroke="var(--border-soft-raw)" strokeWidth="0.5" />
      <line x1="44" y1="100" x2="548" y2="100" stroke="var(--border-soft-raw)" strokeWidth="0.5" />
      <text x="2" y="25" fill="var(--fg-faint)" fontFamily="var(--font-mono)" fontSize="8.5">€140k</text>
      <text x="2" y="51" fill="var(--fg-faint)" fontFamily="var(--font-mono)" fontSize="8.5">€120k</text>
      <text x="2" y="77" fill="var(--fg-faint)" fontFamily="var(--font-mono)" fontSize="8.5">€100k</text>
      <text x="6" y="103" fill="var(--fg-faint)" fontFamily="var(--font-mono)" fontSize="8.5">€80k</text>
      <line x1="364" y1="8" x2="364" y2="120" stroke="var(--fg-faint)" strokeWidth="0.5" strokeDasharray="2,3" />
      <text x="367" y="17" fill="var(--fg-faint)" fontFamily="var(--font-mono)" fontSize="8.5">Today</text>
      <polygon
        className="lp-c-band"
        points="364,34 396,22 430,14 464,7 498,2 548,0 548,40 498,36 464,34 430,33 396,32 364,34"
        fill="var(--accent-raw)"
        opacity="0.07"
      />
      <polygon
        points="0,74 30,73 60,75 90,70 120,68 155,64 190,61 225,58 260,56 295,52 330,47 364,34 364,120 0,120"
        fill="url(#lp-hero-grad)"
      />
      <polyline
        className="lp-c-actual"
        points="0,74 30,73 60,75 90,70 120,68 155,64 190,61 225,58 260,56 295,52 330,47 364,34"
        stroke="var(--accent-raw)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        className="lp-c-forecast"
        points="364,34 396,28 430,22 464,16 498,10 548,4"
        stroke="var(--accent-raw)"
        strokeWidth="1.5"
        strokeDasharray="5,4"
        strokeLinecap="round"
      />
      <circle className="lp-c-dot" cx="364" cy="34" r="8" fill="var(--accent-raw)" opacity="0.15" />
      <circle className="lp-c-dot" cx="364" cy="34" r="4" fill="var(--accent-raw)" />
    </svg>
  );
}

/* ── Inline SVG: small feature-card net worth area chart ────── */
function FeatureMiniChart() {
  return (
    <svg viewBox="0 0 280 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="lp-feat-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-raw)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--accent-raw)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="22" x2="280" y2="22" stroke="var(--border-soft-raw)" strokeWidth="0.5" />
      <line x1="0" y1="52" x2="280" y2="52" stroke="var(--border-soft-raw)" strokeWidth="0.5" />
      <line x1="0" y1="82" x2="280" y2="82" stroke="var(--border-soft-raw)" strokeWidth="0.5" />
      <polygon
        points="0,82 35,80 70,82 105,74 140,68 175,60 210,50 245,38 280,22 280,100 0,100"
        fill="url(#lp-feat-grad)"
      />
      <polyline
        points="0,82 35,80 70,82 105,74 140,68 175,60 210,50 245,38 280,22"
        stroke="var(--accent-raw)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="280" cy="22" r="4" fill="var(--accent-raw)" />
      <text x="6" y="14" fill="var(--fg-faint)" fontFamily="var(--font-mono)" fontSize="8">NET WORTH</text>
      <text x="6" y="26" fill="var(--accent-raw)" fontFamily="var(--font-mono)" fontSize="14" fontWeight="500">€134,054</text>
      <text x="108" y="14" fill="var(--positive)" fontFamily="var(--font-mono)" fontSize="8">+13.4% ↑</text>
    </svg>
  );
}

/* ── Privacy icons (inline SVG) ─────────────────────────────── */
const PrivacyIcons = {
  lock: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="13" r="1.2" fill="currentColor" />
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2 L15 4.5 V9 C15 13 9 16 9 16 C9 16 3 13 3 9 V4.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 9 L8 11 L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  noEye: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 2 L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 4.5C7.6 4.2 8.3 4 9 4C12.5 4 15 9 15 9C15 9 14.3 10.2 13 11.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4.5 6C3.3 7.1 3 9 3 9C3 9 5.5 14 9 14C10.3 14 11.5 13.5 12.5 12.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  download: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2 V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 8.5 L9 12 L12.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 15 H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

/* ============================================================ */
export default function LandingPage() {
  const { user, loading } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  usePageMeta({
    title: 'Quantive — See Your Financial Life Clearly',
    description:
      'Quantive is a privacy-first finance cockpit. Track net worth, analyse allocations, and forecast your wealth — end-to-end encrypted, no bank connections. Free forever.',
    path: '/',
  });

  useScrollReveal(rootRef);

  /* JSON-LD: inject on mount, remove on unmount. */
  useEffect(() => {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify(STRUCTURED_DATA);
    document.head.appendChild(el);
    return () => {
      document.head.removeChild(el);
    };
  }, []);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div ref={rootRef} className="lp-root flex min-h-screen flex-col">
      <StickyNav />

      {/* ───── HERO ───── */}
      <section className="lp-hero" aria-labelledby="lp-hero-h1">
        <div className="lp-hero-glow" aria-hidden="true" />

        <div className="lp-hero-badge">
          <span className="lp-hero-badge-dot" aria-hidden="true" />
          Privacy-first · End-to-end encrypted · Free forever
        </div>

        <h1 className="lp-hero-h1" id="lp-hero-h1">
          See your financial life
          <br />
          <span className="lp-hero-accent">clearly.</span>
        </h1>

        <p className="lp-hero-sub">
          Track, analyse, and forecast your net worth across every account and currency — encrypted on your device, never connected to your bank.
        </p>

        <div className="lp-hero-ctas">
          <Link to="/dashboard" className="lp-btn-primary">
            Get Started Free
          </Link>
          <Link to="/demo" className="lp-btn-ghost">
            Try Demo — No Sign Up
          </Link>
        </div>

        <div className="lp-hero-visual lp-reveal">
          <div className="lp-hero-kpi-row">
            <div>
              <div className="lp-hero-kpi-label">NET WORTH · APR 2026</div>
              <div className="lp-hero-kpi-value num">€134,054</div>
            </div>
            <div className="lp-hero-kpi-delta num">+13.4% · 730 days ↑</div>
          </div>
          <div className="lp-hero-chart">
            <HeroChart />
          </div>
        </div>
      </section>

      {/* ───── TRUST BAND ───── */}
      <div className="lp-trust-band" role="list" aria-label="Key product properties">
        <span className="lp-trust-item" role="listitem">End-to-end encrypted</span>
        <span className="lp-trust-sep" aria-hidden="true">·</span>
        <span className="lp-trust-item" role="listitem">No bank connections required</span>
        <span className="lp-trust-sep" aria-hidden="true">·</span>
        <span className="lp-trust-item" role="listitem">Free forever — no credit card</span>
        <span className="lp-trust-sep" aria-hidden="true">·</span>
        <span className="lp-trust-item" role="listitem">Excel import included</span>
        <span className="lp-trust-sep" aria-hidden="true">·</span>
        <span className="lp-trust-item" role="listitem">{SUPPORTED_COUNT} display currencies</span>
      </div>

      {/* ───── FEATURES ───── */}
      <section className="lp-sec" id="features" aria-labelledby="lp-feat-h2">
        <div className="lp-reveal">
          <span className="lp-eyebrow">Features</span>
          <h2 className="lp-h2" id="lp-feat-h2">
            Powerful features,
            <br />
            zero complexity.
          </h2>
          <p className="lp-sub">
            Everything you need to track, analyse, and forecast your wealth — nothing you don't.
          </p>
        </div>

        <div className="lp-feat-hero lp-reveal" data-d="1">
          <div>
            <div className="lp-feat-num">01 — NET WORTH TRACKING</div>
            <h3 className="lp-feat-title">Your entire wealth in a single view</h3>
            <p className="lp-feat-desc">
              Record any account, asset, or liability. Quantive calculates your total net worth across all sources and currencies — displayed as interactive charts that update the moment you add a new measurement. No formulas. No maintenance.
            </p>
          </div>
          <div className="lp-feat-card" aria-hidden="true">
            <FeatureMiniChart />
          </div>
        </div>

        <div className="lp-feat-strip lp-reveal" data-d="2">
          <div className="lp-feat-col">
            <div className="lp-feat-col-num">02 — ALLOCATION ANALYSIS</div>
            <h3 className="lp-feat-col-title">Know your risk exposure</h3>
            <p className="lp-feat-col-desc">
              Visualise how your wealth is spread across asset classes, liquidity tiers, and volatility buckets — at a glance.
            </p>
          </div>
          <div className="lp-feat-col">
            <div className="lp-feat-col-num">03 — FORECASTING</div>
            <h3 className="lp-feat-col-title">See where you're heading</h3>
            <p className="lp-feat-col-desc">
              Project future net worth using a CAGR model with 95% confidence intervals. Understand your trajectory, and how fast you're getting there.
            </p>
          </div>
          <div className="lp-feat-col">
            <div className="lp-feat-col-num">04 — MULTI-CURRENCY</div>
            <h3 className="lp-feat-col-title">One view across currencies</h3>
            <p className="lp-feat-col-desc">
              Hold assets in any of {SUPPORTED_COUNT} currencies ({SUPPORTED_LIST}) — or all at once. View your full portfolio in the currency that makes sense to you.
            </p>
          </div>
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section className="lp-sec lp-sec--bordered" id="how" aria-labelledby="lp-how-h2">
        <div className="lp-reveal">
          <span className="lp-eyebrow">How it works</span>
          <h2 className="lp-h2" id="lp-how-h2">
            From zero to clarity
            <br />
            in three steps.
          </h2>
        </div>
        <div className="lp-steps">
          <div className="lp-step lp-reveal">
            <div className="lp-step-num num" aria-hidden="true">01</div>
            <div>
              <div className="lp-step-eyebrow">STEP 01</div>
              <h3 className="lp-step-title">Add a measurement</h3>
              <p className="lp-step-desc">
                Record balances directly from the dashboard. Already tracking in Excel? Import it instead — your full history comes with it, no data entry required.
              </p>
            </div>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-num num" aria-hidden="true">02</div>
            <div>
              <div className="lp-step-eyebrow">STEP 02</div>
              <h3 className="lp-step-title">Explore your dashboard</h3>
              <p className="lp-step-desc">
                Charts, KPI cards, allocation breakdowns, and forecasts appear automatically. No setup. No templates. No formulas to maintain.
              </p>
            </div>
          </div>
          <div className="lp-step lp-reveal">
            <div className="lp-step-num num" aria-hidden="true">03</div>
            <div>
              <div className="lp-step-eyebrow">STEP 03</div>
              <h3 className="lp-step-title">Track your progress</h3>
              <p className="lp-step-desc">
                Add new measurements over time. Watch your net worth grow, your allocation shift, and your forecast update — month by month.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───── PRIVACY ───── */}
      <section className="lp-sec" id="privacy" aria-labelledby="lp-priv-h2">
        <div className="lp-privacy-wrap lp-reveal">
          <div className="lp-privacy-head">
            <span className="lp-eyebrow">Privacy &amp; Security</span>
            <h2 className="lp-h2" id="lp-priv-h2" style={{ maxWidth: 540 }}>
              Your data stays yours.
              <br />
              We literally can't read it.
            </h2>
            <p className="lp-sub">
              All data is encrypted on your device before it ever leaves your browser. No plaintext reaches our servers — ever.
            </p>
            <Link to="/security" className="lp-security-link">Read the security details →</Link>
          </div>
          <div className="lp-privacy-grid">
            <div className="lp-privacy-item">
              <div className="lp-privacy-icon" aria-hidden="true">{PrivacyIcons.lock}</div>
              <div className="lp-privacy-title">End-to-end encrypted</div>
              <p className="lp-privacy-desc">
                AES-256 with a key derived from your passphrase. Your data is locked before it syncs.
              </p>
            </div>
            <div className="lp-privacy-item">
              <div className="lp-privacy-icon" aria-hidden="true">{PrivacyIcons.shield}</div>
              <div className="lp-privacy-title">No bank connections</div>
              <p className="lp-privacy-desc">
                Quantive never asks for banking credentials or connects to financial institutions.
              </p>
            </div>
            <div className="lp-privacy-item">
              <div className="lp-privacy-icon" aria-hidden="true">{PrivacyIcons.noEye}</div>
              <div className="lp-privacy-title">No tracking, no ads</div>
              <p className="lp-privacy-desc">
                No third-party analytics. No ad networks. No selling of financial behaviour data.
              </p>
            </div>
            <div className="lp-privacy-item">
              <div className="lp-privacy-icon" aria-hidden="true">{PrivacyIcons.download}</div>
              <div className="lp-privacy-title">Excel import &amp; export</div>
              <p className="lp-privacy-desc">
                Bring your history in, or take it out. Your data is never held hostage.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───── WHO IT'S FOR ───── */}
      <section className="lp-sec" aria-labelledby="lp-who-h2">
        <div className="lp-hd-center lp-reveal">
          <span className="lp-eyebrow">Who it's for</span>
          <h2 className="lp-h2" id="lp-who-h2">
            Built for people who take
            <br />
            their finances seriously.
          </h2>
        </div>
        <div className="lp-personas">
          <div className="lp-persona lp-reveal">
            <div className="lp-persona-name">Young professionals</div>
            <p className="lp-persona-desc">
              Building wealth intentionally — tracking every raise, investment, and decision against a long-term goal.
            </p>
            <span className="lp-persona-tag">Building wealth</span>
          </div>
          <div className="lp-persona lp-reveal" data-d="1">
            <div className="lp-persona-name">Self-directed investors</div>
            <p className="lp-persona-desc">
              Managing positions across multiple brokers and asset classes — needing one consolidated view, without sharing credentials anywhere.
            </p>
            <span className="lp-persona-tag">Multi-account portfolios</span>
          </div>
          <div className="lp-persona lp-reveal" data-d="2">
            <div className="lp-persona-name">Globally mobile</div>
            <p className="lp-persona-desc">
              Holding wealth across currencies, countries, and systems — needing a single cockpit that handles the complexity quietly.
            </p>
            <span className="lp-persona-tag">Multi-currency wealth</span>
          </div>
          <div className="lp-persona lp-reveal" data-d="3">
            <div className="lp-persona-name">Clarity seekers</div>
            <p className="lp-persona-desc">
              Done maintaining spreadsheets. Wanting the signal without the noise — and without handing over a bank login to get it.
            </p>
            <span className="lp-persona-tag">Privacy-first</span>
          </div>
        </div>
      </section>

      {/* ───── FOUNDER ───── */}
      <div className="lp-founder lp-reveal">
        <blockquote className="lp-founder-quote">
          Every finance app I tried wanted my bank credentials, monetised my data, or buried the basics under features I didn't need. I wanted something simple — track net worth, see clear charts, own my data end to end. So I built it.
        </blockquote>
        <p className="lp-founder-sig">— Founder, Quantive · usequantive.app</p>
      </div>

      {/* ───── PRICING ───── */}
      <section className="lp-sec lp-sec--bordered" id="pricing" aria-labelledby="lp-price-h2">
        <div className="lp-hd-center lp-reveal">
          <span className="lp-eyebrow">Pricing</span>
          <h2 className="lp-h2" id="lp-price-h2">Simple, transparent pricing.</h2>
          <p className="lp-sub">
            Start free. Upgrade when you're ready. End-to-end encryption on every tier — always.
          </p>
          <p className="lp-price-pre">
            Sign up free now → get your first month of Pro on us when it launches.
          </p>
        </div>

        <div className="lp-pricing">
          {/* Free */}
          <div className="lp-price lp-reveal">
            <div className="lp-price-name">Free</div>
            <div>
              <span className="lp-price-val num">€0</span>
              <span className="lp-price-period"> / forever</span>
            </div>
            <div className="lp-price-note">No credit card required.</div>
            <ul className="lp-price-features">
              <li><span className="lp-price-check">✓</span>Net worth tracking — unlimited sources</li>
              <li><span className="lp-price-check">✓</span>Allocation charts (volatility &amp; liquidity)</li>
              <li><span className="lp-price-check">✓</span>Multi-currency display ({SUPPORTED_COUNT} currencies)</li>
              <li><span className="lp-price-check">✓</span>Excel import</li>
              <li><span className="lp-price-check">✓</span>End-to-end encrypted cloud sync</li>
              <li><span className="lp-price-check">✓</span>Rolling 12-month history view</li>
            </ul>
            <Link to="/dashboard" className="lp-price-cta lp-price-cta--free">
              Get Started Free
            </Link>
          </div>

          {/* Pro */}
          <div className="lp-price lp-price--pro lp-reveal" data-d="1">
            <div className="lp-price-badge">Coming Soon</div>
            <div className="lp-price-name">Pro</div>
            <div>
              <span className="lp-price-val num">€90</span>
              <span className="lp-price-period"> / year</span>
            </div>
            <div className="lp-price-note">~€7.50/mo · or €9/mo billed monthly</div>
            <ul className="lp-price-features">
              <li className="lp-price-sec-head">Know if you're on track</li>
              <li><span className="lp-price-check">✓</span>Full historical view — every snapshot, charted</li>
              <li><span className="lp-price-check">✓</span>Forecasting engine — CAGR with 95% confidence bands</li>
              <li>
                <span className="lp-price-check">✓</span>
                Milestone &amp; goal tracking
                <span className="lp-price-soon">In development</span>
              </li>
              <li>
                <span className="lp-price-check">✓</span>
                Benchmarks (S&amp;P 500, MSCI World, inflation)
                <span className="lp-price-soon">In development</span>
              </li>
              <li className="lp-price-sec-head">Get your data out</li>
              <li><span className="lp-price-check">✓</span>Excel &amp; CSV export</li>
              <li><span className="lp-price-check">✓</span>PDF wealth report — for advisors or annual review</li>
              <li className="lp-price-sec-head">Support</li>
              <li><span className="lp-price-check">✓</span>Priority support — 24h response</li>
            </ul>
            <Link to="/dashboard" className="lp-price-cta lp-price-cta--pro">
              Sign up free — get notified when Pro launches
            </Link>
            <p className="lp-price-foot">Existing free users get their first month on us.</p>
          </div>
        </div>
        <p className="lp-price-postscript">
          A Family tier (shared portfolios for 2 users) is planned. Not yet available.
        </p>
      </section>

      {/* ───── FAQ ───── */}
      <section className="lp-sec lp-sec--bordered" id="faq" aria-labelledby="lp-faq-h2">
        <div className="lp-reveal">
          <span className="lp-eyebrow">FAQ</span>
          <h2 className="lp-h2" id="lp-faq-h2">
            Common questions,
            <br />
            direct answers.
          </h2>
        </div>
        <div className="lp-faq-list lp-reveal" data-d="1">
          {FAQS.map((item, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={item.q} className={`lp-faq-item ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="lp-faq-btn"
                  aria-expanded={isOpen}
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                >
                  {item.q}
                  <span className="lp-faq-icon" aria-hidden="true">+</span>
                </button>
                <div className="lp-faq-ans">{item.a}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── FOOTER CTA ───── */}
      <div className="lp-cta lp-reveal">
        <div className="lp-cta-glow" aria-hidden="true" />
        <h2 className="lp-cta-h2">Start tracking your wealth today.</h2>
        <p className="lp-cta-sub">Free forever. No credit card. No bank logins.</p>
        <div className="lp-cta-actions">
          <Link to="/dashboard" className="lp-btn-primary">Get Started Free</Link>
          <Link to="/demo" className="lp-btn-ghost">Try Demo First</Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
