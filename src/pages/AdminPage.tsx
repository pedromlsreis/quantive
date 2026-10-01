import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useFormat } from '@/hooks/useFormat';
import { formatDate, money } from '@/lib/formatters';
import { sentenceCase } from '@/lib/utils';
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
  /** Absent until admin-stats is redeployed with the Family counts. */
  family?: {
    betaUsers: number;
    /** Absent until admin-stats is redeployed with the Family plan. */
    subscribers?: number;
    portfolios: number;
    sharedPortfolios: number;
    partners: number;
    pendingInvites: number;
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
    /** Absent until admin-stats is redeployed with the Family plan. */
    byPlan?: Record<'pro' | 'family', { subs: number; mrrEur: number }> | null;
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
  /** 'pro' or 'family'; absent until admin-users is redeployed. */
  subscriptionPlan?: string | null;
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

const fmtDate = (iso: string | null) => (iso ? formatDate(new Date(iso)) : '—');

// Minute precision matters here (last sync, report age), unlike ago()'s days.
const fmtRelative = (iso: string | null) => {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(hr / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
};

export default function AdminPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const f = useFormat();

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
      toast.error(e instanceof Error ? e.message : "Couldn't load the stats. Try again.");
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
      toast.error(e instanceof Error ? e.message : "Couldn't load users. Try again.");
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
      toast.success(`${target.email ?? target.id} deleted`);
      setPendingDelete(null);
      await loadUsers(search);
      await loadStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the user. Try again.");
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
      toast.success(`${sentenceCase(role)} ${action === 'grant' ? 'granted' : 'revoked'}`);
      await loadUsers(search);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Couldn't ${action} the role. Try again.`);
    } finally {
      setMutating(null);
    }
  };

  if (authLoading || roleLoading || !isAdmin) {
    return <p className="q-page-lede" role="status">Checking access…</p>;
  }

  const eur = (v: number) => money(v, { currency: 'EUR', locale: f.ctx.locale });

  return (
    <div>
      <header className="q-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <div>
          <h1 className="q-h1" tabIndex={-1}>Admin</h1>
          <p className="q-page-meta">
            {stats ? `Generated ${fmtRelative(stats.generatedAt)}. Counts only: entries stay encrypted and are never shown here.` : 'Counts and user management.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { loadStats(); loadUsers(search); }}
          disabled={statsLoading}
          className="q-btn q-btn--secondary q-btn--md"
        >
          {statsLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {/* Stats and adoption appear together once admin-stats answers, never piecemeal. */}
      {!stats ? (
        <StatsSkeleton />
      ) : (
        <>
          <section className="q-sec" aria-labelledby="admin-overview-title" style={{ marginTop: 0 }}>
            <div className="q-sec-head"><h2 className="q-h2" id="admin-overview-title">Overview</h2></div>
            <dl className="q-stats">
              <Stat
                label="Users"
                value={stats.users.total}
                detail={`${stats.users.confirmed} confirmed (${pct(stats.users.confirmed, stats.users.total)}). +${stats.users.newThisWeek} this week, +${stats.users.newThisMonth} this month. ${stats.users.activeThisWeek} active in 7 days, ${stats.users.activeThisMonth} in 30.`}
              />
              <Stat
                label="Subscriptions"
                value={stats.subscriptions.enabled ? stats.subscriptions.activeSubs ?? '—' : 'Off'}
                detail={
                  !stats.subscriptions.enabled
                    ? 'STRIPE_SECRET_KEY is not set.'
                    : stats.subscriptions.error
                      ? 'Stripe returned an error: check the secret key.'
                      : [
                          stats.subscriptions.mrrEur !== null ? `${eur(stats.subscriptions.mrrEur)} MRR, ${eur(stats.subscriptions.arrEur ?? 0)} ARR.` : 'Revenue unavailable.',
                          stats.subscriptions.annualSubs !== null && stats.subscriptions.monthlySubs !== null
                            ? `${stats.subscriptions.annualSubs} annual, ${stats.subscriptions.monthlySubs} monthly.`
                            : '',
                          stats.subscriptions.byPlan
                            ? `Pro ${stats.subscriptions.byPlan.pro.subs} (${eur(stats.subscriptions.byPlan.pro.mrrEur)} MRR), Family ${stats.subscriptions.byPlan.family.subs} (${eur(stats.subscriptions.byPlan.family.mrrEur)} MRR).`
                            : '',
                          stats.subscriptions.activeSubs !== null
                            ? `${pct(stats.subscriptions.activeSubs, stats.users.total)} of users, ${pct(stats.subscriptions.activeSubs, stats.snapshots.total)} of those with data.`
                            : '',
                        ].filter(Boolean).join(' ')
                }
              />
              <Stat
                label="Users with data"
                value={stats.snapshots.total}
                // One upserted row per user: the per-date entries live inside
                // the ciphertext, so the server can count users, not entries.
                detail={`${pct(stats.snapshots.total, stats.users.total)} of users. ${stats.snapshots.encrypted} encrypted, ${stats.snapshots.updatedThisWeek} updated this week. Last sync ${fmtRelative(stats.snapshots.lastSyncAt)}.`}
              />
              <Stat
                label="Feedback"
                value={stats.feedback.total}
                detail={Object.entries(stats.feedback.byType).map(([k, v]) => `${v} ${k}`).join(', ') || 'None yet.'}
              />
              {stats.family && (
                <Stat
                  label="Family"
                  value={stats.family.subscribers ?? stats.family.betaUsers}
                  detail={`${stats.family.subscribers !== undefined ? `${stats.family.subscribers} paying, ` : ''}${stats.family.betaUsers} in the beta. ${stats.family.portfolios} extra ${stats.family.portfolios === 1 ? 'portfolio' : 'portfolios'}, ${stats.family.sharedPortfolios} shared, ${stats.family.partners} ${stats.family.partners === 1 ? 'partner' : 'partners'}, ${stats.family.pendingInvites} pending ${stats.family.pendingInvites === 1 ? 'invite' : 'invites'}.`}
                />
              )}
            </dl>
          </section>

          <section className="q-sec" aria-labelledby="admin-adoption-title">
            <div className="q-sec-head">
              <div>
                <h2 className="q-h2" id="admin-adoption-title">Adoption</h2>
                <div className="q-sec-sub">Plaintext settings only.</div>
              </div>
            </div>
            <div className="q-admin-cols">
              <div>
                <h3 className="q-admin-h3">Recovery code</h3>
                <p className="q-admin-big num">{pct(stats.keys.withRecovery, stats.keys.total)}</p>
                <p className="q-admin-note">
                  {`${stats.keys.withRecovery} of ${stats.keys.total} users with keys. ${stats.keys.total - stats.keys.withRecovery} would lose their data with a forgotten password.`}
                </p>
              </div>
              <Distribution title="Display currency" dist={stats.currencies} total={stats.users.total} />
              <Distribution title="Reminder cadence" dist={stats.reminders} total={stats.users.total} format={sentenceCase} />
            </div>
          </section>
        </>
      )}

      {stats && stats.feedback.recent.length > 0 && (
        <section className="q-sec" aria-labelledby="admin-feedback-title">
          <div className="q-sec-head"><h2 className="q-h2" id="admin-feedback-title">Recent feedback</h2></div>
          <ul className="q-admin-feedback">
            {stats.feedback.recent.map((fb) => (
              <li key={fb.id}>
                <div className="q-admin-feedback-head">
                  <span className="q-tag">{sentenceCase(fb.type)}</span>
                  <time dateTime={fb.created_at}>{fmtDate(fb.created_at)}</time>
                </div>
                <p>{fb.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="q-sec" aria-labelledby="admin-users-title">
        <div className="q-sec-head">
          <div>
            <h2 className="q-h2" id="admin-users-title">Users and roles</h2>
            <div className="q-sec-sub">Grant or revoke admin access. The last admin can't be removed.</div>
          </div>
        </div>
        <form
          className="q-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            loadUsers(search);
          }}
        >
          <label className="q-input q-toolbar-search">
            <span className="q-input-icon"><Search size={14} strokeWidth={1.75} aria-hidden="true" /></span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email"
              aria-label="Search users by email"
            />
          </label>
          <button type="submit" disabled={usersLoading} className="q-btn q-btn--secondary q-btn--md">
            {usersLoading ? 'Searching…' : 'Search'}
          </button>
        </form>

        <div className="q-table-scroll">
          <table className="q-table q-table--responsive">
            <caption className="sr-only">Users with their plan, last sync, recovery code and roles</caption>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Plan</th>
                <th scope="col" data-col="secondary">Last sync</th>
                <th scope="col" data-col="secondary">Recovery</th>
                <th scope="col" data-col="secondary">Joined</th>
                <th scope="col" data-col="secondary">Last seen</th>
                <th scope="col" data-col="secondary">Roles</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && users.length === 0 && <UserRowsSkeleton rows={6} />}
              {!usersLoading && users.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 'var(--s-8) 0', color: 'var(--fg-subtle)' }}>
                    {search ? `No users match "${search}"` : 'No users yet'}
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const userIsAdmin = u.roles.some((r) => r.role === 'admin');
                const isSelf = u.id === user?.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <span style={{ color: 'var(--fg)', overflowWrap: 'anywhere' }}>{u.email ?? '—'}</span>
                      {(!u.confirmed || u.preferredCurrency) && (
                        <span className="q-table-sub">
                          {[!u.confirmed && 'Unconfirmed', u.preferredCurrency].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </td>
                    <td><PlanCell user={u} /></td>
                    <td data-col="secondary" style={{ color: 'var(--fg-muted)' }}>
                      {u.lastSnapshotAt
                        ? <time dateTime={u.lastSnapshotAt} title={fmtDate(u.lastSnapshotAt)}>{fmtRelative(u.lastSnapshotAt)}</time>
                        : <span style={{ color: 'var(--fg-subtle)' }}>No data</span>}
                    </td>
                    <td data-col="secondary"><RecoveryCell user={u} /></td>
                    <td data-col="secondary" style={{ color: 'var(--fg-muted)' }}>{fmtDate(u.created_at)}</td>
                    <td data-col="secondary" style={{ color: 'var(--fg-muted)' }}>{fmtRelative(u.last_sign_in_at)}</td>
                    <td data-col="secondary">
                      {u.roles.length === 0
                        ? <span style={{ color: 'var(--fg-subtle)' }}>User</span>
                        : <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{u.roles.map((r) => <span key={r.role} className="q-tag">{sentenceCase(r.role)}</span>)}</span>}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                        {userIsAdmin ? (
                          <button
                            type="button"
                            disabled={isSelf || mutating === `${u.id}:admin:revoke`}
                            onClick={() => mutateRole(u.id, 'admin', 'revoke')}
                            title={isSelf ? "You can't revoke your own admin role." : undefined}
                            className="q-btn q-btn--ghost q-btn--sm"
                          >
                            Revoke admin
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={mutating === `${u.id}:admin:grant`}
                            onClick={() => mutateRole(u.id, 'admin', 'grant')}
                            className="q-btn q-btn--secondary q-btn--sm"
                          >
                            Make admin
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => setPendingDelete(u)}
                          title={isSelf ? "You can't delete your own account from here." : undefined}
                          aria-label={`Delete ${u.email ?? u.id}`}
                          className="q-icon-btn q-icon-btn--danger"
                        >
                          <Trash2 size={16} strokeWidth={1.75} />
                        </button>
                      </span>
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
              {`Deletes ${pendingDelete?.email ?? pendingDelete?.id ?? ''} with their encrypted entries, keys, profile, roles and feedback. This can't be undone.`}
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
              className="q-btn--destructive"
            >
              {deleting ? 'Deleting…' : 'Delete user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="q-stat">
      <dt className="q-stat-label">{label}</dt>
      <dd className="q-stat-value">{value}</dd>
      <dd className="q-stat-detail">{detail}</dd>
    </div>
  );
}

function Distribution({ title, dist, total, format = (k: string) => k }: { title: string; dist: Record<string, number>; total: number; format?: (key: string) => string }) {
  const rows = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <h3 className="q-admin-h3">{title}</h3>
      {rows.length === 0 ? (
        <p className="q-admin-note">No data yet.</p>
      ) : (
        <ul className="q-admin-list">
          {rows.map(([label, count]) => (
            <li key={label}>
              <span>{format(label)}</span>
              <span className="num">{`${count}, ${pct(count, total)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Plan status from the cached subscription columns on profiles. Entitlement
// mirrors the server gate; past_due and pending-cancel are surfaced because
// they're the states a paying user is most likely to email about. A partner
// covered by someone's Family plan shows as Free here: the badge is about
// who pays.
function PlanCell({ user }: { user: AdminUser }) {
  if (!isProUser(user)) return <span style={{ color: 'var(--fg-subtle)' }}>Free</span>;
  return (
    <span>
      <span className="q-tag">{user.subscriptionPlan === 'family' ? 'Family' : 'Pro'}</span>
      {user.subscriptionStatus === 'past_due' && <span className="q-table-sub" style={{ color: 'var(--negative)' }}>Past due</span>}
      {user.cancelAtPeriodEnd && user.subscriptionEnd && <span className="q-table-sub">{`Ends ${fmtDate(user.subscriptionEnd)}`}</span>}
    </span>
  );
}

// The "at risk" state (encrypted, no recovery code) is the one support needs to
// spot fast: a forgotten password there loses the data for good.
function RecoveryCell({ user }: { user: AdminUser }) {
  if (!user.isEncrypted) return <span style={{ color: 'var(--fg-subtle)' }} title="No encryption keys yet">—</span>;
  if (user.hasRecovery) return <span style={{ color: 'var(--fg-muted)' }}>Saved</span>;
  return <span style={{ color: 'var(--negative)' }} title="No recovery code: a forgotten password loses the data">At risk</span>;
}

// Static blocks in the final shapes while admin-stats is in flight.
function StatsSkeleton() {
  return (
    <section className="q-sec" aria-hidden="true" style={{ marginTop: 0 }}>
      <span className="q-skeleton" style={{ display: 'block', width: 120, height: 17 }} />
      <div className="q-stats" style={{ marginTop: 'var(--s-4)' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="q-stat">
            <span className="q-skeleton" style={{ display: 'block', width: '50%', height: 13 }} />
            <span className="q-skeleton" style={{ display: 'block', width: '40%', height: 28, marginTop: 8 }} />
            <span className="q-skeleton" style={{ display: 'block', width: '80%', height: 12, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function UserRowsSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: 8 }).map((_, c) => (
            <td key={c} data-col={c >= 2 && c <= 6 ? 'secondary' : undefined}>
              <span className="q-skeleton" style={{ display: 'block', height: 12, width: c === 0 ? '80%' : '50%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
