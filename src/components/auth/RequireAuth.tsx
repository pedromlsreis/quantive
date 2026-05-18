/**
 * Route guard for pages that should never render for an unauthed user.
 * /settings and /admin both expose account-bound surfaces; without this
 * a logged-out visitor on the same browser can land on them via direct URL
 * and read stale fragments of UI before any data fetch resolves.
 *
 * Intentionally narrow: /dashboard et al. stay guest-accessible because
 * they double as the file-upload / demo entry point. See
 * docs/logout-data-leak-remediation.md phase 2.3.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
