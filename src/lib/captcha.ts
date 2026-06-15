// Cloudflare Turnstile config. Site key is public (ships in the client); the
// secret lives in Supabase, which verifies tokens. Unset = no widget, no token
// (pre-CAPTCHA behaviour) — safe to ship before enabling it server-side.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
export const isCaptchaEnabled = Boolean(TURNSTILE_SITE_KEY);
