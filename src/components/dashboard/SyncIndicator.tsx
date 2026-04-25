import { CloudOff, Loader2, Check } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';

export function SyncIndicator() {
  const { syncStatus, retrySync } = usePortfolio();
  const { user } = useAuth();

  // Cloud sync is only meaningful for confirmed users
  if (!user || !user.email_confirmed_at) return null;
  if (syncStatus === 'idle') return null;

  if (syncStatus === 'syncing') {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Syncing
      </span>
    );
  }

  if (syncStatus === 'synced') {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
        <Check className="h-3 w-3" />
        Synced
      </span>
    );
  }

  return (
    <button
      onClick={retrySync}
      className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive transition-colors hover:bg-destructive/20"
      title="Cloud sync failed — click to retry"
    >
      <CloudOff className="h-3 w-3" />
      Sync failed — Retry
    </button>
  );
}
