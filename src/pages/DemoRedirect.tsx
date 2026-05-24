import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { analytics } from '@/lib/analytics';

export default function DemoRedirect() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { loadMockData } = usePortfolio();

  useEffect(() => {
    // Wait for auth to resolve so we don't flash mock data over a logged-in
    // user's real portfolio before we know who they are.
    if (loading) return;
    if (user) {
      // Logged-in users should not get the mock-data flash. Send them to
      // their own dashboard with a brief note so the click isn't silent.
      toast.message("You're signed in — demo skipped.", {
        description: 'Sign out to try the demo mode.',
      });
      navigate('/dashboard', { replace: true });
      return;
    }
    loadMockData();
    analytics.demoLoaded({ source: 'route' });
    navigate('/dashboard', { replace: true });
  }, [loading, user, loadMockData, navigate]);

  return null;
}
