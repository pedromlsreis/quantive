/**
 * One-time post-unlock prompt offering recovery-code setup. Spec: docs/security/encryption.md §10.
 *
 * Three states inside the modal:
 *   - 'offer'   : "Set up a recovery code now?" (Yes / Skip)
 *   - 'display' : 24 words shown, with copy + download. User must type back
 *                 a randomly chosen word to advance.
 *   - 'done'    : confirmation flashed, modal dismounts.
 *
 * Once dismissed (Yes-completed or Skip), a localStorage flag prevents
 * re-prompting that user. They can still set up later via Settings.
 *
 * If the user closes the tab during 'display' before confirming, the
 * recovery code is already persisted server-side — they can use it. The
 * confirm-by-typing step is a UX safeguard, not a security one.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Lock, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { RecoveryCodeDisplay } from './RecoveryCodeDisplay';

const STORAGE_PREFIX = 'recovery-offered:';

function offeredKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function RecoveryOfferModal() {
  const { user } = useAuth();
  const keySession = useKeySession();
  const [step, setStep] = useState<'offer' | 'display' | 'done'>('offer');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const shouldShow = useMemo(() => {
    if (!user) return false;
    if (keySession.status !== 'unlocked-encrypted') return false;
    if (keySession.hasRecovery !== false) return false; // null (unknown) or true (set up)
    try {
      return localStorage.getItem(offeredKey(user.id)) === null;
    } catch {
      return true;
    }
  }, [user, keySession.status, keySession.hasRecovery]);

  // Reset internal state when the modal closes (e.g., user logs out).
  useEffect(() => {
    if (!shouldShow) {
      setStep('offer');
      setRecoveryCode(null);
    }
  }, [shouldShow]);

  if (!shouldShow || !user) return null;

  const markOffered = () => {
    try {
      localStorage.setItem(offeredKey(user.id), '1');
    } catch {
      // Storage unavailable; user will be re-prompted next session.
    }
  };

  const handleSetUp = async () => {
    setSubmitting(true);
    try {
      const result = await keySession.setupRecovery(user.id);
      setRecoveryCode(result.recoveryCode);
      setStep('display');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to set up recovery code.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    markOffered();
    setStep('done');
  };

  const finishDisplay = () => {
    markOffered();
    setRecoveryCode(null);
    setStep('done');
  };

  const close = () => {
    if (step === 'display') {
      toast.info('Either confirm the word or click "I\'ll save it later" below.');
      return;
    }
    markOffered();
    setRecoveryCode(null);
    setStep('done');
  };

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <button
          onClick={close}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>

        {step === 'offer' && (
          <>
            <h2 className="mb-1 text-lg font-bold text-foreground">
              Set up a recovery code
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Your data is end-to-end encrypted. If you forget your password,
              we cannot recover it for you. A 24-word recovery code is the
              one way to regain access.
            </p>

            <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Without a recovery code, a forgotten password means
                  permanent loss of your encrypted data.
                </span>
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSkip}
                disabled={submitting}
                className="flex-1 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                Skip for now
              </button>
              <button
                onClick={handleSetUp}
                disabled={submitting}
                className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? 'Generating…' : 'Set up now'}
              </button>
            </div>
          </>
        )}

        {step === 'display' && recoveryCode && (
          <>
            <h2 className="mb-1 text-lg font-bold text-foreground">
              Your recovery code
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Save these 24 words somewhere safe — we'll only show them once.
              Anyone with these words can unlock your data.
            </p>

            <RecoveryCodeDisplay
              code={recoveryCode}
              onConfirmed={finishDisplay}
              onSkipConfirm={finishDisplay}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
