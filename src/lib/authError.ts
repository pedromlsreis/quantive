// Maps raw Supabase GoTrue error strings to user-facing toast copy.
// GoTrue returns messages like "Invalid login credentials" or "Email rate
// limit exceeded" — fine for an SDK consumer, but technical and American
// for end users. We match on substrings (not exact equality) because the
// upstream wording occasionally shifts between GoTrue versions.

import { PASSWORD_LENGTH_HINT } from './passwordPolicy';

export function mapAuthError(raw: string | null | undefined): string {
  if (!raw) return "Something went wrong. Please try again.";
  const m = raw.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "That email or password didn't match. Try again, or reset your password.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the link.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("email rate limit exceeded") || m.includes("over_email_send_rate_limit")) {
    return "We've sent too many emails recently. Please wait a few minutes and try again.";
  }
  if (m.includes("for security purposes") || m.includes("only request this")) {
    return "Please wait a moment before trying again.";
  }
  if (m.includes("password should be at least") || m.includes("weak_password")) {
    return PASSWORD_LENGTH_HINT;
  }
  if (m.includes("new password should be different")) {
    return "Your new password must be different from the current one.";
  }
  if (m.includes("unable to validate email") || m.includes("invalid email") || m.includes("invalid format")) {
    return "That doesn't look like a valid email address.";
  }
  if (m.includes("user not found")) {
    return "We couldn't find an account with that email.";
  }
  if (m.includes("token has expired") || m.includes("invalid token") || m.includes("expired or is invalid")) {
    return "That link has expired. Please request a new one.";
  }
  if (m.includes("signup is disabled") || m.includes("signups not allowed")) {
    return "New sign-ups are temporarily disabled. Please try again later.";
  }
  if (m.includes("network") || m.includes("fetch failed") || m.includes("failed to fetch")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }

  // Unknown — surface a generic message rather than the raw GoTrue string,
  // which is often lowercase and technical.
  return "Something went wrong. Please try again.";
}
