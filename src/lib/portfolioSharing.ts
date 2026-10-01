/**
 * Sharing an extra portfolio with a partner: invites, joining, leaving and
 * removal. Spec: docs/security/encryption.md §8.8–§8.9.
 *
 * The invite link is /join/<inviteId>#k=<S>. S wraps the portfolio key and
 * never reaches the server: the fragment isn't sent with requests, and
 * inviteFragment.ts strips it from the address bar before analytics starts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { base64UrlEncode } from '@/lib/base64url';
import {
  generateInviteSecret,
  unwrapPortfolioKeyFromInvite,
  wrapPortfolioKey,
  wrapPortfolioKeyForInvite,
} from '@/lib/crypto';
import { byteaToBytes, bytesToBytea } from '@/lib/keySession/bytea';

type Client = SupabaseClient<Database>;

/** Mirrors expires_at's default in migration 20261001120000. */
export const INVITE_LIFETIME_DAYS = 7;

export interface PortfolioPerson {
  portfolioId: string;
  userId: string;
  email: string;
  isOwner: boolean;
}

export interface PendingInvite {
  id: string;
  portfolioId: string;
  inviteeEmail: string;
  expiresAt: string;
}

/** Reasons create_portfolio_invite refuses, as raised by the function. */
export type InviteErrorCode =
  | 'seat_taken'
  | 'self_invite'
  | 'already_member'
  | 'family_required'
  | 'rotation_due'
  | 'stale_epoch'
  | 'invalid_email'
  | 'forbidden'
  | 'unknown';

const INVITE_ERROR_CODES: readonly InviteErrorCode[] = [
  'seat_taken',
  'self_invite',
  'already_member',
  'family_required',
  'rotation_due',
  'stale_epoch',
  'invalid_email',
  'forbidden',
];

export class InviteError extends Error {
  constructor(readonly code: InviteErrorCode) {
    super(code);
    this.name = 'InviteError';
  }
}

/** Statuses from get_ and accept_portfolio_invite other than 'ok'. */
export type InviteProblem =
  | 'not_found'
  | 'own_invite'
  | 'wrong_account'
  | 'already_member'
  | 'unconfirmed'
  | 'used'
  | 'expired'
  | 'unavailable'
  | 'seat_taken'
  | 'already_partnered';

const INVITE_PROBLEMS: readonly InviteProblem[] = [
  'not_found',
  'own_invite',
  'wrong_account',
  'already_member',
  'unconfirmed',
  'used',
  'expired',
  'unavailable',
  'seat_taken',
  'already_partnered',
];

function asProblem(status: string | null | undefined): InviteProblem {
  return INVITE_PROBLEMS.includes(status as InviteProblem) ? (status as InviteProblem) : 'not_found';
}

export type InviteLookup =
  | { status: 'ok'; portfolioId: string; keyEpoch: number; wrappedPk: Uint8Array; invitedBy: string; expiresAt: string }
  | { status: InviteProblem };

export function inviteLink(origin: string, inviteId: string, secret: Uint8Array): string {
  return `${origin}/join/${inviteId}#k=${base64UrlEncode(secret)}`;
}

/**
 * Creates an invite and returns the link to send. The link is the only
 * copy of S: it can't be shown again, only replaced by a new invite.
 */
export async function createInvite(
  client: Client,
  args: { portfolioId: string; keyEpoch: number; portfolioKey: Uint8Array; email: string; origin: string },
): Promise<{ inviteId: string; link: string }> {
  const inviteId = crypto.randomUUID();
  const secret = await generateInviteSecret();
  try {
    const wrapped = await wrapPortfolioKeyForInvite({
      portfolioKey: args.portfolioKey,
      inviteSecret: secret,
      inviteId,
      portfolioId: args.portfolioId,
      keyEpoch: args.keyEpoch,
    });
    const { error } = await client.rpc('create_portfolio_invite', {
      p_invite_id: inviteId,
      p_portfolio_id: args.portfolioId,
      p_invitee_email: args.email,
      p_wrapped_pk: bytesToBytea(wrapped),
      p_key_epoch: args.keyEpoch,
    });
    if (error) {
      const code = INVITE_ERROR_CODES.find((c) => error.message?.includes(c)) ?? 'unknown';
      throw new InviteError(code);
    }
    return { inviteId, link: inviteLink(args.origin, inviteId, secret) };
  } finally {
    secret.fill(0);
  }
}

export async function revokeInvite(client: Client, inviteId: string): Promise<void> {
  const { error } = await client.from('portfolio_invites').delete().eq('id', inviteId);
  if (error) throw error;
}

/** The caller's invites still waiting to be accepted. */
export async function listPendingInvites(client: Client, userId: string): Promise<PendingInvite[]> {
  const { data, error } = await client
    .from('portfolio_invites')
    .select('id, portfolio_id, invitee_email, expires_at')
    .eq('created_by', userId)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;
  return (data ?? []).map((i) => ({
    id: i.id,
    portfolioId: i.portfolio_id,
    inviteeEmail: i.invitee_email,
    expiresAt: i.expires_at,
  }));
}

/** Everyone in the portfolios the caller is a member of, the caller included. */
export async function listPortfolioPeople(client: Client): Promise<PortfolioPerson[]> {
  const { data, error } = await client.rpc('list_portfolio_people');
  if (error) throw error;
  return (data ?? []).map((p) => ({ portfolioId: p.portfolio_id, userId: p.user_id, email: p.email, isOwner: p.is_owner }));
}

export async function getInvite(client: Client, inviteId: string): Promise<InviteLookup> {
  const { data, error } = await client.rpc('get_portfolio_invite', { p_invite_id: inviteId });
  if (error) throw error;
  const row = data?.[0];
  if (
    row?.status === 'ok' &&
    row.portfolio_id &&
    row.key_epoch !== null &&
    row.wrapped_pk &&
    row.expires_at
  ) {
    return {
      status: 'ok',
      portfolioId: row.portfolio_id,
      keyEpoch: row.key_epoch,
      wrappedPk: byteaToBytes(row.wrapped_pk),
      invitedBy: row.invited_by ?? '',
      expiresAt: row.expires_at,
    };
  }
  return { status: asProblem(row?.status) };
}

/** S doesn't open the invite's wrap: the link was altered or belongs to another invite. */
export class InviteLinkMismatchError extends Error {
  constructor() {
    super('invite link does not match its invite');
    this.name = 'InviteLinkMismatchError';
  }
}

/**
 * Joins the portfolio: unwraps PK with S, wraps it again under the
 * partner's own DK, and redeems the invite. Resolves 'ok' or the reason the
 * server refused.
 */
export async function acceptInvite(
  client: Client,
  args: {
    inviteId: string;
    invite: Extract<InviteLookup, { status: 'ok' }>;
    inviteSecret: Uint8Array;
    dataKey: Uint8Array;
    userId: string;
  },
): Promise<'ok' | InviteProblem> {
  const { inviteId, invite, inviteSecret, dataKey, userId } = args;
  let portfolioKey: Uint8Array;
  try {
    portfolioKey = await unwrapPortfolioKeyFromInvite({
      wrappedPk: invite.wrappedPk,
      inviteSecret,
      inviteId,
      portfolioId: invite.portfolioId,
      keyEpoch: invite.keyEpoch,
    });
  } catch {
    throw new InviteLinkMismatchError();
  }
  try {
    const wrapped = await wrapPortfolioKey({
      portfolioKey,
      dataKey,
      userId,
      portfolioId: invite.portfolioId,
      keyEpoch: invite.keyEpoch,
    });
    const { data, error } = await client.rpc('accept_portfolio_invite', {
      p_invite_id: inviteId,
      p_wrapped_pk: bytesToBytea(wrapped),
    });
    if (error) throw error;
    return data === 'ok' ? 'ok' : asProblem(data);
  } finally {
    portfolioKey.fill(0);
  }
}

/**
 * Removes a member: the owner removing the partner, or the partner removing
 * themselves (leaving). RLS allows nothing else. Removing the partner sets
 * rotation_due; the caller then rotates if it is the owner.
 */
export async function removeMember(client: Client, portfolioId: string, userId: string): Promise<void> {
  const { data, error } = await client
    .from('portfolio_members')
    .delete()
    .eq('portfolio_id', portfolioId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('member not removed');
}
