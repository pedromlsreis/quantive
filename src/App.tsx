import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { analytics } from "@/lib/analytics";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConsentBanner } from "@/components/ConsentBanner";
import { PortfolioProvider } from "@/contexts/PortfolioContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { KeySessionProvider } from "@/contexts/KeySessionContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { EmailConfirmationBanner } from "@/components/auth/EmailConfirmationBanner";
import { RequireUnlock } from "@/components/auth/RequireUnlock";
import { RecoveryOfferModal } from "@/components/auth/RecoveryOfferModal";
import { QueryCacheGuard } from "@/components/auth/QueryCacheGuard";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Index = lazy(() => import("./pages/Index"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const DemoRedirect = lazy(() => import("./pages/DemoRedirect"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const PerformancePage = lazy(() => import("./pages/PerformancePage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const AllocationsPage = lazy(() => import("./pages/AllocationsPage"));
const SourcesPage = lazy(() => import("./pages/SourcesPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const Impressum = lazy(() => import("./pages/Impressum"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    analytics.pageViewed(pathname);
  }, [pathname]);
  return null;
}

const LoadingSpinner = () => (
  <div className="flex flex-1 items-center justify-center bg-background">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

// Routes that render the in-app shell (sidebar + topbar). All of these
// currently render encrypted user data, so they also need to appear in
// PROTECTED_PATHS in src/components/auth/RequireUnlock.tsx. If you add a
// shell route that doesn't read user data (e.g. a static help page), it's
// fine to omit it from PROTECTED_PATHS — the two lists express different
// concerns even though they coincide today.
const APP_SHELL_PATHS = ['/dashboard', '/allocations', '/forecast', '/performance', '/goals', '/sources', '/settings', '/admin'];

function AppRoutes() {
  const location = useLocation();
  const useShell = APP_SHELL_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));

  const routes = (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<Index />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/demo" element={<DemoRedirect />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/security" element={<SecurityPage />} />
      {/* Auth-gated: /settings and /admin expose account-bound surfaces.
          /dashboard, /forecast, /allocations, /sources stay guest-accessible
          because they have no client-side cache to leak after the
          PortfolioContext watcher (encryption.md §8.6). If any of those
          routes ever caches user-tied data again, move them under this
          RequireAuth block. */}
      <Route element={<RequireAuth />}>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="/forecast" element={<ForecastPage />} />
      <Route path="/performance" element={<PerformancePage />} />
      <Route path="/goals" element={<GoalsPage />} />
      <Route path="/allocations" element={<AllocationsPage />} />
      <Route path="/sources" element={<SourcesPage />} />
      <Route path="/impressum" element={<Impressum />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  if (useShell) {
    return (
      <AppShell pathname={location.pathname}>
        <Suspense fallback={<LoadingSpinner />}>{routes}</Suspense>
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <EmailConfirmationBanner />
      <Suspense fallback={<LoadingSpinner />}>{routes}</Suspense>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary>
        <AuthProvider>
          <QueryCacheGuard />
          <KeySessionProvider>
            <CurrencyProvider>
              <PreferencesProvider>
              <PortfolioProvider>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <PageViewTracker />
                  <RequireUnlock />
                  <RecoveryOfferModal />
                  <AuthModalProvider>
                    <AppRoutes />
                  </AuthModalProvider>
                  <ConsentBanner />
                </BrowserRouter>
              </PortfolioProvider>
              </PreferencesProvider>
            </CurrencyProvider>
          </KeySessionProvider>
        </AuthProvider>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
