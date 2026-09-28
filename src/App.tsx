import { lazy, Suspense, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { analytics } from "@/lib/analytics";
import { ErrorBoundary, RouteScopedErrorBoundary } from "@/components/ErrorBoundary";
import { ConsentBanner } from "@/components/ConsentBanner";
import { PortfolioProvider } from "@/contexts/PortfolioContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { KeySessionProvider } from "@/contexts/KeySessionContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { EmailConfirmationBanner } from "@/components/auth/EmailConfirmationBanner";
import { RequireUnlock } from "@/components/auth/RequireUnlock";
import { IdleAutoLock } from "@/components/auth/IdleAutoLock";
import { RecoveryOfferModal } from "@/components/auth/RecoveryOfferModal";
import { QueryCacheGuard } from "@/components/auth/QueryCacheGuard";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
// The six prerendered public pages are preloadable (see main.tsx); every
// other route below stays on plain lazy().
import {
  Impressum,
  LandingPage,
  PricingPage,
  PrivacyPolicy,
  SecurityPage,
  TermsOfService,
} from "@/routes/publicRoutes";

const Index = lazy(() => import("./pages/Index"));
const DemoRedirect = lazy(() => import("./pages/DemoRedirect"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ForecastPage = lazy(() => import("./pages/ForecastPage"));
const PerformancePage = lazy(() => import("./pages/PerformancePage"));
const GoalsPage = lazy(() => import("./pages/GoalsPage"));
const AllocationsPage = lazy(() => import("./pages/AllocationsPage"));
const SourcesPage = lazy(() => import("./pages/SourcesPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function PageViewTracker() {
  const { pathname } = useLocation();
  useEffect(() => {
    analytics.pageViewed(pathname);
  }, [pathname]);
  return null;
}

// Only fragment ids count as anchors. Auth callbacks put tokens in the hash
// (`#access_token=…&type=recovery`); those must not suppress the scroll reset.
function anchorIdFrom(hash: string): string | null {
  return /^#[A-Za-z][\w-]*$/.test(hash) ? hash.slice(1) : null;
}

// Reset scroll to the top on route change. The router preserves the window
// scroll position across client-side navigation, so without this a user who
// scrolls down one page lands mid-way down the next. URLs with an anchor
// (`/#features`) are left to ScrollToHash.
//
// This deliberately also scrolls to top on back/forward (POP), forgoing
// native scroll restoration. That's fine here: every in-app route is a
// self-contained dashboard with no list→detail→back flow whose scroll
// position would be worth restoring. If such a flow ever appears, gate the
// reset on useNavigationType() === 'PUSH' rather than reaching for a full
// createBrowserRouter + <ScrollRestoration> refactor.
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (anchorIdFrom(hash)) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// BrowserRouter does not scroll to `#id` targets, so `/#faq` links from other
// pages would land at the top. The target may not exist yet (lazy page behind
// Suspense), so poll once per frame for up to 2 s. Arriving from another page
// jumps; a same-page anchor glides unless reduced motion is on. The offset
// under the fixed nav comes from `scroll-padding-top` in index.css.
function ScrollToHash() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    const samePage = lastPathname.current === pathname;
    lastPathname.current = pathname;
    const id = anchorIdFrom(hash);
    if (!id) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = samePage && navigationType !== "POP" && !reduced ? "smooth" : "auto";
    const deadline = performance.now() + 2000;
    let frame = 0;
    const scrollWhenPresent = () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior, block: "start" });
      } else if (performance.now() < deadline) {
        frame = requestAnimationFrame(scrollWhenPresent);
      }
    };
    scrollWhenPresent();
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, key, navigationType]);
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
                  <ScrollToTop />
                  <ScrollToHash />
                  <RequireUnlock />
                  <IdleAutoLock />
                  <RecoveryOfferModal />
                  <AuthModalProvider>
                    {/* Route-scoped boundary: a page-level crash resets when
                        the user navigates away, instead of poisoning the
                        whole shell. The outer ErrorBoundary still catches
                        provider-init failures that would otherwise leave the
                        router unmounted. */}
                    <RouteScopedErrorBoundary>
                      <AppRoutes />
                    </RouteScopedErrorBoundary>
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
