import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Database as DatabaseIcon,
  CreditCard,
  MessageSquare,
  Shield,
  ShieldOff,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AdminStats {
  generatedAt: string;
  users: {
    total: number;
    confirmed: number;
    newThisWeek: number;
    newThisMonth: number;
    activeThisWeek: number;
  };
  snapshots: {
    total: number;
    encrypted: number;
    updatedThisWeek: number;
    lastSyncAt: string | null;
  };
  feedback: {
    total: number;
    byType: Record<string, number>;
    recent: Array<{ id: string; type: string; message: string; created_at: string }>;
  };
  subscriptions: {
    enabled: boolean;
    activeSubs: number | null;
    mrrEur: number | null;
    error?: string;
  };
}

interface AdminUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  roles: { role: AppRole; granted_at: string }[];
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const fmtRelative = (iso: string | null) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
};

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [mutating, setMutating] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Gate. Wait for auth + role to resolve before redirecting; otherwise we
  // bounce admins out on first paint.
  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate('/');
      return;
    }
    if (!isAdmin) {
      navigate('/dashboard');
    }
  }, [authLoading, roleLoading, user, isAdmin, navigate]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-stats');
      if (error) throw error;
      setStats(data as AdminStats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load stats.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async (q?: string) => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const { data, error } = await supabase.functions.invoke(
        `admin-users${params.toString() ? `?${params}` : ''}`,
        { method: 'GET' },
      );
      if (error) throw error;
      setUsers((data as { users: AdminUser[] }).users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadStats();
    loadUsers();
  }, [isAdmin, loadStats, loadUsers]);

  const deleteUser = async (target: AdminUser) => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        method: 'POST',
        body: { action: 'delete', userId: target.id },
      });
      if (error) throw error;
      const payload = data as { ok?: boolean; error?: string };
      if (payload?.error) throw new Error(payload.error);
      toast.success(`Deleted ${target.email ?? target.id}.`);
      setPendingDelete(null);
      await loadUsers(search);
      await loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete user.');
    } finally {
      setDeleting(false);
    }
  };

  const mutateRole = async (
    userId: string,
    role: AppRole,
    action: 'grant' | 'revoke',
  ) => {
    setMutating(`${userId}:${role}:${action}`);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        method: 'POST',
        body: { action, userId, role },
      });
      if (error) throw error;
      const payload = data as { ok?: boolean; error?: string };
      if (payload?.error) throw new Error(payload.error);
      toast.success(`${action === 'grant' ? 'Granted' : 'Revoked'} ${role}.`);
      await loadUsers(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Failed to ${action} role.`);
    } finally {
      setMutating(null);
    }
  };

  if (authLoading || roleLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Admin</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats ? `Generated ${fmtRelative(stats.generatedAt)}` : 'Aggregate stats and user management.'}
            </p>
          </div>
          <button
            onClick={() => {
              loadStats();
              loadUsers(search);
            }}
            disabled={statsLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats grid */}
        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Users className="h-4 w-4 text-primary" />}
            title="Users"
            primary={stats?.users.total ?? '—'}
            details={
              stats
                ? [
                    `${stats.users.confirmed} confirmed`,
                    `+${stats.users.newThisWeek} this week`,
                    `+${stats.users.newThisMonth} this month`,
                    `${stats.users.activeThisWeek} active (7d)`,
                  ]
                : []
            }
          />
          <StatCard
            icon={<CreditCard className="h-4 w-4 text-primary" />}
            title="Subscriptions"
            primary={
              stats?.subscriptions.enabled
                ? stats.subscriptions.activeSubs ?? '—'
                : 'Disabled'
            }
            details={
              stats?.subscriptions.enabled
                ? [
                    stats.subscriptions.mrrEur !== null
                      ? `~€${stats.subscriptions.mrrEur.toFixed(2)} MRR`
                      : 'MRR unavailable',
                    stats.subscriptions.error ? `Stripe error — check secret key` : 'Active subscribers',
                  ]
                : ['STRIPE_SECRET_KEY not set']
            }
          />
          <StatCard
            icon={<DatabaseIcon className="h-4 w-4 text-primary" />}
            title="Snapshots"
            primary={stats?.snapshots.total ?? '—'}
            details={
              stats
                ? [
                    `${stats.snapshots.encrypted} encrypted (v1)`,
                    `${stats.snapshots.updatedThisWeek} updated this week`,
                    `Last sync ${fmtRelative(stats.snapshots.lastSyncAt)}`,
                  ]
                : []
            }
          />
          <StatCard
            icon={<MessageSquare className="h-4 w-4 text-primary" />}
            title="Feedback"
            primary={stats?.feedback.total ?? '—'}
            details={
              stats
                ? Object.entries(stats.feedback.byType).map(
                    ([k, v]) => `${v} ${k}`,
                  )
                : []
            }
          />
        </section>

        {/* Recent feedback */}
        {stats && stats.feedback.recent.length > 0 && (
          <section className="mb-10 rounded-xl border border-border bg-card/50 p-6">
            <h2 className="mb-4 text-base font-semibold text-foreground">
              Recent feedback
            </h2>
            <div className="space-y-3">
              {stats.feedback.recent.map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-border/50 bg-background/40 p-3"
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                      {f.type}
                    </span>
                    <span className="text-muted-foreground">{fmtDate(f.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{f.message}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* User management */}
        <section className="rounded-xl border border-border bg-card/50 p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Users & roles</h2>
              <p className="text-xs text-muted-foreground">
                Grant or revoke admin access. The last admin cannot be removed.
              </p>
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                loadUsers(search);
              }}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by email…"
                  className="w-56 rounded-lg border border-border bg-secondary/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={usersLoading}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                Search
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Email</th>
                  <th className="py-2 pr-4 font-medium">Joined</th>
                  <th className="py-2 pr-4 font-medium">Last seen</th>
                  <th className="py-2 pr-4 font-medium">Roles</th>
                  <th className="py-2 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {usersLoading && users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                )}
                {!usersLoading && users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
                {users.map((u) => {
                  const userIsAdmin = u.roles.some((r) => r.role === 'admin');
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id}>
                      <td className="py-3 pr-4">
                        <div className="text-foreground">{u.email ?? '—'}</div>
                        {!u.confirmed && (
                          <div className="text-xs text-muted-foreground">unconfirmed</div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {fmtDate(u.created_at)}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {fmtRelative(u.last_sign_in_at)}
                      </td>
                      <td className="py-3 pr-4">
                        {u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">user</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => (
                              <span
                                key={r.role}
                                className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
                              >
                                {r.role}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-0 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {userIsAdmin ? (
                            <button
                              disabled={isSelf || mutating === `${u.id}:admin:revoke`}
                              onClick={() => mutateRole(u.id, 'admin', 'revoke')}
                              title={isSelf ? 'You cannot revoke your own admin role.' : 'Revoke admin'}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                              Revoke admin
                            </button>
                          ) : (
                            <button
                              disabled={mutating === `${u.id}:admin:grant`}
                              onClick={() => mutateRole(u.id, 'admin', 'grant')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                            >
                              <Shield className="h-3.5 w-3.5" />
                              Make admin
                            </button>
                          )}
                          <button
                            disabled={isSelf}
                            onClick={() => setPendingDelete(u)}
                            title={isSelf ? 'You cannot delete your own account from here.' : 'Delete user'}
                            aria-label={`Delete ${u.email ?? u.id}`}
                            className="inline-flex items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-1.5 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{' '}
              <span className="font-medium text-foreground">
                {pendingDelete?.email ?? pendingDelete?.id}
              </span>{' '}
              along with their portfolio snapshots, encryption keys, profile, roles,
              and feedback rows. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteUser(pendingDelete);
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Yes, delete this user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  primary: string | number;
  details: string[];
}

function StatCard({ icon, title, primary, details }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="mb-2 text-2xl font-bold text-foreground">{primary}</div>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {details.map((d, i) => (
          <li key={i} className="break-all">{d}</li>
        ))}
      </ul>
    </div>
  );
}
