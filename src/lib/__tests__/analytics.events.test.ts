import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Controllable consent state for the gate under test.
let consentState: 'granted' | 'denied' | null = 'granted';

const captureSpy = vi.fn();

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: captureSpy,
    opt_in_capturing: vi.fn(),
    opt_out_capturing: vi.fn(),
    reset: vi.fn(),
    captureException: vi.fn(),
  },
}));

vi.mock('../consent', () => ({
  getConsent: () => consentState,
  setConsent: vi.fn(),
  subscribeConsent: () => () => {},
}));

async function loadAnalytics() {
  vi.resetModules();
  return (await import('../analytics')).analytics;
}

describe('analytics event capture', () => {
  beforeEach(() => {
    // The module reads VITE_POSTHOG_KEY at load time; stub it before each
    // fresh import so the capture path isn't short-circuited by a missing key.
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test_key');
    captureSpy.mockClear();
    consentState = 'granted';
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not capture any event when consent is not granted', async () => {
    consentState = 'denied';
    const analytics = await loadAnalytics();
    analytics.proUpgradeClicked({ feature: 'forecasting' });
    analytics.checkoutStarted({ interval: 'yearly' });
    analytics.unlockFailed();
    analytics.consentGranted();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('does not capture when consent has not been decided', async () => {
    consentState = null;
    const analytics = await loadAnalytics();
    analytics.subscriptionStarted();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('splits the upsell impression from the upgrade click', async () => {
    const analytics = await loadAnalytics();
    analytics.proGateHit({ feature: 'benchmarks' });
    analytics.proUpgradeClicked({ feature: 'benchmarks' });
    const events = captureSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain('pro_gate_hit');
    expect(events).toContain('pro_upgrade_clicked');
  });

  it('captures the checkout funnel with anonymous payloads only', async () => {
    const analytics = await loadAnalytics();
    analytics.checkoutStarted({ interval: 'monthly' });
    analytics.checkoutFailed({ reason: 'no_email' });
    analytics.subscriptionStarted();

    const byName = new Map(captureSpy.mock.calls.map((c) => [c[0], c[1]]));
    expect(byName.get('checkout_started')).toMatchObject({ interval: 'monthly' });
    expect(byName.get('checkout_failed')).toMatchObject({ reason: 'no_email' });
    expect(byName.has('subscription_started')).toBe(true);
  });

  it('captures the unlock and recovery funnel events', async () => {
    const analytics = await loadAnalytics();
    analytics.unlockSucceeded();
    analytics.unlockFailed();
    analytics.recoveryOfferShown();
    analytics.recoverySetupCompleted({ source: 'offer_modal' });
    analytics.recoverySkipped();
    analytics.recoveryUsed();

    const events = captureSpy.mock.calls.map((c) => c[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        'unlock_succeeded',
        'unlock_failed',
        'recovery_offer_shown',
        'recovery_setup_completed',
        'recovery_skipped',
        'recovery_used',
      ]),
    );
  });

  it('rounds web-vital values and never sends extra payload', async () => {
    const analytics = await loadAnalytics();
    analytics.webVital({ name: 'LCP', value: 1234.7, rating: 'good' });
    analytics.webVital({ name: 'CLS', value: 0.123456, rating: 'needs-improvement' });

    const byName = new Map(captureSpy.mock.calls.map((c) => [c[1]?.metric, c[1]]));
    // ms metric rounded to an integer, unitless CLS to 4dp.
    expect(byName.get('LCP')).toMatchObject({ metric: 'LCP', value: 1235, rating: 'good' });
    expect(byName.get('CLS')).toMatchObject({ metric: 'CLS', value: 0.1235 });
  });

  it('keeps source_created to a bare count with no names', async () => {
    const analytics = await loadAnalytics();
    analytics.sourceCreated({ count: 3 });
    const call = captureSpy.mock.calls.find((c) => c[0] === 'source_created');
    expect(call?.[1]).toMatchObject({ count: 3 });
    // No source names or other identifying keys leaked into the payload.
    expect(Object.keys(call?.[1] ?? {})).toEqual(['count']);
  });

  it('captures onboarding checklist funnel events with anonymous payloads', async () => {
    const analytics = await loadAnalytics();
    analytics.onboardingChecklistShown({ completed: 1 });
    analytics.onboardingCtaClicked({ step: 'recovery' });
    analytics.onboardingChecklistDismissed({ completed: 2 });
    const byName = new Map(captureSpy.mock.calls.map((c) => [c[0], c[1]]));
    expect(byName.get('onboarding_checklist_shown')).toMatchObject({ completed: 1 });
    expect(byName.get('onboarding_cta_clicked')).toMatchObject({ step: 'recovery' });
    expect(byName.get('onboarding_checklist_dismissed')).toMatchObject({ completed: 2 });
  });
});
