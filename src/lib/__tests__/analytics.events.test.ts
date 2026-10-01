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
    analytics.checkoutStarted({ plan: 'pro', interval: 'yearly' });
    analytics.unlockFailed();
    analytics.consentGranted();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it('does not capture when consent has not been decided', async () => {
    consentState = null;
    const analytics = await loadAnalytics();
    analytics.subscriptionStarted({ plan: 'pro' });
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
    analytics.checkoutStarted({ plan: 'family', interval: 'monthly' });
    analytics.checkoutFailed({ reason: 'no_email' });
    analytics.subscriptionStarted({ plan: 'family' });
    analytics.planSwitchStarted({ to: 'family' });

    const byName = new Map(captureSpy.mock.calls.map((c) => [c[0], c[1]]));
    expect(byName.get('checkout_started')).toEqual({ plan: 'family', interval: 'monthly' });
    expect(byName.get('checkout_failed')).toMatchObject({ reason: 'no_email' });
    expect(byName.get('subscription_started')).toEqual({ plan: 'family' });
    expect(byName.get('plan_switch_started')).toEqual({ to: 'family' });
  });

  it('splits the Family prompt impression from its click', async () => {
    const analytics = await loadAnalytics();
    analytics.familyGateHit({ location: 'settings_portfolios' });
    analytics.familyUpgradeClicked({ location: 'settings_portfolios' });
    const byName = new Map(captureSpy.mock.calls.map((c) => [c[0], c[1]]));
    expect(byName.get('family_gate_hit')).toEqual({ location: 'settings_portfolios' });
    expect(byName.get('family_upgrade_clicked')).toEqual({ location: 'settings_portfolios' });
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

  it('captures the onboarding follow-up click with only the step', async () => {
    const analytics = await loadAnalytics();
    analytics.onboardingCtaClicked({ step: 'recovery' });
    const call = captureSpy.mock.calls.find((c) => c[0] === 'onboarding_cta_clicked');
    expect(call?.[1]).toMatchObject({ step: 'recovery' });
    expect(Object.keys(call?.[1] ?? {})).toEqual(['step']);
  });

  it('never sends an invite id or secret', async () => {
    const analytics = await loadAnalytics();
    const posthog = (await import('posthog-js')).default as unknown as { init: ReturnType<typeof vi.fn> };
    analytics.pageViewed('/join/7d9f3c2e-1b4a-4c1e-9a55-0f6b2a1d8e40');
    expect(captureSpy).toHaveBeenCalledWith('page_viewed', expect.objectContaining({ path: '/join' }));

    const beforeSend = posthog.init.mock.calls[0][1].before_send as (e: unknown) => { properties: Record<string, unknown>; $set: Record<string, unknown> };
    const event = beforeSend({
      event: 'page_viewed',
      properties: {
        $current_url: 'https://usequantive.app/join/7d9f3c2e-1b4a-4c1e-9a55-0f6b2a1d8e40#k=AAAA',
        $pathname: '/join/7d9f3c2e-1b4a-4c1e-9a55-0f6b2a1d8e40',
        feature: 'benchmarks',
      },
      $set: { $initial_current_url: 'https://usequantive.app/join/x#k=BBBB' },
    });
    expect(event.properties).toEqual({
      $current_url: 'https://usequantive.app/join',
      $pathname: '/join',
      feature: 'benchmarks',
    });
    expect(event.$set).toEqual({ $initial_current_url: 'https://usequantive.app/join' });
  });
});
