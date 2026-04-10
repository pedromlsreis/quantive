import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { supabase } from '@/integrations/supabase/client';
import { Footer } from '@/components/Footer';
import { StickyNav } from '@/components/landing/StickyNav';
import { Pencil, Check, X, Trash2, User, ArrowLeft } from 'lucide-react';
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
  const { user, signOut } = useAuth();
  const { clearData } = usePortfolio();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
