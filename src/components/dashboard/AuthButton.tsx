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
        className="q-icon-btn"
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
      <button
        onClick={() => setOpen(true)}
        className="q-btn q-btn--secondary q-btn--md"
      >
        <User className="h-4 w-4" />
        <span className="hidden sm:inline">Sign in</span>
      </button>

      <AuthModal open={open} onClose={() => setOpen(false)} defaultMode="signin" />
    </>
  );
}
