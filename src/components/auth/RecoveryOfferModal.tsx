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
 * re-prompting that user. They can still set up later via Settings (Phase 7).
 *
 * If the user closes the tab during 'display' before confirming, the
 * recovery code is already persisted server-side — they can use it. The
 * confirm-by-typing step is a UX safeguard, not a security one.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Copy, Download, Lock, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';

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
  const [confirmInput, setConfirmInput] = useState('');

  // Pick a random index for the confirm-back word. Stable for the lifetime
  // of one display step. Using 1-indexed for human display.
  const [confirmIndex] = useState(() => Math.floor(Math.random() * 24));

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
      setConfirmInput('');
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

  const handleCopy = async () => {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      toast.success('Recovery code copied to clipboard.');
    } catch {
      toast.error('Could not access clipboard. Please write the words down.');
    }
  };

  const handleDownload = () => {
    if (!recoveryCode) return;
    const blob = new Blob(
      [
        'Networth Analysis — recovery code\n',
        '------------------------------------\n\n',
        recoveryCode + '\n\n',
        'Treat this like a password. Anyone with this code can unlock your encrypted data.\n',
        'Store it offline (printed or in a password manager). We CANNOT recover it for you.\n',
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'networth-analysis-recovery-code.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = () => {
    if (!recoveryCode) return;
    const expected = recoveryCode.split(' ')[confirmIndex];
    if (confirmInput.trim().toLowerCase() !== expected) {
      toast.error(
        `That's not word #${confirmIndex + 1}. Check your saved copy.`,
      );
      return;
    }
    markOffered();
    setRecoveryCode(null);
    setStep('done');
    toast.success('Recovery code saved. Keep it somewhere safe.');
  };

  const close = () => {
    if (step === 'display' && !submitting) {
      // Don't allow close-without-confirm during display — user needs to
      // either confirm or click "Skip confirmation" (a way out).
      // Showing as a toast prompt for now.
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

            <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/30 p-3 sm:grid-cols-4">
              {recoveryCode.split(' ').map((word, i) => (
                <div
                  key={i}
                  className="flex items-baseline gap-1.5 rounded bg-background/40 px-2 py-1 font-mono text-xs text-foreground"
                >
                  <span className="text-muted-foreground/60">{i + 1}</span>
                  <span>{word}</span>
                </div>
              ))}
            </div>

            <div className="mb-5 flex gap-2">
              <button
                onClick={handleCopy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground transition-colors hover:bg-secondary"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
              <button
                onClick={handleDownload}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground transition-colors hover:bg-secondary"
              >
                <Download className="h-3.5 w-3.5" />
                Download .txt
              </button>
            </div>

            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Confirm: type word #{confirmIndex + 1}
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={`word ${confirmIndex + 1}`}
                className="w-full rounded-lg border border-border bg-secondary/50 px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleConfirm}
                disabled={!confirmInput.trim()}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                onClick={() => {
                  markOffered();
                  setRecoveryCode(null);
                  setStep('done');
                }}
                className="text-center text-xs text-muted-foreground hover:text-foreground"
              >
                I'll save it later — close anyway
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
