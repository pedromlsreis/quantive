import { useEffect, useRef, useState } from 'react';
import { Check, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { mapAuthError } from '@/lib/authError';

export function EmailConfirmationBanner() {
  const { user, resendConfirmation } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  // Track the re-enable timer so we can cancel it on unmount and avoid a
  // setState on an unmounted component (no leak, no React warning).
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  if (!user || user.email_confirmed_at) return null;

  const handleResend = async () => {
    if (submitting || sent) return;
    setSubmitting(true);
    const { error } = await resendConfirmation();
    setSubmitting(false);
    if (error) {
      toast.error(mapAuthError(error));
      return;
    }
    setSent(true);
    toast.success('Confirmation email sent — check your inbox.');
    // Re-enable the action after 30s so users can retry if the email never arrives.
    resetTimerRef.current = setTimeout(() => {
      setSent(false);
      resetTimerRef.current = null;
    }, 30_000);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2"
      style={{
        background: 'color-mix(in oklch, var(--warning) 12%, transparent)',
        borderBottom: '1px solid color-mix(in oklch, var(--warning) 30%, transparent)',
        color: 'var(--warning)',
      }}
    >
      <span className="inline-flex items-center gap-2 text-xs font-medium tracking-wide">
        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Confirm your email to enable cloud sync</span>
      </span>
      <button
        type="button"
        onClick={handleResend}
        disabled={submitting || sent}
        aria-label={sent ? 'Confirmation email sent' : 'Resend confirmation email'}
        className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs font-semibold underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default disabled:opacity-60 disabled:no-underline"
        style={{ color: 'var(--warning)' }}
      >
        {submitting ? 'Sending…' : sent ? (<><Check size={12} aria-hidden="true" />Sent</>) : 'Resend email'}
      </button>
    </div>
  );
}
