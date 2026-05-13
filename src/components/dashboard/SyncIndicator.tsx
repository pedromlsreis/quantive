import type { CSSProperties } from 'react';
import { CloudOff, Loader2, Check } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';

const pillBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 'var(--r-2)',
  padding: '3px 8px',
  fontSize: 'var(--text-xs)',
  lineHeight: 1,
  cursor: 'default',
};

const VARIANTS: Record<'syncing' | 'synced' | 'error', { style: CSSProperties; icon: React.ReactNode; label: string; title: string }> = {
  syncing: {
    style: { ...pillBase, background: 'color-mix(in oklch, var(--fg) 8%, transparent)', color: 'var(--fg-muted)' },
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    label: 'Syncing',
    title: 'Syncing',
  },
  synced: {
    style: { ...pillBase, background: 'color-mix(in oklch, var(--positive) 15%, transparent)', color: 'var(--positive)' },
    icon: <Check className="h-3 w-3" />,
    label: 'Synced',
    title: 'Synced',
  },
  error: {
    style: { ...pillBase, background: 'color-mix(in oklch, var(--negative) 15%, transparent)', color: 'var(--negative)', cursor: 'pointer' },
    icon: <CloudOff className="h-3 w-3" />,
    label: 'Sync failed — Retry',
    title: 'Sync failed — tap to retry',
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
