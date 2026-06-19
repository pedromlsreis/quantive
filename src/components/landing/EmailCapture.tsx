import { useId, useRef, useState, type FormEvent } from 'react';
import { analytics, type EmailCaptureLocation } from '@/lib/analytics';
import { submitEmailSignup } from '@/lib/emailSignup';
import { Turnstile } from '@/components/auth/Turnstile';
import { isCaptchaEnabled } from '@/lib/captcha';

type Status = 'idle' | 'submitting' | 'success' | 'error';

// Pragmatic shape check to catch obvious typos before a round-trip; the Edge
// Function and table constraint are the authoritative validators.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Low-commitment email capture for visitors not ready to create an encrypted
 * account. Rendered as a subordinate block inside the closing CTA. The provider
 * call lives in lib/emailSignup; this component owns the form, its states, the
 * Turnstile token, and the accessibility contract.
 */
export function EmailCapture({ location = 'landing' }: { location?: EmailCaptureLocation }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Turnstile tokens are single-use; bump this to remount the widget for a fresh
  // one after a failed submit or an expiry.
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;
  const submitting = status === 'submitting';

  function fail(message: string) {
    setStatus('error');
    setError(message);
    inputRef.current?.focus();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      fail('Please enter a valid email address.');
      return;
    }
    if (isCaptchaEnabled && !token) {
      fail('Please complete the verification just below, then try again.');
      return;
    }
    setStatus('submitting');
    setError(null);
    try {
      await submitEmailSignup(value, token);
      setStatus('success');
      analytics.emailCaptured({ location });
    } catch {
      fail('Something went wrong. Please try again.');
      // Refresh the single-use token for the retry.
      setToken(null);
      setCaptchaNonce((n) => n + 1);
    }
  }

  if (status === 'success') {
    return (
      <div className="lp-email">
        <p className="lp-email-success" role="status">
          <span className="lp-email-success-check" aria-hidden="true">✓</span>
          You're on the list. I'll be in touch when there's something worth sharing.
        </p>
      </div>
    );
  }

  return (
    <div className="lp-email">
      <p className="lp-email-prompt">
        Not ready today? Leave your email and I'll send the occasional update.
      </p>

      <form className="lp-email-form" onSubmit={handleSubmit} noValidate>
        <div className="lp-email-row">
          <label className="sr-only" htmlFor={fieldId}>Email address</label>
          <input
            ref={inputRef}
            id={fieldId}
            className="lp-email-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === 'error') {
                setStatus('idle');
                setError(null);
              }
            }}
            aria-invalid={status === 'error'}
            aria-describedby={status === 'error' ? errorId : helpId}
            disabled={submitting}
            required
          />
          <button
            type="submit"
            className="lp-btn-primary lp-email-btn"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Adding you…' : 'Keep me posted'}
          </button>
        </div>

        {isCaptchaEnabled && (
          <div className="lp-email-cf">
            <Turnstile
              key={captchaNonce}
              onVerify={setToken}
              onExpire={() => setToken(null)}
              onError={() => setToken(null)}
            />
          </div>
        )}
      </form>

      {status === 'error' && error ? (
        <p className="lp-email-error" id={errorId} role="alert">{error}</p>
      ) : (
        <p className="lp-email-help" id={helpId}>Unsubscribe anytime.</p>
      )}
    </div>
  );
}
