import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import type { SubscriptionStatus } from '@/lib/billing/plans';
import { analytics } from '@/lib/analytics';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscription: SubscriptionStatus;
  checkSubscription: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  resendConfirmation: (emailOverride?: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const defaultSubscription: SubscriptionStatus = {
  subscribed: false,
  productId: null,
  subscriptionEnd: null,
  cancelAtPeriodEnd: false,
  paymentPastDue: false,
  hasStripeHistory: false,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus>(defaultSubscription);

  // useCallback so consumers can put `checkSubscription` in effect dep arrays
  // without re-firing on every parent render. The fn captures no React state,
  // so an empty dep array is correct.
  const checkSubscription = useCallback(async () => {
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) return;
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        console.error('Error checking subscription:', error);
        return;
      }
      setSubscription({
        subscribed: data?.subscribed ?? false,
        productId: data?.product_id ?? null,
        subscriptionEnd: data?.subscription_end ?? null,
        cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
        paymentPastDue: data?.payment_past_due ?? false,
        hasStripeHistory: data?.has_stripe_history ?? false,
      });
    } catch (err) {
      console.error('Error checking subscription:', err);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        setTimeout(() => checkSubscription(), 0);
      } else {
        setSubscription(defaultSubscription);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        checkSubscription();
      }
    });

    return () => authSub.unsubscribe();
  }, [checkSubscription]);

  // Auto-refresh subscription every 60s, but only while the tab is visible.
  // Background tabs left open all day were firing 1440 edge-function calls
  // per user per day with nothing reading the result. We also re-fetch
  // immediately when a hidden tab regains focus so the user sees fresh
  // entitlement state on switch-back.
  useEffect(() => {
    if (!user) return;
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval !== null) return;
      checkSubscription();
      interval = setInterval(checkSubscription, 60_000);
    };
    const stop = () => {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    if (document.visibilityState === 'visible') {
      // Initial fetch already happens on auth change; only schedule the timer.
      interval = setInterval(checkSubscription, 60_000);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stop();
    };
  }, [user, checkSubscription]);

  // Fire-and-forget welcome email once email is confirmed. The edge function
  // is idempotent (profiles.welcome_email_sent_at), so a second call returns
  // { skipped: "already_sent" } and no email goes out. Even so, we gate the
  // invoke behind a per-tab sessionStorage flag so a page refresh on HN
  // traffic doesn't re-hit the function once per load.
  useEffect(() => {
    if (!user?.email_confirmed_at) return;
    const flagKey = `welcome-invoked:${user.id}`;
    try {
      if (sessionStorage.getItem(flagKey) === '1') return;
      sessionStorage.setItem(flagKey, '1');
    } catch {
      // sessionStorage unavailable (e.g. Safari private mode): fall through
      // and invoke — the edge function is still idempotent.
    }
    supabase.functions.invoke('send-welcome-email').catch((err) => {
      console.debug('[welcome-email] invoke failed:', err);
    });
  }, [user?.id, user?.email_confirmed_at]);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (!error) analytics.signedUp();
    return { error: error?.message ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) analytics.signedIn();
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    analytics.signedOut();
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const resendConfirmation = async (emailOverride?: string) => {
    // emailOverride covers the post-signup case where no session exists yet
    // and `user` is null — the AuthModal needs to resend to the email the
    // user just typed in.
    const email = emailOverride ?? user?.email;
    if (!email) return { error: 'No email associated with this account.' };
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, subscription, checkSubscription, signUp, signIn, signOut, resetPassword, updatePassword, resendConfirmation }}>
      {children}
    </AuthContext.Provider>
  );
}
