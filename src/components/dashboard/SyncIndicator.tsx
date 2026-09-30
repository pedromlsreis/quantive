import type { CSSProperties } from 'react';
import { CloudOff, Loader2, Check } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';

// Plain status text beside the topbar actions; only a failure asks for attention.
const base: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 4px',
  fontSize: 12,
  lineHeight: 1,
  cursor: 'default',
  background: 'none',
  border: 0,
  fontFamily: 'inherit',
};

const VARIANTS: Record<'syncing' | 'synced' | 'error', { style: CSSProperties; icon: React.ReactNode; label: string; title: string }> = {
  syncing: {
    style: { ...base, color: 'var(--fg-subtle)' },
    icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
    label: 'Syncing',
    title: 'Syncing',
  },
  synced: {
    style: { ...base, color: 'var(--fg-subtle)' },
    icon: <Check className="h-3 w-3" aria-hidden="true" />,
    label: 'Synced',
    title: 'Synced',
  },
  error: {
    style: { ...base, color: 'var(--negative)', cursor: 'pointer', minHeight: 32 },
    icon: <CloudOff className="h-3 w-3" aria-hidden="true" />,
    label: "Couldn't sync. Retry",
    title: "Couldn't sync. Retry",
  },
};

export function SyncIndicator() {
  const { syncStatus, retrySync } = usePortfolio();
  const { user } = useAuth();

  if (!user || !user.email_confirmed_at) return null;
  if (syncStatus === 'idle') return null;

  const variant = VARIANTS[syncStatus];

  if (syncStatus === 'error') {
    return (
      <button onClick={retrySync} style={variant.style} title={variant.title} aria-label={variant.title}>
        {variant.icon}
        <span className="hidden sm:inline">{variant.label}</span>
      </button>
    );
  }

  return (
    <span style={variant.style} title={variant.title} aria-label={variant.title}>
      {variant.icon}
      <span className="hidden sm:inline">{variant.label}</span>
    </span>
  );
}
