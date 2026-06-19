import posthog from 'posthog-js';
import { getConsent, subscribeConsent } from './consent';

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com';

const ATTRIBUTION_STORAGE_KEY = 'quantive_utm';

let posthogInitialised = false;
const UTM_PARAM_NAMES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

type UtmParam = (typeof UTM_PARAM_NAMES)[number];
export type AttributionProps = Partial<Record<UtmParam, string>> & { utm_captured_at?: string };

export function captureAttribution(search: string = typeof window === 'undefined' ? '' : window.location.search): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(search);
  const captured: Record<string, string> = {};
  for (const key of UTM_PARAM_NAMES) {
    const value = params.get(key);
    if (value) captured[key] = value;
  }
  if (Object.keys(captured).length === 0) return;
  captured.utm_captured_at = new Date().toISOString();
  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(captured));
  } catch {
    // localStorage unavailable (private browsing, quota) — silently skip
  }
}

export function getAttribution(): AttributionProps {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as AttributionProps;
  } catch {
    return {};
  }
}

export function clearAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function bootPosthog(): void {
  if (typeof window === 'undefined') return;
  if (!KEY) return;
  if (posthogInitialised) return;

  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: 'localStorage',
  });
  posthogInitialised = true;
}

/**
 * Capture UTM parameters into localStorage as soon as the page loads. This is
 * first-party-only metadata about which of our own outbound links the user
 * followed — no third-party network call, no identifier. It is needed before
 * any consent decision so we don't lose attribution if the user lands and
 * declines analytics; the data simply stays unused.
 *
 * Boot PostHog only if the user has previously granted consent. If they
 * decline or haven't decided yet, this is a no-op until consent flips.
 */
export function initAnalytics(): void {
  if (typeof window === 'undefined') return;
  captureAttribution();
  if (getConsent() === 'granted') bootPosthog();
  initWebVitals();
}

/**
 * Register Core Web Vitals listeners (LCP / INP / CLS). web-vitals is loaded
 * as a dynamic chunk so it never weighs down the main bundle. Listeners are
 * attached regardless of consent — they only set up PerformanceObservers, no
 * network call and no identifier — so we capture accurate metrics across the
 * page lifecycle. The actual send is consent-gated inside `analytics.webVital`
 * → `capture`, so nothing leaves the device unless the user opted in. This
 * matches the privacy-policy disclosure that these metrics are sent only with
 * consent.
 */
let webVitalsInitialised = false;
function initWebVitals(): void {
  if (typeof window === 'undefined' || webVitalsInitialised) return;
  webVitalsInitialised = true;
  void import('web-vitals')
    .then(({ onLCP, onINP, onCLS }) => {
      const report = (metric: { name: string; value: number; rating: string }) => {
        analytics.webVital({
          name: metric.name as WebVitalName,
          value: metric.value,
          rating: metric.rating as WebVitalRating,
        });
      };
      onLCP(report);
      onINP(report);
      onCLS(report);
    })
    .catch(() => {
      // web-vitals failed to load — performance telemetry is best-effort and
      // never load-bearing, so swallow it.
    });
}

// React to consent changes within this tab.
subscribeConsent((state) => {
  if (state === 'granted') {
    bootPosthog();
    if (posthogInitialised) posthog.opt_in_capturing();
  } else if (state === 'denied') {
    if (posthogInitialised) {
      posthog.opt_out_capturing();
      posthog.reset();
    }
  }
});

function capture(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !KEY) return;
  if (getConsent() !== 'granted') return;
  if (!posthogInitialised) bootPosthog();
  if (!posthogInitialised) return;
  const attribution = getAttribution();
  posthog.capture(event, { ...attribution, ...props });
}

export type LandingCta = 'get_started' | 'try_demo' | 'pro_signup' | 'sign_in';
export type LandingCtaLocation = 'hero' | 'footer' | 'nav' | 'pricing_card';
export type DemoSource = 'route' | 'in_app_button';
export type EmailCaptureLocation = 'landing';
export type FileUploadFailureReason =
  | 'no_sheets'
  | 'no_data'
  | 'no_valid_facts'
  | 'parse_error'
  | 'wrong_type'
  | 'unknown';
export type CloudSyncFailureReason = 'transient' | 'terminal';
export type CheckoutInterval = 'monthly' | 'yearly';
export type RecoverySetupSource = 'offer_modal' | 'settings';
export type AuthOpenMode = 'signin' | 'signup';
export type WebVitalName = 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
export type WebVitalRating = 'good' | 'needs-improvement' | 'poor';
export type OnboardingStep = 'accounts' | 'recovery' | 'goal';

export const analytics = {
  pageViewed(path: string): void {
    capture('page_viewed', { path });
  },
  signedUp(): void {
    capture('signed_up');
  },
  /**
   * Fired once when a user lands on the empty-state / first-run upload screen
   * with no portfolio data yet. Anchors the activation funnel: the share of
   * `onboarding_empty_state_viewed` that goes on to fire `file_uploaded` or
   * `measurement_added` is the activation rate, and the time between them is
   * time-to-activation. No payload — the bare event is the funnel step.
   */
  onboardingEmptyStateViewed(): void {
    capture('onboarding_empty_state_viewed');
  },
  /**
   * Fired once per session when the dashboard getting-started checklist first
   * shows. `completed` is how many steps are already done at that point — the
   * funnel's entry state. No portfolio data.
   */
  onboardingChecklistShown(props: { completed: number }): void {
    capture('onboarding_checklist_shown', { completed: props.completed });
  },
  /** Fired when a user clicks a checklist step's action button. */
  onboardingCtaClicked(props: { step: OnboardingStep }): void {
    capture('onboarding_cta_clicked', { step: props.step });
  },
  /** Fired when a user dismisses the checklist; `completed` is how far they got. */
  onboardingChecklistDismissed(props: { completed: number }): void {
    capture('onboarding_checklist_dismissed', { completed: props.completed });
  },
  signedIn(): void {
    capture('signed_in');
  },
  signedOut(): void {
    capture('signed_out');
    if (typeof window !== 'undefined' && KEY && posthogInitialised) {
      posthog.reset();
      clearAttribution();
    } else {
      clearAttribution();
    }
  },
  fileUploaded(props: { rowCount: number; sourceCount: number }): void {
    capture('file_uploaded', { row_count: props.rowCount, source_count: props.sourceCount });
  },
  fileUploadFailed(props: { reason: FileUploadFailureReason }): void {
    capture('file_upload_failed', { reason: props.reason });
  },
  measurementAdded(props: { count: number }): void {
    capture('measurement_added', { count: props.count });
  },
  /**
   * Fired when a user edits a single measurement's value or currency. Bare
   * event only — no source name, date, or amount (that's portfolio data).
   */
  measurementEdited(): void {
    capture('measurement_edited');
  },
  /** Fired when a user deletes a single measurement. No portfolio data. */
  measurementDeleted(): void {
    capture('measurement_deleted');
  },
  /**
   * Fired when a user reverses a delete via the undo toast. Bare event — the
   * ratio against `measurement_deleted` tells us how often the undo affordance
   * actually saves someone from a mistaken delete.
   */
  measurementRestored(): void {
    capture('measurement_restored');
  },
  dataCleared(): void {
    capture('data_cleared');
  },
  cloudSyncFailed(props: { reason: CloudSyncFailureReason }): void {
    capture('cloud_sync_failed', { reason: props.reason });
  },
  landingCtaClicked(props: { cta: LandingCta; location: LandingCtaLocation }): void {
    capture('landing_cta_clicked', { cta: props.cta, location: props.location });
  },
  demoLoaded(props: { source: DemoSource }): void {
    capture('demo_loaded', { source: props.source });
  },
  /**
   * Fired when a visitor submits the landing-page email capture. The share of
   * `page_viewed` that reaches this is the email-capture rate — the HN2 metric
   * for visitors not ready to create an account yet. Consent-gated like every
   * event here, so the provider's own subscriber count is the source of truth
   * for the rate; this event is for funnel analysis among consented visitors.
   */
  emailCaptured(props: { location: EmailCaptureLocation }): void {
    capture('landing_email_captured', { location: props.location });
  },
  /**
   * Fired when a Pro-gated feature is *shown* as a locked upsell (the
   * impression). Paired with `proUpgradeClicked` — the ratio between them is
   * the upsell click-through rate. Keep these two distinct: collapsing them
   * back into one event makes the conversion funnel unmeasurable.
   */
  proGateHit(props: { feature: string }): void {
    capture('pro_gate_hit', { feature: props.feature });
  },
  /** Fired when the user clicks "Upgrade to Pro" on an upsell card. */
  proUpgradeClicked(props: { feature: string }): void {
    capture('pro_upgrade_clicked', { feature: props.feature });
  },
  /** Fired right before redirecting to Stripe Checkout. */
  checkoutStarted(props: { interval: CheckoutInterval }): void {
    capture('checkout_started', { interval: props.interval });
  },
  /**
   * Fired when creating the Stripe Checkout session fails. `reason` is the
   * anonymous error code we already derive for the user-facing toast — never
   * a raw error message (which could carry an email or other detail).
   */
  checkoutFailed(props: { reason: string }): void {
    capture('checkout_failed', { reason: props.reason });
  },
  /**
   * Fired when the user returns from a successful Stripe Checkout (the
   * `?checkout=success` redirect). This is the conversion endpoint of the
   * monetisation funnel. Entitlement itself is granted server-side by the
   * webhook — this event is the client-observed completion, no amounts.
   */
  subscriptionStarted(): void {
    capture('subscription_started');
  },
  /** Fired when the user opens the Stripe billing portal (manage/cancel). */
  billingPortalOpened(): void {
    capture('billing_portal_opened');
  },
  /**
   * Fired when an existing user successfully unlocks their encrypted data,
   * and when an unlock attempt fails (wrong password / unreadable wrap). The
   * fail rate is the leading indicator of forgotten-password churn — the one
   * silent failure mode the E2E design creates. Bare events: no password, no
   * portfolio data, not even which failure case (the unlock boundary doesn't
   * expose it).
   */
  unlockSucceeded(): void {
    capture('unlock_succeeded');
  },
  unlockFailed(): void {
    capture('unlock_failed');
  },
  /** Fired when the post-unlock recovery-code offer is shown. */
  recoveryOfferShown(): void {
    capture('recovery_offer_shown');
  },
  /** Fired when the user generates a recovery code. `source` is where from. */
  recoverySetupCompleted(props: { source: RecoverySetupSource }): void {
    capture('recovery_setup_completed', { source: props.source });
  },
  /** Fired when the user dismisses the recovery offer without setting one up. */
  recoverySkipped(): void {
    capture('recovery_skipped');
  },
  /**
   * Fired when a user successfully recovers access via their 24-word code
   * during password reset. Proves the recovery path actually saves people —
   * the payoff metric for `recovery_setup_completed`.
   */
  recoveryUsed(): void {
    capture('recovery_used');
  },
  /**
   * Fired the moment the user grants analytics consent. This is the only
   * consent transition we can capture (it flips the gate to 'granted' before
   * this call), and it calibrates every other funnel: activation numbers are
   * all conditioned on consent, so the grant rate is the funnel's denominator.
   */
  consentGranted(): void {
    capture('consent_granted');
  },
  /**
   * Fired when a measurement save introduces one or more brand-new sources.
   * Just a count — never the source names, which are portfolio data.
   */
  sourceCreated(props: { count: number }): void {
    capture('source_created', { count: props.count });
  },
  /**
   * Fired when the in-app auth modal is opened from the app shell. Bridges
   * the demo→signup funnel: a guest exploring demo data who opens sign-up is
   * the intent signal `demo_loaded` couldn't otherwise reach.
   */
  appAuthOpened(props: { mode: AuthOpenMode }): void {
    capture('app_auth_opened', { mode: props.mode });
  },
  /**
   * Fired when the user changes their display currency. The currency code is
   * a display preference (like reminder cadence), not a financial figure or
   * account detail, so it is safe to attach.
   */
  currencyChanged(props: { currency: string }): void {
    capture('currency_changed', { currency: props.currency });
  },
  /** Fired when the user toggles privacy (blur) mode. */
  privacyModeToggled(props: { enabled: boolean }): void {
    capture('privacy_mode_toggled', { enabled: props.enabled });
  },
  /**
   * Report a Core Web Vital sample (LCP / INP / CLS). Anonymous performance
   * metric, no payload beyond the metric name, value, and rating bucket —
   * matches what the privacy policy discloses. Consent-gated like everything
   * else via `capture`.
   */
  webVital(props: { name: WebVitalName; value: number; rating: WebVitalRating }): void {
    capture('web_vital', {
      metric: props.name,
      // Round to avoid spurious precision: ms metrics to integers, the
      // unitless CLS to 4 dp.
      value: props.name === 'CLS' ? Math.round(props.value * 10000) / 10000 : Math.round(props.value),
      rating: props.rating,
    });
  },
  /**
   * Fired when a user adds a new goal. Do NOT include the goal name or
   * amount — that's portfolio data. The bare event is sufficient for
   * funnel/conversion analysis.
   */
  goalCreated(): void {
    capture('goal_created');
  },
  /** Fired when current net worth crosses a goal's target. No amounts attached. */
  goalCompleted(): void {
    capture('goal_completed');
  },
  benchmarkOverlayToggled(props: { series: string; period: '3y' | '1y' | '6m' }): void {
    capture('benchmark_overlay_toggled', { series: props.series, period: props.period });
  },
  momTableExported(props: { rows: number; freeRedacted: number }): void {
    capture('mom_table_exported', { rows: props.rows, free_redacted: props.freeRedacted });
  },
  /**
   * Fired when a user changes their entry-reminder cadence. The cadence is a
   * preference, not portfolio data, so it is safe to attach.
   */
  reminderFrequencyChanged(props: { frequency: string }): void {
    capture('reminder_frequency_changed', { frequency: props.frequency });
  },
  pdfReportGenerated(props: { period: string; hasForecast: boolean; months: number }): void {
    capture('pdf_report_generated', {
      period: props.period,
      has_forecast: props.hasForecast,
      months: props.months,
    });
  },
  /**
   * Report a thrown error to PostHog so the founder can see crashes during
   * the HN launch window. Always console.error too — useful when debugging
   * a user's screen-share, and for users who declined consent (their errors
   * never leave the device).
   *
   * Consent-gated like everything else in this file. We deliberately do not
   * exempt error reporting from the consent flag: the project's privacy
   * stance is "no phone-home without explicit opt-in" and silent error
   * reporting would contradict it.
   */
  captureException(error: unknown, context?: Record<string, unknown>): void {
    if (typeof window !== 'undefined') {
      console.error('[captureException]', error, context);
    }
    if (typeof window === 'undefined' || !KEY) return;
    if (getConsent() !== 'granted') return;
    if (!posthogInitialised) bootPosthog();
    if (!posthogInitialised) return;
    const err = error instanceof Error ? error : new Error(String(error));
    const attribution = getAttribution();
    try {
      posthog.captureException(err, { ...attribution, ...(context ?? {}) });
    } catch (e) {
      // Never let the error reporter throw — that's the one path that can
      // turn one crash into an infinite loop.
      console.error('[captureException] posthog.captureException threw:', e);
    }
  },
};

/**
 * Wire window-level error and unhandledrejection events through
 * analytics.captureException. Call once from the app entry. Idempotent: a
 * second call is a no-op.
 */
let globalHandlersInstalled = false;
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined' || globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  window.addEventListener('error', (ev) => {
    analytics.captureException(ev.error ?? ev.message, {
      kind: 'window_error',
      filename: ev.filename,
      line: ev.lineno,
      col: ev.colno,
    });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    analytics.captureException(ev.reason, { kind: 'unhandled_rejection' });
  });
}
