import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PortfolioProvider } from "@/contexts/PortfolioContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { KeySessionProvider } from "@/contexts/KeySessionContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { EmailConfirmationBanner } from "@/components/auth/EmailConfirmationBanner";
import { RequireUnlock } from "@/components/auth/RequireUnlock";
import { RecoveryOfferModal } from "@/components/auth/RecoveryOfferModal";
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
const AdminPage = lazy(() => import("./pages/AdminPage"));
const Impressum = lazy(() => import("./pages/Impressum"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const LoadingSpinner = () => (
  <div className="flex flex-1 items-center justify-center bg-background">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const APP_SHELL_PATHS = ['/dashboard', '/allocations', '/forecast', '/sources', '/settings', '/security'];

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
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/forecast" element={<ForecastPage />} />
      <Route path="/admin" element={<AdminPage />} />
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
          <KeySessionProvider>
            <CurrencyProvider>
              <PortfolioProvider>
                <BrowserRouter>
                  <RequireUnlock />
                  <RecoveryOfferModal />
                  <AppRoutes />
                </BrowserRouter>
              </PortfolioProvider>
            </CurrencyProvider>
          </KeySessionProvider>
        </AuthProvider>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
