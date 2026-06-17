/**
 * Drops the in-memory data key after a stretch of user inactivity, so an
 * unlocked workspace left unattended stops showing decrypted data. Re-entry is
 * the existing RequireUnlock prompt, which appears as soon as the session is
 * locked on a protected route.
 *
 * Renders nothing. The idle timer only runs while a user is signed in, the
 * session is unlocked, and a non-zero timeout is configured.
 */
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useKeySession } from '@/contexts/KeySessionContext';
import { usePreferences } from '@/contexts/PreferencesContext';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'scroll', 'touchstart'] as const;

export function IdleAutoLock() {
  const { user } = useAuth();
  const { status, lock } = useKeySession();
  const { autoLockMinutes } = usePreferences();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || status !== 'unlocked-encrypted' || autoLockMinutes <= 0) return;

    const timeoutMs = autoLockMinutes * 60_000;
    let timer: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, timeoutMs);
    };

    // Throttle to once a second so a stream of mousemove/scroll events doesn't
    // reschedule the timer on every frame.
    const onActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 1000) return;
      lastActivity = now;
      arm();
    };

    // Background tabs throttle timers, so the countdown can fire late. On
    // return, lock immediately if the idle window already elapsed.
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity >= timeoutMs) lock();
      else arm();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    arm();

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, status, autoLockMinutes, lock]);

  return null;
}
