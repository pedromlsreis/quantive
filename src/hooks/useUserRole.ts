import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

export type AppRole = Database['public']['Enums']['app_role'];

interface UserRoleState {
  roles: AppRole[];
  isAdmin: boolean;
  isModerator: boolean;
  loading: boolean;
}

const empty: UserRoleState = {
  roles: [],
  isAdmin: false,
  isModerator: false,
  loading: true,
};

export function useUserRole(): UserRoleState {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<UserRoleState>(empty);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ roles: [], isAdmin: false, isModerator: false, loading: false });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ roles: [], isAdmin: false, isModerator: false, loading: false });
          return;
        }
        const roles = (data ?? []).map((r) => r.role as AppRole);
        setState({
          roles,
          isAdmin: roles.includes('admin'),
          isModerator: roles.includes('moderator'),
          loading: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return state;
}
