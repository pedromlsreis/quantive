import { Fragment, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useMotionAllowed } from '@/hooks/useMotionAllowed';
import { getRouteMeta } from '@/lib/seo/routeMeta';
import { StickyNav } from '@/components/landing/StickyNav';
import { PublicFooter } from '@/components/landing/PublicFooter';
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
import { FAQS } from './landing/faqs';
import { LedgerInstrument } from './landing/LedgerInstrument';
import { SealFigure, SealVerify } from './landing/SealFigure';
import { TourVideo } from './landing/TourVideo';
import { RESTING_MONTH, type DisplayCurrency } from './landing/instrumentData';
import '@/styles/public.css';
import './landing.css';

const SUPPORTED_COUNT = CURRENCY_CODES.length;
const CRYPTO_SOURCE_URL = 'https://github.com/pedromlsreis/quantive/tree/main/src/lib/crypto';

/* JSON-LD lives in index.html as the canonical schema source for crawlers.
   Keep the visible FAQS array in sync with the FAQPage block there. */

/* Problem → answer rows: the spreadsheet habit, then what Quantive does
   instead. `pro` marks rows that need the paid plan, so no claim turns into
   an upsell after sign-up. */
const SPREADSHEET_ROWS: Array<{ habit: string; answer: string; pro?: boolean }> = [
  {
    habit: "Last year's balances converted at today's exchange rate.",
    answer: 'Each month valued at the exchange rate of its own date.',
  },
  {
    habit: 'One tab per year, held together by formulas.',
    answer: 'Your measurements on one timeline, with the change month by month.',
  },
  {
    habit: 'A pie chart you rebuild every quarter.',
    answer: 'Allocation by liquidity and volatility, recalculated when you save.',
  },
  {
    habit: 'A growth rate you guessed once.',
    answer: 'A projection with a confidence band fitted to your own history.',
    pro: true,
  },
  {
    habit: 'A year-end summary you assemble by hand.',
    answer: 'A one-page PDF report for you or your adviser.',
    pro: true,
  },
  {
    habit: 'A file on one laptop.',
    answer: "The same dashboard in any browser, including your phone's.",
  },
];

const STEPS = [
  {
    title: 'Add your balances once',
    desc: 'Import your spreadsheet or type balances in. Your history comes with it, and the dashboard needs no configuring.',
  },
  {
    title: 'Add a measurement each month',
    desc: 'Type in your latest balances. Net worth, allocation and the forecast update when you save.',
  },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const motion = useMotionAllowed();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [currency, setCurrency] = useState<DisplayCurrency>('EUR');
  const [month, setMonth] = useState(RESTING_MONTH);

  usePageMeta(getRouteMeta('/'));

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="pub-root lp-root flex min-h-screen flex-col" data-motion={motion ? 'on' : undefined}>
      <StickyNav />

      <main id="main-content" className="pub-main">

      {/* ───── HERO ───── */}
      <section className="lp-hero pub-wrap" aria-labelledby="lp-hero-h1">
        <h1 className="pub-cover lp-hero-h1" id="lp-hero-h1">
          The net worth spreadsheet you&rsquo;ve outgrown
        </h1>

        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <p className="pub-lede lp-hero-deck">
              Quantive is a net worth tracker that replaces the spreadsheet you keep across brokers, banks and{' '}
              {SUPPORTED_COUNT} currencies. Import it or type in balances once a month. It never asks for your bank login.
            </p>
            <div className="lp-actions">
              <Link
                to="/dashboard"
                className="pub-btn pub-btn--primary"
                onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'hero' })}
              >
                Get started free
              </Link>
              <Link
                to="/demo"
                className="pub-btn pub-btn--secondary"
                onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'hero' })}
              >
                Try the demo
              </Link>
            </div>
          </div>

          <LedgerInstrument
            currency={currency}
            onCurrencyChange={setCurrency}
            month={month}
            onMonthChange={setMonth}
            motion={motion}
          />

        </div>

      </section>

      {/* ───── FEATURES ───── */}
      <section className="lp-sec lp-sec--major pub-wrap" id="features" aria-labelledby="lp-feat-h2">
        <div className="lp-sec-head">
          <h2 className="pub-h2" id="lp-feat-h2">The spreadsheet jobs Quantive takes over</h2>
          <p className="pub-lede">
            Record each account, asset and liability once. Quantive rolls them into one net worth across sources and
            currencies, and the charts update as you add measurements.
          </p>
        </div>

        <TourVideo motion={motion} />

        <ul className="lp-rows" role="list">
          {SPREADSHEET_ROWS.map((row) => (
            <li key={row.answer} className="lp-row">
              <p className="lp-row-habit">
                <span className="sr-only">In a spreadsheet: </span>
                {row.habit}
              </p>
              <p className="lp-row-answer">
                <span className="sr-only">In Quantive: </span>
                {row.answer}
                {row.pro && <span className="lp-pro-tag">Pro</span>}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section className="lp-sec lp-sec--minor pub-wrap" id="how" aria-labelledby="lp-how-h2">
        <h2 className="pub-h2" id="lp-how-h2">Set up once, then update monthly</h2>
        <ol className="lp-steps" role="list">
          {STEPS.map((step) => (
            <li key={step.title} className="lp-step">
              <h3 className="pub-h3 lp-step-title">{step.title}</h3>
              <p className="lp-step-desc">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ───── WHO IT'S FOR ───── */}
      <section className="lp-sec lp-sec--minor pub-wrap" aria-labelledby="lp-who-h2">
        <h2 className="pub-h2" id="lp-who-h2">For people who keep their own records</h2>
        <div className="lp-fit">
          <div className="lp-fit-col">
            <h3 className="lp-fit-head">Quantive suits you if</h3>
            <ul className="lp-fit-list" role="list">
              <li className="lp-fit-item">You hold accounts across several brokers, banks and currencies, and want one total across all of them.</li>
              <li className="lp-fit-item">You'd rather enter balances once a month than connect a bank to an aggregator.</li>
              <li className="lp-fit-item">You want a clean year-by-year record of your wealth, for yourself or an adviser.</li>
              <li className="lp-fit-item">You've outgrown a hand-built spreadsheet but want to keep its history.</li>
            </ul>
          </div>
          <div className="lp-fit-col lp-fit-col--no">
            <h3 className="lp-fit-head">Look elsewhere if</h3>
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
                You want to run it on your own server.
                <span className="lp-fit-note">A self-hosted, open-source tracker will suit you better.</span>
              </li>
              <li className="lp-fit-item">You need day-trading dashboards or live prices.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ───── PRIVACY ───── */}
      <section className="lp-priv" id="privacy" aria-labelledby="lp-priv-h2">
        <div className="pub-wrap">
          <div className="lp-priv-head">
            <h2 className="pub-display" id="lp-priv-h2">We store your net worth. We can&rsquo;t read it.</h2>
            <p className="pub-lede">
              Balances are encrypted in your browser with a key only you can unlock, so our servers only ever hold
              ciphertext. The remaining trust is in the code we serve, which is why the cryptography is open source and
              the threat model is public. Quantive has no ads and sells no data, and every plan can export all of your
              data as CSV.
            </p>
          </div>

          <SealFigure currency={currency} month={month} motion={motion} />

          <div className="lp-priv-foot">
            <p className="lp-priv-links">
              <Link to="/security" className="pub-link">Read the threat model</Link>
              <a href={CRYPTO_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="pub-link">Read the crypto source</a>
            </p>
          </div>

          <SealVerify />
        </div>
      </section>

      {/* ───── FOUNDER ───── */}
      <figure className="lp-founder pub-wrap">
        <blockquote className="lp-founder-quote">
          <p>
            Every finance app I tried either wanted my bank login or wanted to monetise my data. I keep my own numbers,
            and I just wanted something simple: to see them charted properly and kept private.
          </p>
        </blockquote>
        <figcaption className="lp-founder-sig">Pedro Reis, founder. Built and run by one person in Germany.</figcaption>
      </figure>

      {/* ───── PRICING ───── */}
      <section className="lp-sec lp-sec--major pub-wrap" id="pricing" aria-labelledby="lp-price-h2">
        <div className="lp-sec-head">
          <h2 className="pub-h2" id="lp-price-h2">{PRICING_HEADLINE}</h2>
          <p className="pub-lede">{PRICING_SUB}</p>
        </div>

        <div className="lp-rate">
          <div className="lp-rate-col">
            <h3 className="pub-h3">Free</h3>
            <p className="lp-rate-price">
              <span className="pub-fig">€0</span>
              <span className="lp-rate-period">forever</span>
            </p>
            <div className="pub-double-rule" aria-hidden="true" />
            <p className="lp-rate-note">No credit card required.</p>
            <PlanList sections={FREE_SECTIONS} />
            <Link
              to="/dashboard"
              className="pub-btn pub-btn--primary lp-rate-cta"
              onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'pricing_card' })}
            >
              Get started free
            </Link>
          </div>
          <div className="lp-rate-col">
            <h3 className="pub-h3">Pro</h3>
            <p className="lp-rate-price">
              <span className="pub-fig">€90</span>
              <span className="lp-rate-period">a year</span>
            </p>
            <div className="pub-double-rule" aria-hidden="true" />
            <p className="lp-rate-note">About €7.50 a month, or €9 billed monthly.</p>
            <PlanList sections={PRO_SECTIONS} />
            <Link
              to="/pricing"
              className="pub-btn pub-btn--secondary lp-rate-cta"
              onClick={() => {
                analytics.landingCtaClicked({ cta: 'pro_signup', location: 'pricing_card' });
                analytics.proGateHit({ feature: 'pricing_card_pro_cta' });
              }}
            >
              See Pro plans
            </Link>
          </div>
        </div>
        <p className="lp-rate-hinge">
          Free shows your last 12 months. Pro opens every month since your first entry, plus the full forecast and the
          PDF report. Older entries are kept on Free either way.
        </p>
        <p className="pub-fine lp-rate-fine">{VAT_NOTE} A Family plan (shared portfolios for two people) is planned but not yet available.</p>
      </section>

      {/* ───── FAQ ───── */}
      <section className="lp-sec lp-sec--minor pub-wrap lp-faq" id="faq" aria-labelledby="lp-faq-h2">
        <div className="lp-faq-side">
          <h2 className="pub-h2" id="lp-faq-h2">Common questions</h2>
          <p className="pub-body">
            Something else? Email{' '}
            <a className="pub-link" href="mailto:support@usequantive.app">support@usequantive.app</a>.
          </p>
        </div>
        <div className="lp-faq-list">
          {FAQS.map((item, i) => {
            const isOpen = openFaq === i;
            const panelId = `lp-faq-panel-${i}`;
            const btnId = `lp-faq-btn-${i}`;
            return (
              <div key={item.q} className={`lp-faq-item ${isOpen ? 'is-open' : ''}`}>
                <h3 className="lp-faq-q">
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
                </h3>
                <div id={panelId} aria-labelledby={btnId} className="lp-faq-ans">
                  <div className="lp-faq-ans-inner">
                    <div className="lp-faq-ans-body">{item.a}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ───── CLOSING CTA ───── */}
      <section className="lp-close pub-wrap" aria-labelledby="lp-close-h2">
        <div className="lp-close-main">
          <h2 className="pub-cover lp-close-h2" id="lp-close-h2">Start with one measurement</h2>
          <div className="lp-actions">
            <Link
              to="/dashboard"
              className="pub-btn pub-btn--primary"
              onClick={() => analytics.landingCtaClicked({ cta: 'get_started', location: 'footer' })}
            >
              Get started free
            </Link>
            <Link
              to="/demo"
              className="pub-btn pub-btn--secondary"
              onClick={() => analytics.landingCtaClicked({ cta: 'try_demo', location: 'footer' })}
            >
              Try the demo
            </Link>
          </div>
        </div>
        {EMAIL_CAPTURE_ENABLED && (
          <div className="lp-close-side">
            <EmailCapture location="landing" />
          </div>
        )}
      </section>

      </main>

      <PublicFooter />
    </div>
  );
}

function PlanList({ sections }: { sections: typeof FREE_SECTIONS }) {
  return (
    <ul className="lp-rate-list" role="list">
      {sections.map((sec) => (
        <Fragment key={sec.head}>
          <li className="lp-rate-head">{sec.head}</li>
          {sec.items.map((item) => (
            <li key={item} className="lp-rate-item">{item}</li>
          ))}
        </Fragment>
      ))}
    </ul>
  );
}
