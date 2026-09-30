import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent, subscribeConsent, type ConsentState } from '@/lib/consent';
import { analytics } from '@/lib/analytics';

/**
 * Bottom-of-viewport consent bar for non-essential analytics (PostHog).
 *
 * Visible only while the user has not yet made a decision. Both choices are
 * given equal visual weight — required under DSK guidance to count as a free
 * opt-in under § 25 TDDDG. Dismiss via outside click is intentionally not
 * supported; the user must pick.
 */
export function ConsentBanner() {
  const [state, setState] = useState<ConsentState>(() => getConsent());

  useEffect(() => subscribeConsent(setState), []);

  if (state !== null) return null;

  return (
    <div
      className="q-consent"
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-desc"
    >
      <div style={{ minWidth: 0 }}>
        <p id="consent-banner-title" className="q-consent-title">Allow anonymous analytics?</p>
        <p id="consent-banner-desc" className="q-consent-desc">
          If you allow it, we record which pages and features you use, through PostHog. Balances, source
          names and your email are never sent, and nothing tracks you across other sites. Change this any time in
          Settings or read the <Link to="/privacy" className="q-inline-link">Privacy Policy</Link>.
        </p>
      </div>
      <div className="q-consent-actions">
        <button
          type="button"
          onClick={() => {
            // Order matters: setConsent boots PostHog synchronously via its
            // listener, so the capture below goes through.
            setConsent('granted');
            analytics.consentGranted();
          }}
          className="q-btn q-btn--secondary q-btn--md"
        >
          Accept
        </button>
        <button type="button" onClick={() => setConsent('denied')} className="q-btn q-btn--secondary q-btn--md">
          Decline
        </button>
      </div>
    </div>
  );
}
