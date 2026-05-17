import { useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export function EmailConfirmationBanner() {
  const { user, resendConfirmation } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.email_confirmed_at) return null;

  const handleResend = async () => {
    if (submitting || sent) return;
    setSubmitting(true);
    const { error } = await resendConfirmation();
    setSubmitting(false);
    if (error) {
      toast.error(`Could not resend: ${error}`);
      return;
    }
    setSent(true);
    toast.success('Confirmation email sent — check your inbox.');
    // Re-enable the action after 30s so users can retry if the email never arrives.
    setTimeout(() => setSent(false), 30_000);
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
        className="inline-flex h-9 items-center rounded-md px-3 text-xs font-semibold underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default disabled:opacity-60 disabled:no-underline"
        style={{ color: 'var(--warning)' }}
      >
        {submitting ? 'Sending…' : sent ? 'Sent ✓' : 'Resend email'}
      </button>
    </div>
  );
}
