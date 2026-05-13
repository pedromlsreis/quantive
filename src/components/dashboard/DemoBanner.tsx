import { useState } from 'react';
import { FlaskConical, X } from 'lucide-react';

const DISMISS_KEY = 'quantive.demoBanner.dismissed';

export function DemoBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-label="Demo data notice"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 32,
        padding: '0 6px 0 12px',
        background: 'var(--bg-elev-1)',
        border: '1px solid var(--border-raw)',
        borderRadius: 'var(--r-pill, 999px)',
        boxShadow: 'var(--shadow-md)',
        color: 'var(--fg-muted)',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 999,
          background: 'color-mix(in oklch, var(--warning) 18%, transparent)',
          color: 'var(--warning)',
          flexShrink: 0,
        }}
      >
        <FlaskConical size={11} strokeWidth={2.25} />
      </span>

      <span style={{ whiteSpace: 'nowrap' }}>
        Demo data — figures are illustrative
      </span>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss demo notice"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          marginLeft: 2,
          border: 0,
          background: 'transparent',
          color: 'var(--fg-faint)',
          cursor: 'pointer',
          borderRadius: 'var(--r-1)',
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}
