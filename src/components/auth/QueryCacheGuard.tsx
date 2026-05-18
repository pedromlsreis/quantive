/**
 * Clears the React Query cache whenever the auth user-id changes. Mirrors
 * the PortfolioContext + KeySessionContext watcher pattern so no per-user
 * query data leaks across sign-out or account-switch.
 *
 * Mount inside <AuthProvider> and <QueryClientProvider> so `useAuth()` and
 * `useQueryClient()` both resolve.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export function QueryCacheGuard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const previousUserId = previousUserIdRef.current;
    if (previousUserId !== null && previousUserId !== currentUserId) {
      queryClient.clear();
    }
    previousUserIdRef.current = currentUserId;
  }, [user?.id, queryClient]);

  return null;
}
