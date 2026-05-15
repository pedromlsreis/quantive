import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com';

export function initAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (!KEY) return;

  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: 'localStorage',
  });
}

function capture(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined' || !KEY) return;
  posthog.capture(event, props);
}

export type LandingCta = 'get_started' | 'try_demo' | 'pro_signup';
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
    if (typeof window !== 'undefined' && KEY) posthog.reset();
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
