import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '@/lib/captcha';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Load the Cloudflare script once per page.
let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null; // allow a later retry
      reject(new Error('Failed to load Turnstile'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
}

// Invisible-until-needed Turnstile widget. Tokens are single-use, so the parent
// remounts this (changing `key`) for a fresh one. Renders null when no site key.
export function Turnstile({ onVerify, onExpire, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Latest callbacks without re-running the effect (which re-renders the widget).
  const cbRef = useRef({ onVerify, onExpire, onError });
  cbRef.current = { onVerify, onExpire, onError };

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => cbRef.current.onVerify(token),
          'expired-callback': () => cbRef.current.onExpire?.(),
          'error-callback': () => cbRef.current.onError?.(),
          theme: 'dark',
          // Stay invisible unless Cloudflare actually needs a human interaction;
          // most legit users never see a box and the token is issued silently.
          appearance: 'interaction-only',
          // When it does show, span the container width so its edges line up
          // with the inputs and submit button instead of a narrow left box.
          size: 'flexible',
        });
      })
      .catch(() => cbRef.current.onError?.());

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // already gone
        }
      }
    };
  }, []);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={containerRef} className="cf-turnstile" />;
}
