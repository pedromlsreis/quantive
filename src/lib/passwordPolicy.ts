// Single source of truth for the password length policy.
//
// The bar is "long enough that a stolen wrap is not trivially crackable".
// Argon2id with t=3, m=64MiB raises the cost per guess, but a six-character
// password is still feasible with rented GPU time. Ten characters pushes the
// cost out of "weekend project" territory without making the form annoying.
//
// The Supabase project's server-side minimum may be lower; this client gate
// is the practical floor users actually hit.

export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_LENGTH_HINT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;

export function passwordTooShort(password: string): boolean {
  return password.length < PASSWORD_MIN_LENGTH;
}
