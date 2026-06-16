import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { getConsent, setConsent, subscribeConsent, type ConsentState } from '@/lib/consent';
import { analytics } from '@/lib/analytics';
import { easeOut } from '@/lib/motion';

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

  const visible = state === null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-labelledby="consent-banner-title"
          aria-describedby="consent-banner-desc"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0, transition: easeOut }}
          exit={{ opacity: 0, y: 16, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } }}
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:bottom-4 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="text-sm text-muted-foreground">
              <p id="consent-banner-title" className="font-semibold text-foreground">
                Help us understand how Quantive is used
              </p>
              <p id="consent-banner-desc" className="mt-1 text-xs leading-relaxed">
                We'd like to record anonymous product analytics (page views and feature
                usage) via PostHog. No financial data, no email addresses, no cross-site
                tracking. You can change your mind anytime from Settings or our{' '}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
            <div className="flex shrink-0 gap-2 sm:flex-col sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  // Order matters: setConsent flips the gate to 'granted' and
                  // boots PostHog synchronously via its listener, so the
                  // capture below actually goes through.
                  setConsent('granted');
                  analytics.consentGranted();
                }}
                className="flex-1 rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => setConsent('denied')}
                className="flex-1 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 sm:flex-none"
              >
                Decline
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
