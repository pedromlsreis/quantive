import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, User, Settings } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { clearData } = usePortfolio();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string | null>(null);

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

  if (!user) return null;

  const label = displayName || user.email || 'User';

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <User className="h-3.5 w-3.5" />
        <span className="hidden max-w-[120px] truncate sm:inline">{label}</span>
      </span>
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center justify-center rounded-lg p-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
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
    </div>
  );
}
