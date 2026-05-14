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
import { Copy, Download } from 'lucide-react';
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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Recovery code copied to clipboard.');
    } catch {
      toast.error('Could not access clipboard. Please write the words down.');
    }
  };

  const handleDownload = () => {
    const blob = new Blob(
      [
        'Quantive — recovery code\n',
        '------------------------------------\n\n',
        code + '\n\n',
        'Treat this like a password. Anyone with this code can unlock your encrypted data.\n',
        'Store it offline (printed or in a password manager). We CANNOT recover it for you.\n',
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

  const handleConfirm = () => {
    const expected = code.split(' ')[confirmIndex];
    if (confirmInput.trim().toLowerCase() !== expected) {
      toast.error(`That's not word #${confirmIndex + 1}. Check your saved copy.`);
      return;
    }
    toast.success('Recovery code saved. Keep it somewhere safe.');
    onConfirmed();
  };

  return (
    <>
      <div
        className="grid grid-cols-3 sm:grid-cols-4"
        style={{
          gap: 'var(--s-2)',
          borderRadius: 'var(--r-2)',
          border: '1px solid var(--border-raw)',
          background: 'color-mix(in oklch, var(--fg) 5%, transparent)',
          padding: 'var(--s-3)',
          marginBottom: 'var(--s-3)',
        }}
      >
        {code.split(' ').map((word, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              borderRadius: 'var(--r-1)',
              background: 'var(--surface)',
              padding: '4px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--fg)',
            }}
          >
            <span style={{ color: 'var(--fg-faint)' }}>{i + 1}</span>
            <span>{word}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--s-2)', marginBottom: 'var(--s-5)' }}>
        <button
          onClick={handleCopy}
          className="q-btn q-btn--secondary q-btn--sm"
          style={{ flex: 1 }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </button>
        <button
          onClick={handleDownload}
          className="q-btn q-btn--secondary q-btn--sm"
          style={{ flex: 1 }}
        >
          <Download className="h-3.5 w-3.5" />
          Download .txt
        </button>
      </div>

      <div style={{ marginBottom: 'var(--s-3)' }}>
        <label
          htmlFor="recovery-confirm-word"
          style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--fg)', marginBottom: 6 }}
        >
          Confirm: type word #{confirmIndex + 1}
        </label>
        <label className="q-input">
          <input
            id="recovery-confirm-word"
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={`word ${confirmIndex + 1}`}
            style={{ fontFamily: 'var(--font-mono)' }}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        <button
          onClick={handleConfirm}
          disabled={!confirmInput.trim()}
          className="q-btn q-btn--primary q-btn--md"
          style={{ width: '100%', opacity: !confirmInput.trim() ? 0.5 : 1 }}
        >
          Confirm
        </button>
        <button
          onClick={onSkipConfirm}
          className="q-btn q-btn--ghost q-btn--sm"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-muted)' }}
        >
          I'll save it later — close anyway
        </button>
      </div>
    </>
  );
}
