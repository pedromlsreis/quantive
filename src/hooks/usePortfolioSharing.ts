import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  listPendingInvites,
  listPortfolioPeople,
  type PendingInvite,
  type PortfolioPerson,
} from '@/lib/portfolioSharing';

interface SharingState {
  userId: string | null;
  people: PortfolioPerson[];
  invites: PendingInvite[];
}

const EMPTY: SharingState = { userId: null, people: [], invites: [] };

/**
 * Who each extra portfolio is shared with, and the invites still pending.
 * Held in component state rather than the query cache, and tagged with the
 * user it was fetched for, so an account switch never shows the previous
 * user's partner. Refetched when the portfolio list changes.
 */
export function usePortfolioSharing(enabled: boolean, portfolioIds: readonly string[]) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<SharingState>(EMPTY);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const idsKey = portfolioIds.join(',');

  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    Promise.all([listPortfolioPeople(supabase), listPendingInvites(supabase, userId)])
      .then(([people, invites]) => {
        if (!cancelled) setState({ userId, people, invites });
      })
      .catch((e) => console.debug('[sharing] unavailable:', e));
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, version, idsKey]);

  const current = state.userId === userId ? state : EMPTY;
  return { people: current.people, invites: current.invites, refresh };
}
