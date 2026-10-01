import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { portfolioFileSuffix } from '@/lib/portfolios';
import { SettingsRow as Row, SettingsSection as Section } from '@/components/settings/SettingsRows';
import { PortfolioSettings } from '@/components/settings/PortfolioSettings';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { usePreferences, AUTO_LOCK_MINUTES_OPTIONS, type NumberFormat } from '@/contexts/PreferencesContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { browserNumberLocale } from '@/hooks/useFormat';
import { useModalLayer } from '@/hooks/useModalLayer';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Notice } from '@/components/ui/Notice';
import { RecoveryCodeDisplay } from '@/components/auth/RecoveryCodeDisplay';
import { PdfReportButton } from '@/components/export/PdfReportButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { extractCheckoutErrorCode, messageForPortalError } from '@/lib/billing/checkoutError';
import { resolvePlan, resolvePlanForStatus } from '@/lib/billing/plans';
import { planDescription } from '@/lib/billing/planStatus';
import { FAMILY_PRICE_LINE } from '@/lib/billing/planCopy';
import { analytics } from '@/lib/analytics';
import { REMINDER_OPTIONS, normaliseReminderFrequency, type ReminderFrequency } from '@/lib/reminders';
import { getConsent, setConsent, subscribeConsent, type ConsentState } from '@/lib/consent';
import { mapAuthError } from '@/lib/authError';
import { PASSWORD_MIN_LENGTH, PASSWORD_LENGTH_HINT, passwordTooShort } from '@/lib/passwordPolicy';
import { NUMBER_FORMAT_LOCALES } from '@/lib/numberLocale';
import { LEGAL_LINKS } from '@/lib/nav-config';
import { supabase } from '@/integrations/supabase/client';

export default function SettingsPage() {
  const { user, signOut, updatePassword, subscription, checkSubscription } = useAuth();

  // Re-check on mount so a user who lands here directly after checkout
  // (or who navigates here before the 60s background poll runs) sees the
  // up-to-date plan instead of whatever AuthContext last cached.
  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);
  const keySession = useKeySession();
  const { data, activePortfolioId, activePortfolioName, extraPortfolios } = usePortfolio();
  const { has } = useEntitlements();
  const canExportExcel = has('export.excel');
  const canExportCsv = has('export.csv');
  const currentPlan = resolvePlanForStatus(subscription);
  // The plan this account pays for, which can differ from currentPlan (the
  // Family beta, or Pro through a partner's Family plan).
  const paidPlan = subscription.subscribed ? resolvePlan(subscription.productId) : null;
  const [managingBilling, setManagingBilling] = useState<false | 'portal' | 'switch'>(false);

  // `switch_to_family` opens Stripe's page for confirming the move from Pro.
  const handleManageBilling = async (flow?: 'switch_to_family') => {
    // Open a blank tab synchronously on click so popup blockers don't intervene
    // when we navigate it after the async function call resolves.
    const portalTab = window.open('', '_blank');
    setManagingBilling(flow ? 'switch' : 'portal');
    if (flow) analytics.planSwitchStarted({ to: 'family' });
    else analytics.billingPortalOpened();
    try {
      const { data: portal, error } = await supabase.functions.invoke('customer-portal', flow ? { body: { flow } } : undefined);
      if (error || !portal?.url) {
        portalTab?.close();
        const code = await extractCheckoutErrorCode(error);
        toast.error(messageForPortalError(code));
        return;
      }
      if (portalTab) {
        portalTab.location.href = portal.url;
      } else {
        // Fallback if the browser blocked the popup outright.
        window.location.href = portal.url;
      }
    } catch {
      portalTab?.close();
      toast.error(messageForPortalError(undefined));
    } finally {
      setManagingBilling(false);
    }
  };
  const { currency, setCurrency, allCurrencies } = useCurrency();
  const { numberFormat, setNumberFormat, privacyMode, setPrivacyMode, blurOnUnfocus, setBlurOnUnfocus, autoLockMinutes, setAutoLockMinutes } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Back from Stripe after switching to Family: the webhook updates the plan
  // within seconds, so poll briefly instead of waiting for the 60s refresh.
  const switchPolledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get('switched') !== 'family' || switchPolledRef.current) return;
    switchPolledRef.current = true;
    toast.success('Your plan is now Family. It turns on within a few seconds.', { duration: 6000 });
    const next = new URLSearchParams(searchParams);
    next.delete('switched');
    setSearchParams(next, { replace: true });
    void (async () => {
      for (const delay of [1500, 3000, 6000, 12000]) {
        await new Promise((r) => setTimeout(r, delay));
        await checkSubscription();
      }
    })();
  }, [searchParams, setSearchParams, checkSubscription]);

  // `/settings#recovery` (the account menu) and `#export` scroll to their row once mounted.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    // requestAnimationFrame defers until after layout, so the target div
    // exists even on the very first paint of the route.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [location.hash]);

  const [displayName, setDisplayName] = useState<string | null>(null);
  // The reminder_frequency column is NOT NULL and defaults to 'monthly', so
  // this initial value matches what the fetch below will return for a fresh
  // account; the fetch then reflects whatever the user has actually saved.
  const [reminderFrequency, setReminderFrequency] = useState<ReminderFrequency>('monthly');
  const [savingReminder, setSavingReminder] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showRecoveryCode, setShowRecoveryCode] = useState<string | null>(null);
  const [provisioningRecovery, setProvisioningRecovery] = useState(false);

  const [changingPassword, setChangingPassword] = useState(false);

  const [analyticsConsent, setAnalyticsConsent] = useState<ConsentState>(() => getConsent());
  useEffect(() => subscribeConsent(setAnalyticsConsent), []);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const [exporting, setExporting] = useState<null | 'xlsx' | 'csv'>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('display_name, reminder_frequency')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // The display-name field is a nicety, not load-bearing — the page
          // is still usable without it. Surface a quiet toast so the user
          // knows the empty name is a fetch failure, not the truth.
          console.warn('[settings] profile fetch failed:', error.message);
          toast.error("Couldn't load your profile. Refresh to try again.");
          return;
        }
        if (data) {
          setDisplayName(data.display_name);
          setReminderFrequency(normaliseReminderFrequency(data.reminder_frequency));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSave = async () => {
    if (!user || !draft.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: draft.trim() })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your display name. Try again.");
    } else {
      setDisplayName(draft.trim());
      setEditing(false);
      toast.success('Display name saved.');
    }
  };

  const handleReminderChange = async (next: ReminderFrequency) => {
    if (!user) return;
    const previous = reminderFrequency;
    if (next === previous) return;
    // Optimistic: reflect the choice immediately, roll back on failure.
    setReminderFrequency(next);
    setSavingReminder(true);
    const { error } = await supabase
      .from('profiles')
      .update({ reminder_frequency: next })
      .eq('user_id', user.id);
    setSavingReminder(false);
    if (error) {
      setReminderFrequency(previous);
      toast.error("Couldn't save your reminder setting. Try again.");
      return;
    }
    analytics.reminderFrequencyChanged({ frequency: next });
    toast.success(next === 'off' ? 'Reminders turned off.' : 'Reminder schedule saved.');
  };

  const handleSetUpRecovery = async () => {
    if (!user) return;
    if (keySession.status !== 'unlocked-encrypted') {
      toast.error('Unlock your data first.');
      return;
    }
    setProvisioningRecovery(true);
    try {
      const { recoveryCode } = await keySession.setupRecovery(user.id);
      analytics.recoverySetupCompleted({ source: 'settings' });
      setShowRecoveryCode(recoveryCode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to set up recovery code.');
    } finally {
      setProvisioningRecovery(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (newPassword !== newPasswordConfirm) {
      toast.error("The two passwords don't match.");
      return;
    }
    if (passwordTooShort(newPassword)) {
      toast.error(PASSWORD_LENGTH_HINT);
      return;
    }
    if (keySession.status !== 'unlocked-encrypted') {
      toast.error('Unlock your data first.');
      return;
    }
    setSubmittingPassword(true);
    try {
      const { error: authErr } = await updatePassword(newPassword);
      if (authErr) {
        toast.error(mapAuthError(authErr));
        return;
      }
      const { error: rewrapErr } = await keySession.rewrapForNewPassword(user.id, newPassword);
      if (rewrapErr) {
        toast.error(
          "Password changed, but your data key couldn't be re-wrapped. Try again, or use your recovery code at your next sign-in.",
        );
        return;
      }
      toast.success('Password changed.');
      setChangingPassword(false);
      setNewPassword('');
      setNewPasswordConfirm('');
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleExport = async (fmt: 'xlsx' | 'csv') => {
    if (!data) {
      toast.error('Nothing to export yet.');
      return;
    }
    const gated = fmt === 'xlsx' ? !canExportExcel : !canExportCsv;
    if (gated) {
      analytics.proGateHit({ feature: fmt === 'xlsx' ? 'export.excel' : 'export.csv' });
      return;
    }
    setExporting(fmt);
    try {
      const timestamp = format(new Date(), 'yyyy-MM-dd');
      const suffix = portfolioFileSuffix(activePortfolioId, activePortfolioName);
      const exporter = await import('@/lib/exporter');
      if (fmt === 'xlsx') {
        await exporter.exportPortfolioExcel(data, `portfolio${suffix}_${timestamp}.xlsx`);
      } else {
        exporter.exportPortfolioCsv(data, `portfolio${suffix}_${timestamp}.csv`);
      }
    } catch {
      toast.error("Couldn't export. Try again.");
    } finally {
      setExporting(null);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error || !data?.success) {
        toast.error("Couldn't delete your account. Try again.");
        setDeleting(false);
        return;
      }
      // PortfolioContext's user-id watcher wipes all client state when
      // signOut() flips user to null. See docs/security/encryption.md §8.3.
      await signOut();
      toast.success('Your account and entries are deleted');
      navigate('/');
    } catch {
      toast.error("Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  };

  const unlocked = keySession.status === 'unlocked-encrypted';
  const autoLocale = browserNumberLocale();

  return (
    <div className="q-set">
      <header className="q-page-head">
        <h1 className="q-h1" tabIndex={-1}>Settings</h1>
      </header>

      {user && (
        <Section id="profile" title="Profile">
          <Row label="Email">
            <span className="q-set-value">{user.email}</span>
          </Row>
          <Row label="Display name" htmlFor={editing ? 'display-name' : undefined}>
            {editing ? (
              <div className="q-set-inline">
                <label className="q-input" style={{ width: 240 }}>
                  <input
                    id="display-name"
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="e.g. Sam"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                  />
                </label>
                <button type="button" onClick={handleSave} disabled={saving || !draft.trim()} className="q-btn q-btn--secondary q-btn--md">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="q-btn q-btn--ghost q-btn--md">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="q-set-inline">
                <span className="q-set-value">{displayName || 'Not set'}</span>
                <button
                  type="button"
                  onClick={() => { setDraft(displayName || ''); setEditing(true); }}
                  className="q-link-btn"
                  aria-label="Edit display name"
                >
                  Edit
                </button>
              </div>
            )}
          </Row>
        </Section>
      )}

      {user && (
        <Section id="plan" title="Plan">
          {subscription.paymentPastDue && (
            <Notice variant="warning" role="status" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-1)', marginBottom: 'var(--s-4)' }}>
              <p style={{ fontWeight: 600, margin: 0 }}>{"Your last payment didn't go through"}</p>
              <p style={{ margin: 0 }}>
                {`We're retrying the card and ${paidPlan?.name ?? 'your plan'} stays on for now. Update your card in Manage billing before the retries run out.`}
              </p>
            </Notice>
          )}
          <Row label={currentPlan.name} description={planDescription(subscription, paidPlan?.name ?? null)}>
            <div className="q-set-inline">
              {/* Anyone with Stripe history keeps the portal, cancelled users included, for invoices and reactivation. */}
              {(subscription.subscribed || subscription.hasStripeHistory) && (
                <button type="button" onClick={() => void handleManageBilling()} disabled={!!managingBilling} className="q-btn q-btn--secondary q-btn--md">
                  {managingBilling === 'portal' ? 'Opening…' : 'Manage billing'}
                </button>
              )}
              {!subscription.subscribed && !subscription.familyMember && !subscription.familyBeta && (
                <Link to="/pricing" className="q-btn q-btn--secondary q-btn--md">
                  Upgrade to Pro
                </Link>
              )}
            </div>
          </Row>
          {paidPlan?.id === 'pro' && (
            <Row
              label="Family"
              description={
                subscription.familyMember
                  ? `${subscription.familyOwnerEmail ? `${subscription.familyOwnerEmail}'s` : 'A'} Family plan already gives you Pro, so you're paying for it twice. Cancel Pro in Manage billing; Pro stays on through their plan.`
                  : `Pro for you and one partner, plus extra portfolios you can share with them. ${FAMILY_PRICE_LINE}. Stripe credits the unused part of Pro.`
              }
            >
              {!subscription.familyMember && (
                <button
                  type="button"
                  onClick={() => void handleManageBilling('switch_to_family')}
                  disabled={!!managingBilling}
                  className="q-btn q-btn--secondary q-btn--md"
                >
                  {managingBilling === 'switch' ? 'Opening…' : 'Switch to Family'}
                </button>
              )}
            </Row>
          )}
        </Section>
      )}

      <PortfolioSettings />

      <Section id="preferences" title="Preferences">
        <Row
          label="Display currency"
          htmlFor="pref-currency"
          description="Balances are shown in this currency. Entries in other currencies convert at the rate on their date."
        >
          <label className="q-input q-set-select">
            <select
              id="pref-currency"
              value={currency.code}
              onChange={(e) => {
                const next = e.target.value as CurrencyCode;
                setCurrency(next);
                analytics.currencyChanged({ currency: next });
              }}
            >
              {[
                currency,
                ...allCurrencies
                  .filter((c) => c.code !== currency.code)
                  .sort((a, b) => a.name.localeCompare(b.name)),
              ].map((c) => (
                <option key={c.code} value={c.code} title={c.name}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </label>
        </Row>
        <Row label="Number format" htmlFor="pref-number" description="Automatic follows your browser's language.">
          <label className="q-input q-set-select">
            <select id="pref-number" value={numberFormat} onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}>
              {NUMBER_FORMAT_ORDER.map((nf) => (
                <option key={nf} value={nf}>
                  {nf === 'auto'
                    ? `Automatic (${sampleNumber(autoLocale)})`
                    : sampleNumber(NUMBER_FORMAT_LOCALES[nf] ?? autoLocale)}
                </option>
              ))}
            </select>
          </label>
        </Row>
        <Row label="Privacy mode" description="Blur money values across the app. Hover a value to see it, or press and hold on touch.">
          <Switch
            on={privacyMode}
            label="Privacy mode"
            onChange={() => {
              setPrivacyMode(!privacyMode);
              analytics.privacyModeToggled({ enabled: !privacyMode });
            }}
          />
        </Row>
        <Row label="Hide values when you switch away" description="Blur values while this tab is in the background, for shared screens and presenting.">
          <Switch on={blurOnUnfocus} label="Hide values when the window loses focus" onChange={() => setBlurOnUnfocus(!blurOnUnfocus)} />
        </Row>
        <Row label="Auto-lock when idle" htmlFor="pref-autolock" description="Lock your data after a period without activity. Your password unlocks it.">
          <label className="q-input q-set-select">
            <select id="pref-autolock" value={autoLockMinutes} onChange={(e) => setAutoLockMinutes(Number(e.target.value))}>
              {AUTO_LOCK_MINUTES_OPTIONS.map((m) => (
                <option key={m} value={m}>{m === 0 ? 'Never' : `After ${m} minutes`}</option>
              ))}
            </select>
          </label>
        </Row>
        <Row label="Anonymous analytics" description="Record which pages and features you use, through PostHog. Balances, source names and your email are never sent.">
          <Switch
            on={analyticsConsent === 'granted'}
            label="Anonymous analytics"
            onChange={() => setConsent(analyticsConsent === 'granted' ? 'denied' : 'granted')}
          />
        </Row>
        {user && (
          <Row
            label="Entry reminders"
            htmlFor="pref-reminders"
            description="An email when you haven't synced for a while. It uses only the date of your last sync."
          >
            <label className="q-input q-set-select">
              <select
                id="pref-reminders"
                value={reminderFrequency}
                disabled={savingReminder}
                onChange={(e) => handleReminderChange(e.target.value as ReminderFrequency)}
              >
                {REMINDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </Row>
        )}
      </Section>

      <Section id="export" title="Your data">
        {canExportCsv && (
          <Row label="CSV export" description="All your entries, on both plans.">
            <button type="button" onClick={() => handleExport('csv')} disabled={!data || exporting !== null} className="q-btn q-btn--secondary q-btn--md">
              {exporting === 'csv' ? 'Exporting…' : 'Download CSV'}
            </button>
          </Row>
        )}
        <Row
          label="Excel workbook"
          tag={canExportExcel ? undefined : 'Pro'}
          description="Your sources and entries in one .xlsx file."
        >
          {canExportExcel && (
            <button type="button" onClick={() => handleExport('xlsx')} disabled={!data || exporting !== null} className="q-btn q-btn--secondary q-btn--md">
              {exporting === 'xlsx' ? 'Exporting…' : 'Download Excel'}
            </button>
          )}
        </Row>
        <Row
          label="PDF report"
          tag={has('export.pdf') ? undefined : 'Pro'}
          description="A one-page summary for your records or an adviser."
        >
          <PdfReportButton />
        </Row>
      </Section>

      {user && (
        <Section id="security" title="Security">
          <Row
            label="End-to-end encryption"
            description={unlocked
              ? 'XChaCha20-Poly1305, with the key derived from your password by Argon2id.'
              : 'Locked. Sign out and back in to manage encryption.'}
          />
          <Row
            id="recovery"
            label="Recovery code"
            description={keySession.hasRecovery === true
              ? 'Saved. A new code replaces the old one.'
              : keySession.hasRecovery === false
                ? "Not set up. Without one, a forgotten password means your data can't be recovered."
                : 'Checking…'}
          >
            {keySession.hasRecovery !== null && (
              <button
                type="button"
                onClick={handleSetUpRecovery}
                disabled={provisioningRecovery || !unlocked}
                className="q-btn q-btn--secondary q-btn--md"
              >
                {provisioningRecovery
                  ? 'Generating…'
                  : keySession.hasRecovery ? 'Replace recovery code' : 'Set up recovery code'}
              </button>
            )}
          </Row>
          <Row label="Password" description={changingPassword ? PASSWORD_LENGTH_HINT : undefined}>
            {!changingPassword && (
              <button type="button" onClick={() => setChangingPassword(true)} disabled={!unlocked} className="q-btn q-btn--secondary q-btn--md">
                Change password
              </button>
            )}
          </Row>
          {changingPassword && (
            <form onSubmit={handleChangePassword} className="q-set-form">
              <div className="q-field">
                <label className="q-field-label" htmlFor="new-password">New password</label>
                <span className="q-input">
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={PASSWORD_MIN_LENGTH}
                    required
                    autoFocus
                  />
                </span>
              </div>
              <div className="q-field">
                <label className="q-field-label" htmlFor="confirm-password">Confirm new password</label>
                <span className="q-input">
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPasswordConfirm}
                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                    minLength={PASSWORD_MIN_LENGTH}
                    required
                  />
                </span>
              </div>
              <div className="q-set-inline">
                <button type="submit" disabled={submittingPassword} className="q-btn q-btn--secondary q-btn--md">
                  {submittingPassword ? 'Saving…' : 'Save password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChangingPassword(false);
                    setNewPassword('');
                    setNewPasswordConfirm('');
                  }}
                  className="q-btn q-btn--ghost q-btn--md"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </Section>
      )}

      {user && (
        <Section id="delete" title="Delete account">
          <Row description="Permanently deletes your account and entries. Download a CSV first if you want a copy.">
            <button type="button" onClick={() => setDeleteOpen(true)} className="q-btn q-btn--danger q-btn--md">
              Delete account
            </button>
          </Row>
        </Section>
      )}

      <Section id="about" title="About">
        <Row description="Your entries are encrypted in this browser before they're sent, so we can't read them. The remaining trust is in the code we serve.">
          <nav aria-label="Legal" className="q-set-links">
            {LEGAL_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="q-inline-link">{l.label}</Link>
            ))}
          </nav>
        </Row>
      </Section>

      {showRecoveryCode && (
        <RecoveryCodeLayer code={showRecoveryCode} onDone={() => setShowRecoveryCode(null)} />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account, entries, profile and any feedback you sent are deleted permanently. This can't be undone.
              {extraPortfolios.length > 0 &&
                " A portfolio you share passes to your partner, who keeps it; your other portfolios are deleted. You also leave any portfolio shared with you."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="q-btn--destructive"
            >
              {deleting ? 'Deleting…' : 'Delete everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const NUMBER_FORMAT_ORDER: NumberFormat[] = ['auto', 'us', 'eu', 'space', 'in'];

function sampleNumber(locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234567.89);
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={`q-toggle${on ? ' is-on' : ''}`}>
      <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
    </button>
  );
}

/** The new code is shown once and can't be dismissed until the user confirms or skips. */
function RecoveryCodeLayer({ code, onDone }: { code: string; onDone: () => void }) {
  useModalLayer(true);
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  return createPortal(
    <div className="q-modal-backdrop">
      <div ref={trapRef} className="q-modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title" aria-describedby="recovery-sub">
        <div className="q-modal-head">
          <h2 className="q-modal-title" id="recovery-title">Your recovery code</h2>
          <p className="q-modal-sub" id="recovery-sub">
            {"Write these 24 words down or keep them in a password manager. They're shown once, and anyone who has them can decrypt your data."}
          </p>
        </div>
        <div className="q-modal-body">
          <RecoveryCodeDisplay code={code} onConfirmed={onDone} onSkipConfirm={onDone} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
