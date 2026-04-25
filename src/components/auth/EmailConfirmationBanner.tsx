import { Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function EmailConfirmationBanner() {
  const { user } = useAuth();

  if (!user || user.email_confirmed_at) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 backdrop-blur-sm">
      <Mail className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      <span className="text-xs font-medium tracking-wide text-amber-300">
        Confirm your email to enable cloud sync
      </span>
    </div>
  );
}
