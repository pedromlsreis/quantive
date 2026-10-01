import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { hasE2EAuth } from './helpers/auth';
import {
  OWNER_SLOT,
  PARTNER_SLOT,
  fakeBytea,
  grantOwnerFamily,
  resetFamily,
  serviceClient,
  sharingTablesExist,
  testUser,
  userClient,
} from './helpers/family';

/**
 * Row-level security and the sharing functions (migration 20261001120000),
 * exercised against the real project as two signed-in users through
 * PostgREST, the way a modified client could call it. No browser: the key
 * material is fake bytes, since only the client can check it.
 *
 * Test user 2 owns, test user 1 is the partner. Runs after the other specs
 * (project "family-rls" in playwright.config.ts).
 * On its own: `npx playwright test e2e/rls-portfolios.spec.ts --no-deps` (without
 * --no-deps, Playwright runs the whole chromium project first).
 */

test.describe.configure({ mode: 'serial' });

const P = crypto.randomUUID();
const P2 = crypto.randomUUID();

test.describe('Portfolio sharing: RLS and functions', () => {
  test.beforeAll(async () => {
    test.skip(!hasE2EAuth(OWNER_SLOT) || !hasE2EAuth(PARTNER_SLOT), 'E2E auth secrets for both test users not set.');
    test.skip(!(await sharingTablesExist()), 'Sharing migration not applied.');
    await resetFamily();
    await grantOwnerFamily();
  });

  test.afterAll(async () => {
    if (hasE2EAuth(OWNER_SLOT) && hasE2EAuth(PARTNER_SLOT) && (await sharingTablesExist())) await resetFamily();
  });

  const owner = () => userClient(OWNER_SLOT);
  const partner = () => userClient(PARTNER_SLOT);

  async function createPortfolio(id: string) {
    const { error } = await owner().rpc('create_portfolio', {
      p_id: id,
      p_wrapped_pk: fakeBytea(72),
      p_encrypted_data: fakeBytea(40),
      p_nonce: fakeBytea(24),
      p_enc_version: 1,
    });
    expect(error).toBeNull();
  }

  async function invite(id: string, email: string, epoch = 1) {
    const inviteId = crypto.randomUUID();
    const { error } = await owner().rpc('create_portfolio_invite', {
      p_invite_id: inviteId,
      p_portfolio_id: id,
      p_invitee_email: email,
      p_wrapped_pk: fakeBytea(72, 7),
      p_key_epoch: epoch,
    });
    return { inviteId, error };
  }

  const accept = async (inviteId: string) =>
    (await partner().rpc('accept_portfolio_invite', { p_invite_id: inviteId, p_wrapped_pk: fakeBytea(72, 9) })).data as string;

  const status = async (id: string) =>
    (await serviceClient().from('portfolios').select('revision, key_epoch, rotation_due').eq('id', id).single()).data!;

  test('a non-member can read nothing of a portfolio', async () => {
    await createPortfolio(P);
    for (const table of ['portfolios', 'portfolio_members', 'portfolio_revisions', 'portfolio_invites'] as const) {
      const { data } = await partner().from(table).select('*');
      expect(data ?? [], table).toEqual([]);
    }
    const save = await partner().rpc('save_portfolio', {
      p_id: P, p_expected_revision: 1, p_key_epoch: 1, p_encrypted_data: fakeBytea(40), p_nonce: fakeBytea(24), p_enc_version: 1,
    });
    expect(save.data?.[0]?.status).toBe('forbidden');
  });

  let inviteId = '';
  test('only the owner can invite; the invite is readable only by its email', async () => {
    const byPartner = await partner().rpc('create_portfolio_invite', {
      p_invite_id: crypto.randomUUID(), p_portfolio_id: P, p_invitee_email: 'x@example.com', p_wrapped_pk: fakeBytea(72), p_key_epoch: 1,
    });
    expect(byPartner.error?.message).toMatch(/forbidden/);

    const created = await invite(P, testUser(PARTNER_SLOT).email.toUpperCase());
    expect(created.error).toBeNull();
    inviteId = created.inviteId;

    const asOwner = await owner().rpc('get_portfolio_invite', { p_invite_id: inviteId });
    expect(asOwner.data?.[0]?.status).toBe('own_invite');
    const asPartner = await partner().rpc('get_portfolio_invite', { p_invite_id: inviteId });
    expect(asPartner.data?.[0]).toMatchObject({ status: 'ok', portfolio_id: P, key_epoch: 1 });
    expect(asPartner.data?.[0]?.invited_by).toBe(testUser(OWNER_SLOT).email);
    // Invites aren't readable as rows by the invitee.
    expect((await partner().from('portfolio_invites').select('*')).data ?? []).toEqual([]);
  });

  test('an invite can be accepted once', async () => {
    expect(await accept(inviteId)).toBe('ok');
    expect(await accept(inviteId)).toBe('already_member');
    const row = await serviceClient().from('portfolio_invites').select('consumed_at, wrapped_pk_invite').eq('id', inviteId).single();
    expect(row.data?.consumed_at).not.toBeNull();
    expect(row.data?.wrapped_pk_invite).toBeNull();
    expect((await partner().from('portfolios').select('id')).data).toEqual([{ id: P }]);
  });

  test("the partner can't remove the owner, rewrite a wrap, set the revision, rotate or delete", async () => {
    const ownerId = testUser(OWNER_SLOT).id;
    const del = await partner().from('portfolio_members').delete().eq('portfolio_id', P).eq('user_id', ownerId).select();
    expect(del.data ?? []).toEqual([]);
    expect((await partner().from('portfolio_members').update({ wrapped_pk: fakeBytea(72, 3) }).eq('portfolio_id', P).select()).error).not.toBeNull();
    expect((await partner().from('portfolios').update({ revision: 99 }).eq('id', P).select()).error).not.toBeNull();
    expect((await partner().from('portfolios').delete().eq('id', P).select()).data ?? []).toEqual([]);
    const { revision } = await status(P);
    const rotate = await partner().rpc('rotate_portfolio_key', {
      p_id: P, p_expected_revision: revision, p_expected_epoch: 1, p_encrypted_data: fakeBytea(40),
      p_nonce: fakeBytea(24), p_enc_version: 1, p_owner_wrapped_pk: fakeBytea(72),
    });
    expect(rotate.data?.[0]?.status).toBe('forbidden');
    expect((await partner().rpc('release_owned_portfolios', { p_user_id: ownerId })).error).not.toBeNull();
    expect((await partner().rpc('has_family', { _user_id: ownerId })).error).not.toBeNull();
    expect(await status(P)).toMatchObject({ revision, key_epoch: 1 });
  });

  test('one partner seat: the owner cannot invite anyone else', async () => {
    await createPortfolio(P2);
    const other = await invite(P2, 'someone-else@example.invalid');
    expect(other.error?.message).toMatch(/seat_taken/);
  });

  test('an expired invite is refused', async () => {
    const { inviteId: expiring, error } = await invite(P2, testUser(PARTNER_SLOT).email);
    expect(error).toBeNull();
    await serviceClient().from('portfolio_invites').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', expiring);
    expect((await partner().rpc('get_portfolio_invite', { p_invite_id: expiring })).data?.[0]?.status).toBe('expired');
    expect(await accept(expiring)).toBe('expired');
  });

  test('removing the partner cuts access, flags a rotation and blocks invites until it runs', async () => {
    const partnerId = testUser(PARTNER_SLOT).id;
    const removed = await owner().from('portfolio_members').delete().eq('portfolio_id', P).eq('user_id', partnerId).select();
    expect(removed.data).toHaveLength(1);
    expect((await partner().from('portfolios').select('id')).data ?? []).toEqual([]);
    expect((await status(P)).rotation_due).toBe(true);
    expect((await invite(P, testUser(PARTNER_SLOT).email)).error?.message).toMatch(/rotation_due/);

    const { revision } = await status(P);
    const rotated = await owner().rpc('rotate_portfolio_key', {
      p_id: P, p_expected_revision: revision, p_expected_epoch: 1, p_encrypted_data: fakeBytea(40, 5),
      p_nonce: fakeBytea(24), p_enc_version: 1, p_owner_wrapped_pk: fakeBytea(72, 8),
    });
    expect(rotated.data?.[0]).toMatchObject({ status: 'ok', current_epoch: 2 });
    expect(await status(P)).toMatchObject({ key_epoch: 2, rotation_due: false });
    // An invite made for the old key is useless now.
    expect((await invite(P, testUser(PARTNER_SLOT).email, 1)).error?.message).toMatch(/stale_epoch/);
  });
});
