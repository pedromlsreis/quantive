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
  // Random index for the confirm word, stable for the lifetime of this component.
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
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg border border-border bg-secondary/30 p-3 sm:grid-cols-4">
        {code.split(' ').map((word, i) => (
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
          onClick={onSkipConfirm}
          className="text-center text-xs text-muted-foreground hover:text-foreground"
        >
          I'll save it later — close anyway
        </button>
      </div>
    </>
  );
}
