import { CloudOff, Loader2, Check } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';

const PILL_BASE = 'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs';

const VARIANTS = {
  syncing: {
    className: `${PILL_BASE} bg-secondary text-muted-foreground`,
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    label: 'Syncing',
  },
  synced: {
    className: `${PILL_BASE} bg-emerald-500/10 text-emerald-400`,
    icon: <Check className="h-3 w-3" />,
    label: 'Synced',
  },
  error: {
    className: `${PILL_BASE} bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20`,
    icon: <CloudOff className="h-3 w-3" />,
    label: 'Sync failed — Retry',
  },
} as const;

export function SyncIndicator() {
  const { syncStatus, retrySync } = usePortfolio();
  const { user } = useAuth();

  if (!user || !user.email_confirmed_at) return null;
  if (syncStatus === 'idle') return null;

  const variant = VARIANTS[syncStatus];

  if (syncStatus === 'error') {
    return (
      <button onClick={retrySync} className={variant.className} title="Cloud sync failed — click to retry">
        {variant.icon}
        {variant.label}
      </button>
    );
  }

  return (
    <span className={variant.className}>
      {variant.icon}
      {variant.label}
    </span>
  );
}
