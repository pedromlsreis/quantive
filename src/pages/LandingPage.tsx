import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import { StickyNav } from '@/components/landing/StickyNav';
import { Footer } from '@/components/Footer';
import { CURRENCY_CODES } from '@/lib/currencies';
import {
  FREE_SECTIONS,
  PRO_SECTIONS,
  PRICING_HEADLINE,
  PRICING_SUB,
  VAT_NOTE,
} from '@/lib/billing/planCopy';
import { analytics } from '@/lib/analytics';
import { EmailCapture } from '@/components/landing/EmailCapture';
import { EMAIL_CAPTURE_ENABLED } from '@/lib/emailSignup';
import './landing.css';

// Built from the canonical list so marketing copy can't drift when a new
// currency is added. Two phrasings: a comma-joined enumeration ("EUR, USD,
// GBP, …") and a "N+" count phrasing for compact spots.
const SUPPORTED_LIST = CURRENCY_CODES.join(', ');
const SUPPORTED_COUNT = CURRENCY_CODES.length;

/* ── FAQ data — single source of truth, also feeds JSON-LD below */
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is Quantive?",
    a: "Quantive is a net worth tracker for people who manage their own investments manually — across brokers, banks, pension accounts, real estate, crypto, or whatever else you hold. Enter your balances or import your existing spreadsheet, and Quantive shows your net worth, allocation, and forecast in one place. No bank logins, no transaction feeds, and everything is encrypted on your device before it reaches our servers.",
  },
  {
    q: "Is Quantive free to use?",
    a: "Yes. Core features are free forever with no credit card required. Pro is €9/month or €90/year and adds full history, CAGR forecasting, goals, benchmarks, a PDF wealth report, and Excel/CSV export.",
  },
  {
    q: "How is Quantive different from a budgeting app?",
    a: "Budgeting apps connect to your bank to categorise transactions. Quantive does neither: it tracks net worth and wealth over time from balances you enter or import, with no bank links and end-to-end encryption, so your financial data stays private to you.",
  },
  {
    q: "Does Quantive connect to my bank?",
    a: "No. Quantive never connects to your bank accounts or requests login credentials. You enter balances manually from the dashboard, or import them from an existing spreadsheet.",
  },
  {
    q: "Can I import my existing spreadsheet?",
    a: "Yes. Spreadsheet import is included in the free plan. Upload your existing spreadsheet and your historical balance data is preserved in Quantive.",
  },
  {
    q: "Can I access my portfolio on my phone?",
    a: "Yes. Quantive is a web app and works in any mobile browser — open it on your phone and your current net worth is right there. A native iOS and Android app is on the roadmap.",
  },
  {
    q: "How does Quantive protect my financial data?",
    a: "All data is encrypted on your device before it reaches Quantive's servers; the servers store only ciphertext, and only you hold the decryption key. The remaining trust is in the code we serve, as with any encrypted web app; the security page documents the full threat model.",
  },
  {
    q: "Can I self-host Quantive, or is it open source?",
    a: "The cryptography is open source (MIT) and the rest of the code is source-available, so you can read exactly how your data is encrypted before you trust it. Quantive itself is hosted rather than self-hostable: we run the servers so there's nothing to maintain, and because your data is encrypted in your browser first, those servers only ever hold ciphertext. If your priority is keeping data entirely on your own machine or running your own server, a local-first open-source desktop tracker will suit you better. What Quantive offers instead is zero setup, cross-device access from any browser, and a server that still can't read your finances.",
  },
  {
    q: "What currencies does Quantive support?",
    a: `Quantive supports ${SUPPORTED_COUNT} display currencies (${SUPPORTED_LIST}). You can hold assets in any of them and view your full portfolio in your preferred currency.`,
  },
  {
    q: "What's included in Quantive Pro?",
    a: "Pro adds full history across all snapshots, CAGR forecasting with 95% confidence bands, milestone and goal tracking, benchmark comparisons (S&P 500 and inflation; MSCI World is on the roadmap), a month-by-month summary table, a PDF wealth report, and Excel and CSV export. Priority support is included.",
  },
  {
    q: "What if I lose access to my account?",
    a: "During cloud sync setup, Quantive issues a 24-word recovery phrase (BIP-39 mnemonic). Storing it safely lets you recover your encrypted data even if you lose account access.",
  },
];

/* JSON-LD lives in index.html as the canonical schema source for crawlers.
   Keep the visible FAQS array (above) in sync with the FAQPage block there. */

/* ── Scroll reveal hook ─────────────────────────────────────── */
function useScrollReveal(rootRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') {
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
      aria-label="Net worth chart rising from €100k to €134k over two years, with a dashed forecast extending upward toward €140k"
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

/* ── Lock glyph for the encryption boundary (inline SVG) ─────── */
const LockIcon = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="3" y="8" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="9" cy="13" r="1.2" fill="currentColor" />
  </svg>
);

/* ── Privacy section: the encryption-boundary flow. Plaintext stays in
   your browser; only ciphertext crosses to our servers. ──────────────── */
function PrivacyFlow() {
  return (
    <>
      <div className="lp-pb">
        <div className="lp-pb-node lp-pb-node--you">
          <span className="lp-pb-label">Your browser</span>
          <div className="lp-pb-val tabular">€134,054</div>
          <span className="lp-pb-sub">plaintext, on your device</span>
        </div>
        <div className="lp-pb-track" aria-hidden="true">
          <span className="lp-pb-dot" />
          <span className="lp-pb-line lp-pb-line--solid" />
          <span className="lp-pb-boundary">
            <span className="lp-pb-boundary-label">Argon2id · XChaCha20-Poly1305</span>
            <span className="lp-pb-boundary-lock">{LockIcon}</span>
          </span>
          <span className="lp-pb-line lp-pb-line--dashed" />
          <span className="lp-pb-ring" />
        </div>
        <div className="lp-pb-node lp-pb-node--server">
          <span className="lp-pb-label">Quantive servers</span>
          <div className="lp-pb-cipher">9f2a c4e1 7b00</div>
          <span className="lp-pb-sub">ciphertext only</span>
        </div>
      </div>
      <p className="sr-only">
        Your balances are encrypted in your browser before they sync. Quantive&apos;s servers receive and
        store only ciphertext.
      </p>
    </>
  );
}

/* ============================================================ */
export default function LandingPage() {
  const { user, loading } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  usePageMeta(getRouteMeta('/'));

  useScrollReveal(rootRef);

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div ref={rootRef} className="lp-root flex min-h-screen flex-col">
      <StickyNav />

      <main id="main-content">

      {/* ───── HERO ───── */}
      <section className="lp-hero" aria-labelledby="lp-hero-h1">
        <h1 className="lp-hero-h1" id="lp-hero-h1">
          The net worth spreadsheet{' '}
          <br className="lp-hero-h1-br" />
          you've{' '}<span className="lp-hero-accent">outgrown.</span>
        </h1>

        <p className="lp-hero-sub">
          Quantive replaces the spreadsheet you keep across brokers, banks, and {SUPPORTED_COUNT} currencies. Enter your balances or import what you already track, and read your net worth, allocation, and forecast in one place. No bank logins, on any device.
        </p>

        <div className="lp-hero-ctas">
          <Link
            to="/dashboard"
            className="lp-btn-primary"
            onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'hero' })}
          >
            Get started free
          </Link>
          <Link
            to="/demo"
            className="lp-btn-ghost"
            onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'hero' })}
          >
            Try the demo, no sign-up
          </Link>
        </div>

        <div className="lp-hero-visual lp-reveal">
          <div className="lp-hero-kpi-row">
            <div>
              <div className="lp-hero-kpi-label">NET WORTH · APR 2026</div>
              <div className="lp-hero-kpi-value tabular">€134,054</div>
            </div>
            <div className="lp-hero-kpi-delta tabular">+13.4% · 730 days ↑</div>
          </div>
          <div className="lp-hero-chart">
            <HeroChart />
          </div>
        </div>
      </section>

      {/* ───── FEATURES ───── */}
      <section className="lp-sec" id="features" aria-labelledby="lp-feat-h2">
        <div className="lp-reveal">
          <span className="lp-eyebrow">Features</span>
          <h2 className="lp-h2" id="lp-feat-h2">What Quantive does.</h2>
        </div>

        <div className="lp-feat-hero lp-reveal" data-d="1">
          <div>
            <h3 className="lp-feat-title">Your entire wealth in a single view</h3>
            <p className="lp-feat-desc">
              Record each account, asset, and liability once; Quantive rolls them into a single net worth figure across sources and currencies, and the charts update as you add measurements.
            </p>
          </div>
          <div className="lp-shot">
            <video
              poster="/landing/dashboard.webp"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="Screen recording of Quantive: the dashboard overview, then the allocations view cycling through treemap, bars, and donut charts, then the forecast and performance pages"
            >
              <source src="/landing/tour.mp4" type="video/mp4" />
              <source src="/landing/tour.webm" type="video/webm" />
            </video>
          </div>
        </div>

        <div className="lp-feat-strip lp-reveal" data-d="2">
          <div className="lp-feat-col">
            <h3 className="lp-feat-col-title">Know your risk exposure</h3>
            <p className="lp-feat-col-desc">
              Track how your wealth is spread across liquidity tiers and volatility buckets.
            </p>
          </div>
          <div className="lp-feat-col">
            <h3 className="lp-feat-col-title">See where you're heading</h3>
            <p className="lp-feat-col-desc">
              Project future net worth with a CAGR model and 95% confidence bands.
            </p>
          </div>
          <div className="lp-feat-col">
            <h3 className="lp-feat-col-title">All your currencies</h3>
            <p className="lp-feat-col-desc">
              Hold assets in any of {SUPPORTED_COUNT} currencies and read your full portfolio in the one you prefer.
            </p>
          </div>
        </div>

      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section className="lp-sec" id="how" aria-labelledby="lp-how-h2">
        <div className="lp-reveal">
          <span className="lp-eyebrow">How it works</span>
          <h2 className="lp-h2" id="lp-how-h2">Three steps to start tracking.</h2>
        </div>
        <ol className="lp-steps" role="list">
          <li className="lp-step lp-reveal">
            <span className="lp-step-dot" aria-hidden="true" />
            <div>
              <span className="lp-step-when">Today</span>
              <h3 className="lp-step-title">Add a measurement</h3>
              <p className="lp-step-desc">
                Record balances directly from the dashboard. If you already track in a spreadsheet, import it and your history comes along.
              </p>
            </div>
          </li>
          <li className="lp-step lp-reveal" data-d="1">
            <span className="lp-step-dot" aria-hidden="true" />
            <div>
              <span className="lp-step-when">Moments later</span>
              <h3 className="lp-step-title">Explore your dashboard</h3>
              <p className="lp-step-desc">
                Charts, KPI cards, allocation breakdowns, and a forecast appear automatically; there is nothing to configure.
              </p>
            </div>
          </li>
          <li className="lp-step lp-reveal" data-d="2">
            <span className="lp-step-dot" aria-hidden="true" />
            <div>
              <span className="lp-step-when">Every month after</span>
              <h3 className="lp-step-title">Track your progress</h3>
              <p className="lp-step-desc">
                Add new measurements over time. Net worth becomes a number you check monthly, not a number you guess.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* ───── PRIVACY ───── */}
      <section className="lp-sec" id="privacy" aria-labelledby="lp-priv-h2">
        <div className="lp-priv lp-reveal">
          <div className="lp-priv-intro">
            <span className="lp-eyebrow">Privacy &amp; Security</span>
            <h2 className="lp-h2" id="lp-priv-h2">
              Your data stays yours.
              <br />
              We can't read it.
            </h2>
            <p className="lp-sub">
              Everything is encrypted on your device before it leaves your browser; the servers store only ciphertext. The honest caveat: you still trust the code we serve, as with any encrypted web app.
            </p>
            <Link to="/security" target="_blank" rel="noopener noreferrer" className="lp-security-link">Read the full threat model →</Link>
          </div>
          <ul className="lp-priv-guarantees" role="list">
            <li>End-to-end encrypted</li>
            <li>No bank connections</li>
            <li>No ads, no profiling</li>
            <li>No lock-in</li>
          </ul>
          <PrivacyFlow />
        </div>
      </section>

      {/* ───── WHO IT'S FOR ───── */}
      <section className="lp-sec" aria-labelledby="lp-who-h2">
        <div className="lp-hd-center lp-reveal">
          <span className="lp-eyebrow">Who it's for</span>
          <h2 className="lp-h2" id="lp-who-h2">For people who keep their own records.</h2>
        </div>
        <div className="lp-fit">
          <div className="lp-fit-col lp-reveal">
            <p className="lp-fit-head">Made for you if</p>
            <ul className="lp-fit-list" role="list">
              <li className="lp-fit-item">
                You hold accounts across several brokers, banks, and currencies, and want one honest total.
              </li>
              <li className="lp-fit-item">
                You'd rather enter balances once a month than connect a bank to an aggregator.
              </li>
              <li className="lp-fit-item">
                You're tracking net worth over years, not categorising this week's spending.
              </li>
              <li className="lp-fit-item">
                You've outgrown a hand-built spreadsheet but want to keep its history.
              </li>
            </ul>
          </div>
          <div className="lp-fit-col lp-fit-col--no lp-reveal" data-d="1">
            <p className="lp-fit-head">Not for you if</p>
            <ul className="lp-fit-list" role="list">
              <li className="lp-fit-item">
                You want automatic bank sync and transaction feeds.
                <span className="lp-fit-note">Quantive never connects to your bank, by design.</span>
              </li>
              <li className="lp-fit-item">
                You're after a budgeting app to categorise spending.
                <span className="lp-fit-note">Quantive tracks wealth, not spending.</span>
              </li>
              <li className="lp-fit-item">
                You need day-trading dashboards or live prices.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ───── FOUNDER ───── */}
      <div className="lp-founder lp-reveal">
        <blockquote className="lp-founder-quote">
          Every finance app I tried either wanted my bank login or wanted to monetise my data. I keep my own numbers and I just wanted something simple: to see them charted properly and kept private, as they should be.
        </blockquote>
        <p className="lp-founder-sig">— Pedro Reis, founder · usequantive.app</p>
      </div>

      {/* ───── PRICING ───── */}
      <section className="lp-sec" id="pricing" aria-labelledby="lp-price-h2">
        <div className="lp-hd-center lp-reveal">
          <span className="lp-eyebrow">Pricing</span>
          <h2 className="lp-h2" id="lp-price-h2">{PRICING_HEADLINE}.</h2>
          <p className="lp-sub">{PRICING_SUB}</p>
        </div>

        <div className="lp-pricing">
          {/* Free */}
          <div className="lp-price lp-reveal">
            <div className="lp-price-name">Free</div>
            <div>
              <span className="lp-price-val tabular">€0</span>
              <span className="lp-price-period"> / forever</span>
            </div>
            <div className="lp-price-note">No credit card required.</div>
            <ul className="lp-price-features">
              {FREE_SECTIONS.map((sec) => (
                <Fragment key={sec.head}>
                  <li className="lp-price-sec-head">{sec.head}</li>
                  {sec.items.map((item) => (
                    <li key={item}>
                      <span className="lp-price-check">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </Fragment>
              ))}
            </ul>
            <Link
              to="/dashboard"
              className="lp-price-cta lp-price-cta--free"
              onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'pricing_card' })}
            >
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className="lp-price lp-price--pro lp-reveal" data-d="1">
            <div className="lp-price-name">Pro</div>
            <div>
              <span className="lp-price-val tabular">€90</span>
              <span className="lp-price-period"> / year</span>
            </div>
            <div className="lp-price-note">~€7.50/mo · or €9/mo billed monthly</div>
            <ul className="lp-price-features">
              {PRO_SECTIONS.map((sec) => (
                <Fragment key={sec.head}>
                  <li className="lp-price-sec-head">{sec.head}</li>
                  {sec.items.map((item) => (
                    <li key={item}>
                      <span className="lp-price-check">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </Fragment>
              ))}
            </ul>
            <Link
              to="/pricing"
              className="lp-price-cta lp-price-cta--pro"
              onClick={() => {
                analytics.landingCtaClicked({ cta: 'pro_signup', location: 'pricing_card' });
                analytics.proGateHit({ feature: 'pricing_card_pro_cta' });
              }}
            >
              See Pro plans
            </Link>
          </div>
        </div>
        <p className="lp-price-vat-foot">{VAT_NOTE}</p>
        <p className="lp-price-postscript">
          A Family tier (shared portfolios for two users) is planned but not yet available.
        </p>
      </section>

      {/* ───── FAQ ───── */}
      <section className="lp-sec" id="faq" aria-labelledby="lp-faq-h2">
        <div className="lp-reveal">
          <span className="lp-eyebrow">FAQ</span>
          <h2 className="lp-h2" id="lp-faq-h2">
            Frequent questions.
          </h2>
        </div>
        <div className="lp-faq-list lp-reveal" data-d="1">
          {FAQS.map((item, i) => {
            const isOpen = openFaq === i;
            const panelId = `lp-faq-panel-${i}`;
            const btnId = `lp-faq-btn-${i}`;
            return (
              <div key={item.q} className={`lp-faq-item ${isOpen ? 'is-open' : ''}`}>
                <button
                  id={btnId}
                  type="button"
                  className="lp-faq-btn"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                >
                  {item.q}
                  <span className="lp-faq-icon" aria-hidden="true">+</span>
                </button>
                <div id={panelId} role="region" aria-labelledby={btnId} className="lp-faq-ans">
                  <div className="lp-faq-ans-inner">
                    <div className="lp-faq-ans-body">{item.a}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── FOOTER CTA ───── */}
      <div className="lp-cta lp-reveal">
        <h2 className="lp-cta-h2">Start with one measurement.</h2>
        <p className="lp-cta-sub">Free forever, no credit card.</p>
        <div className="lp-cta-actions">
          <Link
            to="/dashboard"
            className="lp-btn-primary"
            onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'footer' })}
          >
            Get started free
          </Link>
          <Link
            to="/demo"
            className="lp-btn-ghost"
            onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'footer' })}
          >
            Try demo first
          </Link>
        </div>

        {EMAIL_CAPTURE_ENABLED && <EmailCapture location="landing" />}
      </div>

      </main>

      <Footer />
    </div>
  );
}
