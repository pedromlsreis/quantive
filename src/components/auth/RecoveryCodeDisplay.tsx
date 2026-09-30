/**
 * Reusable display + confirm UI for a freshly-generated recovery code.
 *
 * The code itself is held by the caller (parent component) — this component
 * is intentionally stateless about the code so it can be used in different
 * flows (post-signup offer, settings rotation) without conflict.
 *
 * The confirm-by-typing-back step is a UX safeguard: it forces the user to
 * actually look at the code rather than dismiss the modal blind. The
 * particular word index is randomized per render, so a user dismissing two
 * consecutive prompts isn't shown the same word twice.
 */

import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  code: string;
  /** Called when the user successfully confirms by typing word #N. */
  onConfirmed: () => void;
  /** Called when the user explicitly opts out of confirming (esc hatch). */
  onSkipConfirm: () => void;
}

export function RecoveryCodeDisplay({ code, onConfirmed, onSkipConfirm }: Props) {
  const [confirmInput, setConfirmInput] = useState('');
  const [confirmIndex] = useState(() => Math.floor(Math.random() * 24));
  const [mismatch, setMismatch] = useState(false);
  const words = code.split(' ');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Recovery code copied');
    } catch {
      toast.error("Couldn't copy. Write the words down instead.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob(
      [
        'Quantive recovery code\n\n',
        code + '\n\n',
        'Treat this like a password: anyone with these words can decrypt your data.\n',
        "Keep it offline or in a password manager. We can't recover it for you.\n",
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quantive-recovery-code.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmInput.trim().toLowerCase() !== words[confirmIndex]) {
      setMismatch(true);
      return;
    }
    toast.success('Recovery code confirmed');
    onConfirmed();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <ol className="q-recovery-words">
        {words.map((word, i) => (
          <li key={i}><span aria-hidden="true">{i + 1}</span>{word}</li>
        ))}
      </ol>

      <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
        <button type="button" onClick={handleCopy} className="q-btn q-btn--secondary q-btn--md" style={{ flex: 1 }}>
          Copy
        </button>
        <button type="button" onClick={handleDownload} className="q-btn q-btn--secondary q-btn--md" style={{ flex: 1 }}>
          Download .txt
        </button>
      </div>

      <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div className="q-field">
          <label className="q-field-label" htmlFor="recovery-confirm-word">
            To check you have them, type word {confirmIndex + 1}
          </label>
          <span className="q-input">
            <input
              id="recovery-confirm-word"
              type="text"
              value={confirmInput}
              onChange={(e) => { setConfirmInput(e.target.value); setMismatch(false); }}
              style={{ fontFamily: 'var(--font-mono)' }}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={mismatch || undefined}
              aria-describedby={mismatch ? 'recovery-confirm-error' : undefined}
            />
          </span>
          {mismatch && (
            <span className="q-field-error" id="recovery-confirm-error" role="alert">
              {`That isn't word ${confirmIndex + 1}. Check your copy.`}
            </span>
          )}
        </div>
        <button type="submit" disabled={!confirmInput.trim()} className="q-btn q-btn--primary q-btn--lg" style={{ width: '100%' }}>
          Confirm
        </button>
        <button type="button" onClick={onSkipConfirm} className="q-btn q-btn--ghost q-btn--lg" style={{ width: '100%' }}>
          Close without checking
        </button>
      </form>
    </div>
  );
}
