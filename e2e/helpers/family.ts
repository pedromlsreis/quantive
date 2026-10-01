import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared setup for the Family specs (rls-portfolios, family-sharing). Test
 * user 2 owns, test user 1 is the partner. Both specs run in the "family"
 * project (playwright.config.ts): after every other spec, because most
 * specs sign in as user 1, whose portfolio list would otherwise change under
 * them; and on one worker, because each spec's reset would delete the
 * other's portfolios and beta row mid-run.
 */

function check(step: string, error: { message: string } | null): void {
  if (error) throw new Error(`Family E2E setup: ${step} failed: ${error.message}`);
}

export const OWNER_SLOT = 2 as const;
export const PARTNER_SLOT = 1 as const;

const SESSIONS_FILE = join(process.cwd(), 'e2e', '.auth', 'sessions.json');

export function serviceClient(): SupabaseClient {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function storedSession(slot: 1 | 2): { access_token: string; user: { id: string; email: string } } {
  const sessions = JSON.parse(readFileSync(SESSIONS_FILE, 'utf8')) as Record<string, Record<string, string>>;
  const entries = sessions[slot];
  const key = Object.keys(entries).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))!;
  return JSON.parse(entries[key]);
}

/** A PostgREST client acting as the test user, with their minted access token. */
export function userClient(slot: 1 | 2): SupabaseClient {
  const { access_token } = storedSession(slot);
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${access_token}` } },
  });
}

export function testUser(slot: 1 | 2): { id: string; email: string } {
  const { user } = storedSession(slot);
  return { id: user.id, email: user.email.toLowerCase() };
}

/** True once migration 20261001120000 is applied. A plain select: a HEAD to a missing table returns 204. */
export async function sharingTablesExist(): Promise<boolean> {
  const { error } = await serviceClient().from('portfolio_invites').select('id').limit(1);
  return !error;
}

/** Removes everything the Family specs create for both test users. */
export async function resetFamily(opts: { keepBeta?: boolean } = {}): Promise<void> {
  const service = serviceClient();
  const owner = testUser(OWNER_SLOT).id;
  const partner = testUser(PARTNER_SLOT).id;
  for (const id of [owner, partner]) {
    check('deleting portfolios', (await service.from('portfolios').delete().eq('owner_id', id)).error);
    check('freeing the seat', (await service.from('family_partners').delete().eq('owner_id', id)).error);
    check('freeing the seat', (await service.from('family_partners').delete().eq('partner_id', id)).error);
  }
  // Only the row grantOwnerFamily added; a real beta grant stays.
  if (!opts.keepBeta) {
    check('removing the beta row', (await service.from('family_beta').delete().eq('user_id', owner).eq('note', 'e2e')).error);
  }
}

/** The server checks the Family plan itself, so the owner joins the beta for the run. */
export async function grantOwnerFamily(): Promise<void> {
  const { error } = await serviceClient()
    .from('family_beta')
    .upsert({ user_id: testUser(OWNER_SLOT).id, note: 'e2e' }, { onConflict: 'user_id', ignoreDuplicates: true });
  check('granting the beta', error);
}

/** A syntactically valid bytea for fields whose contents only the client checks. */
export const fakeBytea = (bytes: number, fill = 1): string => '\\x' + Buffer.alloc(bytes, fill).toString('hex');
