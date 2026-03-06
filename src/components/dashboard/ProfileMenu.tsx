import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, User, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

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
        onClick={signOut}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  );
}
