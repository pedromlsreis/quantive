/**
 * The stable `{ error: code }` an edge function returned with a non-2xx
 * status. The Supabase functions client wraps that Response on the error's
 * `context` field; any parse failure is `undefined` (the generic case).
 */
export async function functionErrorCode(error: unknown): Promise<string | undefined> {
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return undefined;
  try {
    const body = await ctx.clone().json();
    return typeof body?.error === 'string' ? body.error : undefined;
  } catch {
    return undefined;
  }
}
