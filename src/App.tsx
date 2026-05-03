import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PortfolioProvider } from "@/contexts/PortfolioContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { KeySessionProvider } from "@/contexts/KeySessionContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { EmailConfirmationBanner } from "@/components/auth/EmailConfirmationBanner";
import { RequireUnlock } from "@/components/auth/RequireUnlock";
import { RecoveryOfferModal } from "@/components/auth/RecoveryOfferModal";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const Index = lazy(() => import("./pages/Index"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const DemoRedirect = lazy(() => import("./pages/DemoRedirect"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const LoadingSpinner = () => (
  <div className="flex flex-1 items-center justify-center bg-background">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

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
                  <div className="flex min-h-screen flex-col">
                    <EmailConfirmationBanner />
                    <RequireUnlock />
                    <RecoveryOfferModal />
                    <Suspense fallback={<LoadingSpinner />}>
                      <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/dashboard" element={<Index />} />
                        <Route path="/pricing" element={<PricingPage />} />
                        <Route path="/demo" element={<DemoRedirect />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/privacy" element={<PrivacyPolicy />} />
                        <Route path="/terms" element={<TermsOfService />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </div>
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
