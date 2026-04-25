/**
 * Detect a Supabase password-recovery link from either URL format.
 *
 * The Supabase SDK strips these markers off the URL after processing,
 * so this fast-path only fires when the page mounts before the SDK has
 * had a chance to run. The PASSWORD_RECOVERY auth event remains the
 * authoritative signal.
 *
 * Supported formats:
 *  - Implicit flow:        #access_token=...&type=recovery
 *  - Verify-redirect:      ?token_hash=...&type=recovery
 *  - PKCE flow:            ?code=...
 *  - Bare query type:      ?type=recovery
 */
export function urlLooksLikeRecovery(location: { hash: string; search: string }): boolean {
  if (location.hash.includes('type=recovery')) return true;
  const params = new URLSearchParams(location.search);
  if (params.get('type') === 'recovery') return true;
  if (params.has('code')) return true;
  if (params.has('token_hash') && params.get('type') === 'recovery') return true;
  return false;
}
