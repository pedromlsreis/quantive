import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, User, Pencil, Check, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
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

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDisplayName(data.display_name);
      });
  }, [user]);

  const { clearData } = usePortfolio();

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
    } catch {
      toast.error('Failed to delete account. Please try again.');
      setDeleting(false);
    }
  };

  if (!user) return null;

  const label = displayName || user.email || 'User';

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Display name"
            className="w-28 rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 sm:w-36"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <button
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="rounded-md p-1 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            title="Save"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(displayName || ''); setEditing(true); }}
          className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          title="Edit display name"
        >
          <User className="h-3.5 w-3.5" />
          <span className="hidden max-w-[120px] truncate sm:inline">{label}</span>
          <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      )}
      <button
        onClick={() => setDeleteOpen(true)}
        className="flex items-center justify-center rounded-lg p-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
        title="Delete account & data"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <button
        onClick={() => {
          clearData();
          signOut();
        }}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>

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
