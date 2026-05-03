import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { supabase } from '@/integrations/supabase/client';
import { Footer } from '@/components/Footer';
import { StickyNav } from '@/components/landing/StickyNav';
import { RecoveryCodeDisplay } from '@/components/auth/RecoveryCodeDisplay';
import {
  Pencil,
  Check,
  X,
  Trash2,
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
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

export default function SettingsPage() {
  const { user, signOut, updatePassword } = useAuth();
  const keySession = useKeySession();
  const { clearData } = usePortfolio();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Recovery code setup/rotate flow state.
  const [showRecoveryCode, setShowRecoveryCode] = useState<string | null>(null);
  const [provisioningRecovery, setProvisioningRecovery] = useState(false);

  // Change-password flow state.
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDisplayName(data.display_name);
      });
  }, [user, navigate]);

  const handleSave = async () => {
    if (!user || !draft.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: draft.trim() })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Failed to update display name.');
    } else {
      setDisplayName(draft.trim());
      setEditing(false);
      toast.success('Display name updated!');
    }
  };

  const handleSetUpRecovery = async () => {
    if (!user) return;
    if (keySession.status !== 'unlocked-encrypted') {
      toast.error('Unlock your data first.');
      return;
    }
    setProvisioningRecovery(true);
    try {
      const { recoveryCode } = await keySession.setupRecovery(user.id);
      setShowRecoveryCode(recoveryCode);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to set up recovery code.',
      );
    } finally {
      setProvisioningRecovery(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (newPassword !== newPasswordConfirm) {
      toast.error('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (keySession.status !== 'unlocked-encrypted') {
      toast.error('Unlock your data first.');
      return;
    }
    setSubmittingPassword(true);
    try {
      // Auth first: if this fails, nothing has changed and the user retries.
      const { error: authErr } = await updatePassword(newPassword);
      if (authErr) {
        toast.error(authErr);
        return;
      }
      // Wrap second: rotate the at-rest wrap so the new password unlocks
      // the same DK on next sign-in.
      const { error: rewrapErr } = await keySession.rewrapForNewPassword(
        user.id,
        newPassword,
      );
      if (rewrapErr) {
        // Auth has rotated but the wrap hasn't. The user's data is now
        // accessible only via the recovery code (or a successful retry).
        // Tell them clearly.
        toast.error(
          'Password updated, but the encryption wrap could not be rotated. Please retry, or use your recovery code on next sign-in.',
        );
        return;
      }
      toast.success('Password changed.');
      setChangingPassword(false);
      setNewPassword('');
      setNewPasswordConfirm('');
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account');
      if (error || !data?.success) {
        toast.error('Failed to delete account. Please try again.');
        setDeleting(false);
        return;
      }
      clearData();
      await signOut();
      toast.success('Your account and all data have been permanently deleted.');
      navigate('/');
    } catch {
      toast.error('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StickyNav />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-20">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </button>

        <h1 className="mb-8 text-2xl font-bold text-foreground">Settings</h1>

        {/* Profile section */}
        <section className="mb-10 rounded-xl border border-border bg-card/50 p-6">
          <h2 className="mb-4 text-base font-semibold text-foreground">Profile</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <p className="text-sm text-foreground">{user.email}</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Display name</label>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Enter display name"
                    className="w-full max-w-xs rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSave();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving || !draft.trim()}
                    className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground">{displayName || '—'}</p>
                  <button
                    onClick={() => { setDraft(displayName || ''); setEditing(true); }}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    title="Edit display name"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="mb-10 rounded-xl border border-border bg-card/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Security</h2>
          </div>

          <div className="space-y-5">
            {/* Encryption status */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                End-to-end encryption
              </label>
              {keySession.status === 'unlocked-encrypted' ? (
                <p className="text-sm text-foreground">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    Enabled
                  </span>{' '}
                  XChaCha20-Poly1305 + Argon2id.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Locked — sign out and sign in to manage encryption settings.
                </p>
              )}
            </div>

            {/* Recovery code */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Recovery code
              </label>
              {keySession.hasRecovery === true ? (
                <div>
                  <p className="mb-2 text-sm text-foreground">
                    Configured. Generate a new one to invalidate the old.
                  </p>
                  <button
                    onClick={handleSetUpRecovery}
                    disabled={
                      provisioningRecovery ||
                      keySession.status !== 'unlocked-encrypted'
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {provisioningRecovery ? 'Generating…' : 'Rotate recovery code'}
                  </button>
                </div>
              ) : keySession.hasRecovery === false ? (
                <div>
                  <p className="mb-2 text-sm text-foreground">
                    Not configured. Without one, a forgotten password means
                    permanent loss of your encrypted data.
                  </p>
                  <button
                    onClick={handleSetUpRecovery}
                    disabled={
                      provisioningRecovery ||
                      keySession.status !== 'unlocked-encrypted'
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {provisioningRecovery ? 'Generating…' : 'Set up recovery code'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
            </div>

            {/* Change password */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Change password
              </label>
              {!changingPassword ? (
                <button
                  onClick={() => setChangingPassword(true)}
                  disabled={keySession.status !== 'unlocked-encrypted'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  Change password
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password"
                    minLength={6}
                    required
                    autoFocus
                    className="w-full max-w-xs rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                  <input
                    type="password"
                    value={newPasswordConfirm}
                    onChange={e => setNewPasswordConfirm(e.target.value)}
                    placeholder="Confirm new password"
                    minLength={6}
                    required
                    className="w-full max-w-xs rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={submittingPassword}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {submittingPassword ? 'Changing…' : 'Change password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChangingPassword(false);
                        setNewPassword('');
                        setNewPasswordConfirm('');
                      }}
                      className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="mb-2 text-base font-semibold text-destructive">Danger Zone</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90"
          >
            <Trash2 className="h-4 w-4" />
            Delete my account
          </button>
        </section>
      </main>

      <Footer />

      {/* Recovery code display (shown after Set up / Rotate). */}
      {showRecoveryCode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
            <h2 className="mb-1 text-lg font-bold text-foreground">
              Your recovery code
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Save these 24 words somewhere safe. Anyone with these words can
              unlock your data — we won't show them again.
            </p>
            <RecoveryCodeDisplay
              code={showRecoveryCode}
              onConfirmed={() => setShowRecoveryCode(null)}
              onSkipConfirm={() => setShowRecoveryCode(null)}
            />
          </div>
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete your account and all associated data including
              portfolio snapshots, profile, and feedback. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Yes, delete everything'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
