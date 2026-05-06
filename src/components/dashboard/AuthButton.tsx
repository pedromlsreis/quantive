import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { User, Settings } from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';
import { AuthModal } from '@/components/auth/AuthModal';

export function AuthButton() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (loading) return null;
  if (user) return <ProfileMenu />;

  return (
    <>
      <button
        onClick={() => navigate('/settings')}
        className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/20"
      >
        <User className="h-4 w-4" />
        <span className="hidden sm:inline">Sign in</span>
      </button>

      <AuthModal open={open} onClose={() => setOpen(false)} defaultMode="signin" />
    </>
  );
}
