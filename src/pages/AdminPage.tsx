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
  KeyRound,
  Coins,
  Bell,
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
    activeThisMonth: number;
  };
  snapshots: {
    total: number;
    encrypted: number;
    updatedThisWeek: number;
    lastSyncAt: string | null;
  };
  keys: {
    total: number;
    withRecovery: number;
  };
  currencies: Record<string, number>;
  reminders: Record<string, number>;
  feedback: {
    total: number;
    byType: Record<string, number>;
    recent: Array<{ id: string; type: string; message: string; created_at: string }>;
  };
  subscriptions: {
    enabled: boolean;
    activeSubs: number | null;
    mrrEur: number | null;
    arrEur: number | null;
    annualSubs: number | null;
    monthlySubs: number | null;
    error?: string;
  };
}

// Percentage of a/b as a short label, e.g. "62%". Returns '—' when there's
// no denominator so an empty instance never renders NaN.
const pct = (a: number, b: number) =>
  b > 0 ? `${Math.round((a / b) * 100)}%` : '—';

interface AdminUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  roles: { role: AppRole; granted_at: string }[];
  subscriptionStatus: string | null;
  subscriptionEnd: string | null;
  cancelAtPeriodEnd: boolean;
  preferredCurrency: string | null;
  lastSnapshotAt: string | null;
  isEncrypted: boolean;
  hasRecovery: boolean;
}

// Stripe statuses that still grant Pro entitlement. Mirrors the server-side
// ENTITLED set in subscriptionCache.ts so the badge can't disagree with the
// actual gate. past_due is still entitled (grace period) but worth flagging.
const PRO_STATUSES = new Set(['active', 'trialing', 'past_due']);
const isProUser = (u: AdminUser) =>
  u.subscriptionStatus != null && PRO_STATUSES.has(u.subscriptionStatus);

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

        {/* Stats + adoption render as one cohesive block: a skeleton while the
            admin-stats call is in flight, then everything at once. Avoids the
            old "empty cards fill in piecemeal" effect. */}
        {!stats ? (
          <StatsSkeleton />
        ) : (
        <>
        {/* Stats grid */}
        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Users className="h-4 w-4 text-primary" />}
            title="Users"
            primary={stats?.users.total ?? '—'}
            details={
              stats
                ? [
                    `${stats.users.confirmed} confirmed (${pct(stats.users.confirmed, stats.users.total)})`,
                    `+${stats.users.newThisWeek} this week`,
                    `+${stats.users.newThisMonth} this month`,
                    `${stats.users.activeThisWeek} active (7d)`,
                    `${stats.users.activeThisMonth} active (30d)`,
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
                    stats.subscriptions.arrEur !== null
                      ? `~€${stats.subscriptions.arrEur.toFixed(2)} ARR`
                      : 'ARR unavailable',
                    stats.subscriptions.annualSubs !== null &&
                    stats.subscriptions.monthlySubs !== null
                      ? `${stats.subscriptions.annualSubs} annual · ${stats.subscriptions.monthlySubs} monthly`
                      : 'Plan split unavailable',
                    stats.subscriptions.activeSubs !== null
                      ? `${pct(stats.subscriptions.activeSubs, stats.users.total)} of users · ${pct(stats.subscriptions.activeSubs, stats.snapshots.total)} of activated`
                      : '',
                    stats.subscriptions.error ? `Stripe error — check secret key` : '',
                  ].filter(Boolean)
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
                    // One snapshot row per user (upsert), so total ≈ activated users.
                    `${pct(stats.snapshots.total, stats.users.total)} of users activated`,
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

        {/* Adoption & preferences. Plaintext metadata only — portfolio values
            stay encrypted and are deliberately not surfaced here. */}
        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon={<KeyRound className="h-4 w-4 text-primary" />}
            title="Recovery phrase"
            primary={pct(stats.keys.withRecovery, stats.keys.total)}
            details={[
              `${stats.keys.withRecovery} of ${stats.keys.total} keyed users`,
              `${stats.keys.total - stats.keys.withRecovery} at risk on lost password`,
            ]}
          />
          <DistributionCard
            icon={<Coins className="h-4 w-4 text-primary" />}
            title="Display currency"
            dist={stats.currencies}
            total={stats.users.total}
          />
          <DistributionCard
            icon={<Bell className="h-4 w-4 text-primary" />}
            title="Reminder cadence"
            dist={stats.reminders}
            total={stats.users.total}
          />
        </section>
        </>
        )}

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
                    <span style={{
                      borderRadius: 'var(--r-1)',
                      background: 'var(--accent-faint-raw)',
                      padding: '2px 6px',
                      fontWeight: 500,
                      color: 'var(--accent-raw)',
                    }}>
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
              <label className="q-input" style={{ width: 224 }}>
                <Search className="q-input-icon h-3.5 w-3.5" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by email…"
                />
              </label>
              <button
                type="submit"
                disabled={usersLoading}
                className="q-btn q-btn--secondary q-btn--sm"
                style={{ opacity: usersLoading ? 0.5 : 1 }}
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
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Last snapshot</th>
                  <th className="py-2 pr-4 font-medium">Recovery</th>
                  <th className="py-2 pr-4 font-medium">Joined</th>
                  <th className="py-2 pr-4 font-medium">Last seen</th>
                  <th className="py-2 pr-4 font-medium">Roles</th>
                  <th className="py-2 pr-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {usersLoading && users.length === 0 && <UserRowsSkeleton rows={6} />}
                {!usersLoading && users.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
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
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          {!u.confirmed && <span>unconfirmed</span>}
                          {u.preferredCurrency && <span>{u.preferredCurrency}</span>}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <PlanCell user={u} />
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {u.lastSnapshotAt ? (
                          <span title={fmtDate(u.lastSnapshotAt)}>
                            {fmtRelative(u.lastSnapshotAt)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--negative)' }}>no data</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <RecoveryCell user={u} />
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
                                style={{
                                  borderRadius: 'var(--r-1)',
                                  background: 'var(--accent-faint-raw)',
                                  padding: '2px 6px',
                                  fontSize: 'var(--text-xs)',
                                  fontWeight: 500,
                                  color: 'var(--accent-raw)',
                                }}
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
                              className="q-btn q-btn--secondary q-btn--sm"
                            >
                              <ShieldOff className="h-3.5 w-3.5" />
                              Revoke admin
                            </button>
                          ) : (
                            <button
                              disabled={mutating === `${u.id}:admin:grant`}
                              onClick={() => mutateRole(u.id, 'admin', 'grant')}
                              className="q-btn q-btn--primary q-btn--sm"
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
                            className="q-icon-btn"
                            style={{
                              border: '1px solid color-mix(in oklch, var(--negative) 30%, transparent)',
                              background: 'color-mix(in oklch, var(--negative) 5%, transparent)',
                              color: 'var(--negative)',
                              opacity: isSelf ? 0.3 : 1,
                            }}
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

interface DistributionCardProps {
  icon: React.ReactNode;
  title: string;
  dist: Record<string, number>;
  /** Denominator for the share column (typically total users). */
  total: number;
}

function DistributionCard({ icon, title, dist, total }: DistributionCardProps) {
  const rows = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(([label, count]) => (
            <li key={label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">{label}</span>
              <span className="tabular-nums text-muted-foreground">
                {count} · {pct(count, total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const badgeBase: React.CSSProperties = {
  borderRadius: 'var(--r-1)',
  padding: '2px 6px',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

// Plan status from the cached subscription columns on profiles. Pro entitlement
// mirrors the server gate; past_due and pending-cancel are surfaced because
// they're the states a paying user is most likely to email about.
function PlanCell({ user }: { user: AdminUser }) {
  if (!isProUser(user)) {
    return <span className="text-xs text-muted-foreground">Free</span>;
  }
  const pastDue = user.subscriptionStatus === 'past_due';
  return (
    <div className="flex flex-col gap-0.5">
      <span
        style={{
          ...badgeBase,
          background: 'var(--accent-faint-raw)',
          color: 'var(--accent-raw)',
        }}
      >
        Pro
      </span>
      {pastDue && (
        <span className="text-xs" style={{ color: 'var(--negative)' }}>
          past due
        </span>
      )}
      {user.cancelAtPeriodEnd && user.subscriptionEnd && (
        <span className="text-xs text-muted-foreground">
          ends {fmtDate(user.subscriptionEnd)}
        </span>
      )}
    </div>
  );
}

// Recovery phrase presence. The "at risk" state (encrypted, no recovery) is the
// one support needs to spot fast: a forgotten password there is unrecoverable.
function RecoveryCell({ user }: { user: AdminUser }) {
  if (!user.isEncrypted) {
    return (
      <span className="text-xs text-muted-foreground" title="No encryption keys yet">
        —
      </span>
    );
  }
  if (user.hasRecovery) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs"
        style={{ color: 'var(--accent-raw)' }}
        title="Recovery phrase set up"
      >
        <KeyRound className="h-3.5 w-3.5" />
        set
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      style={{ color: 'var(--negative)' }}
      title="No recovery phrase — a forgotten password means permanent data loss"
    >
      <ShieldOff className="h-3.5 w-3.5" />
      at risk
    </span>
  );
}

// Shimmer placeholders so the stats region appears as one structured block
// while admin-stats is in flight, instead of empty cards filling in piecemeal.
function StatsSkeleton() {
  const bar = (w: string) => (
    <span className="q-skeleton" style={{ height: 12, width: w, borderRadius: 'var(--r-1)' }} />
  );
  const card = (key: number, lines: number) => (
    <div key={key} className="rounded-xl border border-border bg-card/50 p-5">
      <div className="mb-3">{bar('40%')}</div>
      <div className="mb-3">
        <span className="q-skeleton" style={{ height: 24, width: '50%', borderRadius: 'var(--r-1)' }} />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i}>{bar(`${70 - i * 10}%`)}</div>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => card(i, 4))}
      </section>
      <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => card(i, 3))}
      </section>
    </>
  );
}

function UserRowsSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 8 }).map((_, c) => (
            <td key={c} className="py-3 pr-4">
              <span
                className="q-skeleton"
                style={{ height: 12, width: c === 0 ? '80%' : '50%', borderRadius: 'var(--r-1)' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
