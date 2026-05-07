import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const authState = { user: null as { id: string } | null, loading: false };
const rolesResult = { data: [] as { role: string }[], error: null as null | { message: string } };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(function (this: typeof builder) {
      // Make the chain thenable so `await/then` resolves with rolesResult.
      return Object.assign(this, {
        then: (resolve: (v: typeof rolesResult) => unknown) => resolve(rolesResult),
      });
    }),
  };
  return {
    supabase: {
      from: vi.fn(() => builder),
    },
  };
});

import { useUserRole } from '@/hooks/useUserRole';

describe('useUserRole', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    rolesResult.data = [];
    rolesResult.error = null;
  });

  it('returns no roles when no user is signed in', async () => {
    const { result } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.roles).toEqual([]);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isModerator).toBe(false);
  });

  it('flags isAdmin true when role rows include admin', async () => {
    authState.user = { id: 'u1' };
    rolesResult.data = [{ role: 'admin' }];
    const { result } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.roles).toContain('admin');
  });

  it('flags isModerator true when role rows include moderator', async () => {
    authState.user = { id: 'u1' };
    rolesResult.data = [{ role: 'moderator' }];
    const { result } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isModerator).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it('returns no elevated roles when query errors out', async () => {
    authState.user = { id: 'u1' };
    rolesResult.data = [];
    rolesResult.error = { message: 'forbidden' };
    const { result } = renderHook(() => useUserRole());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.roles).toEqual([]);
  });
});
