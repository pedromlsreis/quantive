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
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useModalLayer } from '@/hooks/useModalLayer';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { analytics } from '@/lib/analytics';
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
  // Guards a single recovery_offer_shown per user per session.
  const offerShownRef = useRef(false);
  useEffect(() => {
    const id = user?.id ?? null;
    if (previousUserIdRef.current !== id) {
      setStep('offer');
      setRecoveryCode(null);
      offerShownRef.current = false;
      previousUserIdRef.current = id;
    }
  }, [user?.id]);

  useEffect(() => {
    if (shouldOffer && step === 'offer' && !offerShownRef.current) {
      offerShownRef.current = true;
      analytics.recoveryOfferShown();
    }
  }, [shouldOffer, step]);

  const visible = !!user && step !== 'done' && !(step === 'offer' && !shouldOffer);

  const markOffered = () => {
    if (!user) return;
    try {
      localStorage.setItem(offeredKey(user.id), '1');
    } catch {
      // Storage unavailable; user will be re-prompted next session.
    }
  };

  // Dismissing the offer is a skip. The word list can't be dismissed: it
  // closes through Confirm or "Close without checking".
  const dismissOffer = () => {
    analytics.recoverySkipped();
    markOffered();
    setRecoveryCode(null);
    setStep('done');
  };

  useModalLayer(visible, step === 'offer' ? dismissOffer : undefined);
  const trapRef = useFocusTrap<HTMLDivElement>(visible);

  if (!visible || !user) return null;

  const handleSetUp = async () => {
    setSubmitting(true);
    try {
      const result = await keySession.setupRecovery(user.id);
      analytics.recoverySetupCompleted({ source: 'offer_modal' });
      setRecoveryCode(result.recoveryCode);
      setStep('display');
    } catch {
      toast.error("Couldn't create a recovery code. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const finishDisplay = () => {
    markOffered();
    setRecoveryCode(null);
    setStep('done');
  };

  return createPortal(
    <div className="q-modal-backdrop">
      <div
        ref={trapRef}
        className="q-modal"
        style={{ maxWidth: 520 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-offer-title"
        aria-describedby="recovery-offer-sub"
      >
        <div className="q-modal-head">
          <div>
            <h2 className="q-modal-title" id="recovery-offer-title">
              {step === 'offer' ? 'Create a recovery code' : 'Your recovery code'}
            </h2>
            <p className="q-modal-sub" id="recovery-offer-sub">
              {step === 'offer'
                ? "If you forget your password, these 24 words are the only way to decrypt your data. We can't reset it for you."
                : "Write these 24 words down or keep them in a password manager. They're shown once, and anyone who has them can decrypt your data."}
            </p>
          </div>
          {step === 'offer' && (
            <button type="button" onClick={dismissOffer} className="q-icon-btn" aria-label="Close">
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {step === 'display' && recoveryCode && (
          <div className="q-modal-body">
            <RecoveryCodeDisplay code={recoveryCode} onConfirmed={finishDisplay} onSkipConfirm={finishDisplay} />
          </div>
        )}

        {step === 'offer' && (
          <div className="q-modal-foot q-modal-foot--split">
            <button type="button" onClick={dismissOffer} disabled={submitting} className="q-btn q-btn--ghost q-btn--md">
              Not now
            </button>
            <button type="button" onClick={handleSetUp} disabled={submitting} className="q-btn q-btn--primary q-btn--md">
              {submitting ? 'Creating…' : 'Create recovery code'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
