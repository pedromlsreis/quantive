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

import { useEffect, useMemo, useRef, useState } from 'react';
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

  const shouldOffer = useMemo(() => {
    if (!user) return false;
    if (keySession.status !== 'unlocked-encrypted') return false;
    if (keySession.hasRecovery !== false) return false;
    try {
      return localStorage.getItem(offeredKey(user.id)) === null;
    } catch {
      return true;
    }
  }, [user, keySession.status, keySession.hasRecovery]);

  const previousUserIdRef = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    const id = user?.id ?? null;
    if (previousUserIdRef.current !== id) {
      setStep('offer');
      setRecoveryCode(null);
      previousUserIdRef.current = id;
    }
  }, [user?.id]);

  if (!user) return null;
  if (step === 'offer' && !shouldOffer) return null;
  if (step === 'done') return null;

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
    <div
      className="q-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-offer-title"
      style={{ zIndex: 55 }}
    >
      <div className="q-modal">
        <div className="q-modal-head">
          <div>
            <div className="q-modal-title" id="recovery-offer-title">
              {step === 'offer' ? 'Set up a recovery code' : 'Your recovery code'}
            </div>
            <div className="q-modal-sub">
              {step === 'offer'
                ? 'Your data is end-to-end encrypted. If you forget your password, we cannot recover it for you.'
                : "Save these 24 words somewhere safe — we'll only show them once. Anyone with these words can unlock your data."}
            </div>
          </div>
          <button type="button" onClick={close} className="q-icon-btn" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="q-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 'var(--r-3)',
            background: 'var(--accent-faint-raw)', flexShrink: 0,
          }}>
            <Lock className="h-6 w-6 text-primary" />
          </div>

          {step === 'offer' && (
            <div style={{
              borderRadius: 'var(--r-2)',
              border: '1px solid color-mix(in oklch, var(--warning) 35%, transparent)',
              background: 'color-mix(in oklch, var(--warning) 12%, transparent)',
              padding: 'var(--s-3)',
              fontSize: 'var(--text-xs)',
              color: 'var(--warning)',
              display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)',
            }}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ marginTop: 1 }} />
              <span>
                Without a recovery code, a forgotten password means permanent loss of your encrypted data.
              </span>
            </div>
          )}

          {step === 'display' && recoveryCode && (
            <RecoveryCodeDisplay
              code={recoveryCode}
              onConfirmed={finishDisplay}
              onSkipConfirm={finishDisplay}
            />
          )}
        </div>

        {step === 'offer' && (
          <div className="q-modal-foot" style={{ justifyContent: 'stretch', gap: 'var(--s-2)' }}>
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="q-btn q-btn--ghost q-btn--md"
              style={{ flex: 1, opacity: submitting ? 0.5 : 1 }}
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleSetUp}
              disabled={submitting}
              className="q-btn q-btn--primary q-btn--md"
              style={{ flex: 1, opacity: submitting ? 0.5 : 1 }}
            >
              {submitting ? 'Generating…' : 'Set up now'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
