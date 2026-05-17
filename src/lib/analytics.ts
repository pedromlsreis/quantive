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
export type FileUploadFailureReason =
  | 'no_sheets'
  | 'no_data'
  | 'no_valid_facts'
  | 'parse_error'
  | 'unknown';
export type CloudSyncFailureReason = 'transient' | 'terminal';

export const analytics = {
  pageViewed(path: string): void {
    capture('page_viewed', { path });
  },
  signedUp(): void {
    capture('signed_up');
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
  proGateHit(props: { feature: string }): void {
    capture('pro_gate_hit', { feature: props.feature });
  },
};
