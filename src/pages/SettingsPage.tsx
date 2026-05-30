import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpsellCard } from '@/components/billing/UpsellCard';
import { Notice } from '@/components/ui/Notice';
import { extractCheckoutErrorCode, messageForPortalError } from '@/lib/billing/checkoutError';
import { analytics } from '@/lib/analytics';
import { useCurrency, type CurrencyCode } from '@/contexts/CurrencyContext';
import { usePreferences, type NumberFormat } from '@/contexts/PreferencesContext';
import { REMINDER_OPTIONS, normaliseReminderFrequency, type ReminderFrequency } from '@/lib/reminders';
import { supabase } from '@/integrations/supabase/client';
import { RecoveryCodeDisplay } from '@/components/auth/RecoveryCodeDisplay';
import { PdfReportButton } from '@/components/export/PdfReportButton';
import {
  Pencil,
  Check,
  X,
  Trash2,
  ShieldCheck,
  KeyRound,
  RotateCcw,
  Wallet,
  Hash,
  EyeOff,
  Mail,
  Bell,
  Download,
  Database,
  CreditCard,
  BarChart3,
} from 'lucide-react';
import { getConsent, setConsent, subscribeConsent, type ConsentState } from '@/lib/consent';
import { Link } from 'react-router-dom';
import { resolvePlan } from '@/lib/billing/plans';
import { mapAuthError } from '@/lib/authError';
import { PASSWORD_MIN_LENGTH, PASSWORD_LENGTH_HINT, passwordTooShort } from '@/lib/passwordPolicy';
import { toast } from 'sonner';
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

const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string; sample?: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'us',   label: 'US-style',  sample: '1,234,567.89' },
  { value: 'eu',   label: 'European',  sample: '1.234.567,89' },
  { value: 'in',   label: 'Indian',    sample: '12,34,567.89' },
];

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  color: 'var(--fg-muted)',
  marginBottom: 'var(--s-1)',
};

/* See .q-pref-row in index.css — class controls layout so a media query
   can stack rows vertically on mobile (inline styles can't do that). */
const PREF_ROW_CLASS = 'q-pref-row';

export default function SettingsPage() {
  const { user, signOut, updatePassword, subscription, checkSubscription } = useAuth();

  // Re-check on mount so a user who lands here directly after checkout
  // (or who navigates here before the 60s background poll runs) sees the
  // up-to-date plan instead of whatever AuthContext last cached.
  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);
  const keySession = useKeySession();
  const { data } = usePortfolio();
  const { has } = useEntitlements();
  const canExportExcel = has('export.excel');
  const canExportCsv = has('export.csv');
  const currentPlan = resolvePlan(subscription.subscribed ? subscription.productId : null);
  const [managingBilling, setManagingBilling] = useState(false);

  const handleManageBilling = async () => {
    // Open a blank tab synchronously on click so popup blockers don't intervene
    // when we navigate it after the async function call resolves.
    const portalTab = window.open('', '_blank');
    setManagingBilling(true);
    try {
      const { data: portal, error } = await supabase.functions.invoke('customer-portal');
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
  const { numberFormat, setNumberFormat, privacyMode, setPrivacyMode, blurOnUnfocus, setBlurOnUnfocus } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();

  // Deep-link support: `/settings#recovery` (e.g. from the sidebar avatar
  // menu) scrolls to the recovery sub-section once the section has mounted.
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
      toast.error('Failed to update display name.');
    } else {
      setDisplayName(draft.trim());
      setEditing(false);
      toast.success('Display name updated!');
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
      toast.error("Couldn't save your reminder preference. Please try again.");
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
      toast.error('Passwords do not match.');
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
          'Password updated, but the encryption wrap could not be rotated. Please retry, or use your recovery code on next sign-in.',
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
      toast.error('No data to export.');
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
      const exporter = await import('@/lib/exporter');
      if (fmt === 'xlsx') {
        await exporter.exportPortfolioExcel(data, `portfolio_${timestamp}.xlsx`);
      } else {
        exporter.exportPortfolioCsv(data, `portfolio_${timestamp}.csv`);
      }
    } catch {
      toast.error('Export failed.');
    } finally {
      setExporting(null);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error || !data?.success) {
        toast.error('Failed to delete account. Please try again.');
        setDeleting(false);
        return;
      }
      // PortfolioContext's user-id watcher wipes all client state when
      // signOut() flips user to null. See docs/security/encryption.md §8.3.
      await signOut();
      toast.success('Your account and all data have been permanently deleted.');
      navigate('/');
    } catch {
      toast.error('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header style={{ marginBottom: 'var(--s-8)' }}>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p style={{ marginTop: 'var(--s-1)', fontSize: 'var(--text-sm)', color: 'var(--fg-subtle)' }}>
          Personalise your workspace, manage data, and control account security.
        </p>
      </header>

      {/* Profile */}
      {user && (
        <section className="q-card q-card--p-lg" style={{ marginBottom: 'var(--s-8)' }}>
          <div className="q-section-head">
            <h2>Profile</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
            <div>
              <p style={fieldLabel}>Email</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>{user.email}</p>
            </div>
            <div>
              <p style={fieldLabel}>Display name</p>
              {editing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                  <label className="q-input" style={{ flex: 1, maxWidth: 300 }}>
                    <input
                      type="text"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      placeholder="Enter display name"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSave();
                        if (e.key === 'Escape') setEditing(false);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !draft.trim()}
                    className="q-icon-btn"
                    style={{ color: 'var(--accent-raw)', opacity: saving || !draft.trim() ? 0.4 : 1 }}
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="q-icon-btn"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>{displayName || '—'}</p>
                  <button
                    type="button"
                    onClick={() => { setDraft(displayName || ''); setEditing(true); }}
                    className="q-icon-btn"
                    title="Edit display name"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Billing */}
      {user && (
        <section className="q-card q-card--p-lg" style={{ marginBottom: 'var(--s-8)' }}>
          <div className="q-section-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <CreditCard className="h-4 w-4 text-primary" />
              Billing
            </h2>
          </div>
          {subscription.paymentPastDue && (
            <Notice
              variant="warning"
              role="status"
              style={{ marginBottom: 'var(--s-4)', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--s-1)' }}
            >
              <p style={{ fontWeight: 600, margin: 0 }}>Your last payment didn't go through</p>
              <p style={{ margin: 0, opacity: 0.9 }}>
                We're still retrying, and you keep Pro access for now. Click 'Manage billing' below to update your card before retries run out.
              </p>
            </Notice>
          )}
          <div className={PREF_ROW_CLASS}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                Current plan:{' '}
                <span style={{ fontWeight: 600 }}>{currentPlan.name}</span>
              </p>
              {subscription.subscribed && subscription.subscriptionEnd && (
                <p style={{ marginTop: 'var(--s-1)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                  {subscription.cancelAtPeriodEnd
                    ? `Cancels on ${format(new Date(subscription.subscriptionEnd), 'd MMM yyyy')}. You'll keep Pro access until then.`
                    : `Renews on ${format(new Date(subscription.subscriptionEnd), 'd MMM yyyy')}.`}
                </p>
              )}
              {!subscription.subscribed && (
                <p style={{ marginTop: 'var(--s-1)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                  Upgrade to unlock full history, forecasting, and exports.
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexShrink: 0 }}>
              {/* Manage billing stays reachable for anyone with Stripe
                  history — active subscribers and cancelled users alike —
                  so they can pull invoices or reactivate without a fresh
                  checkout flow. Upgrade button shows for everyone not
                  currently subscribed (including ex-Pro). */}
              {(subscription.subscribed || subscription.hasStripeHistory) && (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={managingBilling}
                  className="q-btn q-btn--secondary q-btn--sm"
                  style={{ opacity: managingBilling ? 0.6 : 1 }}
                >
                  {managingBilling ? 'Opening…' : 'Manage billing'}
                </button>
              )}
              {!subscription.subscribed && (
                <Link to="/pricing" className="q-btn q-btn--primary q-btn--sm">
                  Upgrade to Pro
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Preferences */}
      <section className="q-card q-card--p-lg" style={{ marginBottom: 'var(--s-8)' }}>
        <div className="q-section-head">
          <h2>Preferences</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}>
          {/* Display currency */}
          <div className={PREF_ROW_CLASS}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                <Wallet className="h-4 w-4 text-primary" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>Display currency</span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                All balances are shown in this currency. Values stored in other currencies are converted at the rate of the snapshot date.
              </p>
            </div>
            <label className="q-input" style={{ width: 176, flexShrink: 0 }}>
              <select
                value={currency.code}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
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
          </div>

          {/* Number format */}
          <div className={PREF_ROW_CLASS}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                <Hash className="h-4 w-4 text-primary" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>Number format</span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                How separators and decimals appear across the app.
              </p>
            </div>
            <label className="q-input" style={{ width: 176, flexShrink: 0 }}>
              <select
                value={numberFormat}
                onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
              >
                {NUMBER_FORMAT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.sample ? `${opt.label} — ${opt.sample}` : opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Privacy mode */}
          <div className={PREF_ROW_CLASS}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                <EyeOff className="h-4 w-4 text-primary" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>Privacy mode</span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                Blur monetary values throughout the app. Hover a value to peek, or press and hold on touch.
              </p>
            </div>
            <button
              type="button"
              className={`q-toggle${privacyMode ? ' is-on' : ''}`}
              onClick={() => setPrivacyMode(!privacyMode)}
              aria-checked={privacyMode}
              aria-label="Privacy mode"
              role="switch"
            >
              <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
            </button>
          </div>

          {/* Auto-blur when the window loses focus */}
          <div className={PREF_ROW_CLASS}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                <EyeOff className="h-4 w-4 text-primary" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>Hide values when you switch away</span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                Automatically blur values whenever this tab loses focus, and reveal them when you return. Handy on a shared screen or while presenting.
              </p>
            </div>
            <button
              type="button"
              className={`q-toggle${blurOnUnfocus ? ' is-on' : ''}`}
              onClick={() => setBlurOnUnfocus(!blurOnUnfocus)}
              aria-checked={blurOnUnfocus}
              aria-label="Hide values when the window loses focus"
              role="switch"
            >
              <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
            </button>
          </div>

          {/* Anonymous analytics */}
          <div className={PREF_ROW_CLASS}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                <BarChart3 className="h-4 w-4 text-primary" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>Anonymous analytics</span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                Share anonymous page views and feature usage with us via PostHog. No financial data, no email addresses, no cross-site tracking. Off by default.
              </p>
            </div>
            <button
              type="button"
              className={`q-toggle${analyticsConsent === 'granted' ? ' is-on' : ''}`}
              onClick={() => setConsent(analyticsConsent === 'granted' ? 'denied' : 'granted')}
              aria-checked={analyticsConsent === 'granted'}
              aria-label="Anonymous analytics"
              role="switch"
            >
              <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
            </button>
          </div>

          {/* Entry reminders */}
          {user && (
            <div className={PREF_ROW_CLASS}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                  <Bell className="h-4 w-4 text-primary" />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>Entry reminders</span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                  Get an email nudge to update your balances if you haven't logged in for a while. We only check when you last synced, never what's in your portfolio.
                </p>
              </div>
              <label className="q-input" style={{ width: 176, flexShrink: 0 }}>
                <select
                  value={reminderFrequency}
                  disabled={savingReminder}
                  onChange={(e) => handleReminderChange(e.target.value as ReminderFrequency)}
                  aria-label="Entry reminder schedule"
                >
                  {REMINDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Email summaries — coming soon */}
          <div className={PREF_ROW_CLASS} style={{ opacity: 0.7 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-1)' }}>
                <Mail className="h-4 w-4 text-primary" />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--fg)' }}>Email summaries</span>
                <span className="q-badge q-badge--accent" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Coming soon
                </span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                Monthly digest of net-worth movement, allocation drift, and forecast updates.
              </p>
            </div>
            <button
              type="button"
              className="q-toggle"
              disabled
              aria-checked={false}
              role="switch"
              aria-label="Email summaries (coming soon)"
              style={{ opacity: 0.4, cursor: 'not-allowed' }}
            >
              <span className="q-toggle-track"><span className="q-toggle-thumb" /></span>
            </button>
          </div>
        </div>
      </section>

      {/* Data */}
      <section className="q-card q-card--p-lg" style={{ marginBottom: 'var(--s-8)' }}>
        <div className="q-section-head">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
            <Database className="h-4 w-4 text-primary" />
            Your data
          </h2>
        </div>
        {canExportExcel || canExportCsv ? (
          <div className={PREF_ROW_CLASS}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>Export your data</p>
              <p style={{ marginTop: 'var(--s-1)', fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}>
                Excel preserves the full workbook (snapshots, per-source values, reference metadata).
                CSV flattens the facts sheet for spreadsheets, notebooks, and scripts.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 'var(--s-2)', flexShrink: 0 }}>
              {canExportExcel && (
                <button
                  type="button"
                  onClick={() => handleExport('xlsx')}
                  disabled={!data || exporting !== null}
                  className="q-btn q-btn--secondary q-btn--sm"
                  style={{ opacity: !data || exporting !== null ? 0.5 : 1 }}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
                </button>
              )}
              {canExportCsv && (
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  disabled={!data || exporting !== null}
                  className="q-btn q-btn--secondary q-btn--sm"
                  style={{ opacity: !data || exporting !== null ? 0.5 : 1 }}
                >
                  <Download className="h-3.5 w-3.5" />
                  {exporting === 'csv' ? 'Exporting…' : 'CSV'}
                </button>
              )}
              <PdfReportButton />
            </div>
          </div>
        ) : (
          <UpsellCard feature="export.excel" compact />
        )}
      </section>

      {/* Security */}
      {user && (
        <section className="q-card q-card--p-lg" style={{ marginBottom: 'var(--s-8)' }}>
          <div className="q-section-head">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
            <div>
              <p style={fieldLabel}>End-to-end encryption</p>
              {keySession.status === 'unlocked-encrypted' ? (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                  <span className="q-badge q-badge--accent">Enabled</span>{' '}
                  XChaCha20-Poly1305 + Argon2id.
                </p>
              ) : (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
                  Locked — sign out and sign in to manage encryption settings.
                </p>
              )}
            </div>

            <div id="recovery" style={{ scrollMarginTop: 'calc(var(--q-topbar-h, 0px) + var(--s-4))' }}>
              <p style={fieldLabel}>Recovery code</p>
              {keySession.hasRecovery === true ? (
                <div>
                  <p style={{ marginBottom: 'var(--s-2)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                    Configured. Generate a new one to invalidate the old.
                  </p>
                  <button
                    type="button"
                    onClick={handleSetUpRecovery}
                    disabled={provisioningRecovery || keySession.status !== 'unlocked-encrypted'}
                    className="q-btn q-btn--ghost q-btn--sm"
                    style={{ opacity: provisioningRecovery || keySession.status !== 'unlocked-encrypted' ? 0.5 : 1 }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {provisioningRecovery ? 'Generating…' : 'Rotate recovery code'}
                  </button>
                </div>
              ) : keySession.hasRecovery === false ? (
                <div>
                  <p style={{ marginBottom: 'var(--s-2)', fontSize: 'var(--text-sm)', color: 'var(--fg)' }}>
                    Not configured. Without one, a forgotten password means permanent loss of your encrypted data.
                  </p>
                  <button
                    type="button"
                    onClick={handleSetUpRecovery}
                    disabled={provisioningRecovery || keySession.status !== 'unlocked-encrypted'}
                    className="q-btn q-btn--primary q-btn--sm"
                    style={{ opacity: provisioningRecovery || keySession.status !== 'unlocked-encrypted' ? 0.5 : 1 }}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {provisioningRecovery ? 'Generating…' : 'Set up recovery code'}
                  </button>
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>Loading…</p>
              )}
            </div>

            <div>
              <p style={fieldLabel}>Change password</p>
              {!changingPassword ? (
                <button
                  type="button"
                  onClick={() => setChangingPassword(true)}
                  disabled={keySession.status !== 'unlocked-encrypted'}
                  className="q-btn q-btn--ghost q-btn--sm"
                  style={{ opacity: keySession.status !== 'unlocked-encrypted' ? 0.5 : 1 }}
                >
                  Change password
                </button>
              ) : (
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
                  <label className="q-input" style={{ maxWidth: 300 }}>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="New password"
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                      autoFocus
                    />
                  </label>
                  <label className="q-input" style={{ maxWidth: 300 }}>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPasswordConfirm}
                      onChange={e => setNewPasswordConfirm(e.target.value)}
                      placeholder="Confirm new password"
                      minLength={PASSWORD_MIN_LENGTH}
                      required
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                    <button
                      type="submit"
                      disabled={submittingPassword}
                      className="q-btn q-btn--primary q-btn--sm"
                      style={{ opacity: submittingPassword ? 0.5 : 1 }}
                    >
                      {submittingPassword ? 'Changing…' : 'Change password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChangingPassword(false);
                        setNewPassword('');
                        setNewPasswordConfirm('');
                      }}
                      className="q-btn q-btn--ghost q-btn--sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Danger zone */}
      {user && (
        <section
          className="q-card q-card--p-lg"
          style={{ borderColor: 'var(--negative)', background: 'var(--negative-bg)' }}
        >
          <div className="q-section-head">
            <h2 style={{ color: 'var(--negative)' }}>Danger zone</h2>
          </div>
          <p style={{ marginBottom: 'var(--s-4)', fontSize: 'var(--text-sm)', color: 'var(--fg-muted)' }}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="q-btn q-btn--sm"
            style={{ background: 'var(--negative)', color: 'white', gap: 'var(--s-2)' }}
          >
            <Trash2 className="h-4 w-4" />
            Delete my account
          </button>
        </section>
      )}

      {showRecoveryCode && (
        <div className="q-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
          <div className="q-modal">
            <div className="q-modal-head">
              <div className="q-modal-head-row">
                <div className="q-modal-chip" aria-hidden>
                  <KeyRound className="h-4 w-4" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="q-modal-title" id="recovery-title">Your recovery code</div>
                  <div className="q-modal-sub">
                    Save these 24 words somewhere safe. Anyone with these words can unlock your data — we won't show them again.
                  </div>
                </div>
              </div>
            </div>
            <div className="q-modal-body">
              <RecoveryCodeDisplay
                code={showRecoveryCode}
                onConfirmed={() => setShowRecoveryCode(null)}
                onSkipConfirm={() => setShowRecoveryCode(null)}
              />
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all associated data including
              portfolio snapshots, profile, and feedback. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Yes, delete everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
