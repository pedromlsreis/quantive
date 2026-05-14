import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable result shared across all query chain methods. Reset in beforeEach.
const dbResult: {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
} = { data: null, error: null, count: null };

type Resolver = (v: unknown) => unknown;
type Final = {
  then: (resolve: Resolver, reject?: Resolver) => Promise<unknown>;
  maybeSingle: () => Promise<unknown>;
};
type Chain = {
  select: () => Chain;
  eq: () => Chain & Final;
  insert: () => Promise<unknown>;
  update: () => Chain;
};

vi.mock('@/integrations/supabase/client', () => {
  const get = () => dbResult;

  // terminal: when the chain is awaited directly or .maybeSingle() is called
  const makeFinal = (): Final => ({
    then: (resolve, reject) => Promise.resolve(get()).then(resolve, reject),
    maybeSingle: () => Promise.resolve(get()),
  });

  // Builds a fresh chain object on each call so nested chains don't alias.
  const makeChain = (): Chain => {
    const chain: Chain = {
      select: () => chain,
      eq: () => ({ ...makeChain(), ...makeFinal() }),
      insert: () => Promise.resolve(get()),
      update: () => chain,
    };
    return chain;
  };

  return { supabase: { from: () => makeChain() } };
});

// Import AFTER mock is registered.
import { supabaseKeyStore } from '@/lib/keySession/supabaseStore';
import { byteaToBytes } from '@/lib/keySession/bytea';

// Sample hex strings as PostgREST would return them.
const HEX_SALT = '\\xaabbcc';
const HEX_KEK = '\\x112233445566';
const HEX_RECOVERY = '\\xddeeff001122';
const HEX_REC_SALT = '\\xffeeddccbbaa';
const BYTES_SALT = byteaToBytes(HEX_SALT);
const BYTES_KEK = byteaToBytes(HEX_KEK);
const BYTES_RECOVERY = byteaToBytes(HEX_RECOVERY);
const BYTES_REC_SALT = byteaToBytes(HEX_REC_SALT);

beforeEach(() => {
  dbResult.data = null;
  dbResult.error = null;
  dbResult.count = null;
});

// ---------------------------------------------------------------------------
// getUserKeys
// ---------------------------------------------------------------------------

describe('supabaseKeyStore.getUserKeys', () => {
  it('returns null when the table has no row for the user', async () => {
    dbResult.data = null;
    const row = await supabaseKeyStore.getUserKeys('user-abc');
    expect(row).toBeNull();
  });

  it('maps a full row to a UserKeysRow with Uint8Array fields', async () => {
    dbResult.data = {
      user_id: 'user-123',
      kdf_salt: HEX_SALT,
      wrapped_dk_kek: HEX_KEK,
      wrapped_dk_recovery: HEX_RECOVERY,
      recovery_kdf_salt: HEX_REC_SALT,
      enc_version: 1,
    };

    const row = await supabaseKeyStore.getUserKeys('user-123');
    expect(row).not.toBeNull();
    expect(row!.user_id).toBe('user-123');
    expect(row!.enc_version).toBe(1);
    expect(row!.kdf_salt).toBeInstanceOf(Uint8Array);
    expect(Array.from(row!.kdf_salt)).toEqual(Array.from(BYTES_SALT));
    expect(Array.from(row!.wrapped_dk_kek)).toEqual(Array.from(BYTES_KEK));
    expect(Array.from(row!.wrapped_dk_recovery!)).toEqual(Array.from(BYTES_RECOVERY));
    expect(Array.from(row!.recovery_kdf_salt!)).toEqual(Array.from(BYTES_REC_SALT));
  });

  it('maps null optional fields to null without throwing', async () => {
    dbResult.data = {
      user_id: 'user-456',
      kdf_salt: HEX_SALT,
      wrapped_dk_kek: HEX_KEK,
      wrapped_dk_recovery: null,
      recovery_kdf_salt: null,
      enc_version: 2,
    };

    const row = await supabaseKeyStore.getUserKeys('user-456');
    expect(row!.wrapped_dk_recovery).toBeNull();
    expect(row!.recovery_kdf_salt).toBeNull();
  });

  it('throws when supabase returns an error', async () => {
    dbResult.error = { message: 'permission denied' };
    await expect(supabaseKeyStore.getUserKeys('user-123')).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

// ---------------------------------------------------------------------------
// insertUserKeys
// ---------------------------------------------------------------------------

describe('supabaseKeyStore.insertUserKeys', () => {
  it('resolves without error on a successful insert', async () => {
    dbResult.error = null;
    await expect(
      supabaseKeyStore.insertUserKeys({
        user_id: 'user-new',
        kdf_salt: BYTES_SALT,
        wrapped_dk_kek: BYTES_KEK,
        wrapped_dk_recovery: null,
        recovery_kdf_salt: null,
        enc_version: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('resolves with optional recovery fields', async () => {
    dbResult.error = null;
    await expect(
      supabaseKeyStore.insertUserKeys({
        user_id: 'user-new',
        kdf_salt: BYTES_SALT,
        wrapped_dk_kek: BYTES_KEK,
        wrapped_dk_recovery: BYTES_RECOVERY,
        recovery_kdf_salt: BYTES_REC_SALT,
        enc_version: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('throws when supabase returns an error', async () => {
    dbResult.error = { message: 'unique violation' };
    await expect(
      supabaseKeyStore.insertUserKeys({
        user_id: 'dup',
        kdf_salt: BYTES_SALT,
        wrapped_dk_kek: BYTES_KEK,
        wrapped_dk_recovery: null,
        recovery_kdf_salt: null,
        enc_version: 1,
      }),
    ).rejects.toMatchObject({ message: 'unique violation' });
  });
});

// ---------------------------------------------------------------------------
// hasPortfolioSnapshot
// ---------------------------------------------------------------------------

describe('supabaseKeyStore.hasPortfolioSnapshot', () => {
  it('returns false when count is 0', async () => {
    dbResult.count = 0;
    expect(await supabaseKeyStore.hasPortfolioSnapshot('user-123')).toBe(false);
  });

  it('returns true when count is positive', async () => {
    dbResult.count = 3;
    expect(await supabaseKeyStore.hasPortfolioSnapshot('user-123')).toBe(true);
  });

  it('returns false when count is null (treated as zero)', async () => {
    dbResult.count = null;
    expect(await supabaseKeyStore.hasPortfolioSnapshot('user-123')).toBe(false);
  });

  it('throws when supabase returns an error', async () => {
    dbResult.error = { message: 'network error' };
    await expect(supabaseKeyStore.hasPortfolioSnapshot('user-123')).rejects.toMatchObject({
      message: 'network error',
    });
  });
});

// ---------------------------------------------------------------------------
// updatePasswordWrap
// ---------------------------------------------------------------------------

describe('supabaseKeyStore.updatePasswordWrap', () => {
  it('resolves without error on a successful update', async () => {
    dbResult.error = null;
    await expect(
      supabaseKeyStore.updatePasswordWrap({
        user_id: 'user-123',
        kdf_salt: BYTES_SALT,
        wrapped_dk_kek: BYTES_KEK,
      }),
    ).resolves.toBeUndefined();
  });

  it('throws when supabase returns an error', async () => {
    dbResult.error = { message: 'row not found' };
    await expect(
      supabaseKeyStore.updatePasswordWrap({
        user_id: 'ghost',
        kdf_salt: BYTES_SALT,
        wrapped_dk_kek: BYTES_KEK,
      }),
    ).rejects.toMatchObject({ message: 'row not found' });
  });
});

// ---------------------------------------------------------------------------
// updateRecoveryWrap
// ---------------------------------------------------------------------------

describe('supabaseKeyStore.updateRecoveryWrap', () => {
  it('resolves without error on a successful update', async () => {
    dbResult.error = null;
    await expect(
      supabaseKeyStore.updateRecoveryWrap({
        user_id: 'user-123',
        recovery_kdf_salt: BYTES_REC_SALT,
        wrapped_dk_recovery: BYTES_RECOVERY,
      }),
    ).resolves.toBeUndefined();
  });

  it('throws when supabase returns an error', async () => {
    dbResult.error = { message: 'constraint violation' };
    await expect(
      supabaseKeyStore.updateRecoveryWrap({
        user_id: 'user-123',
        recovery_kdf_salt: BYTES_REC_SALT,
        wrapped_dk_recovery: BYTES_RECOVERY,
      }),
    ).rejects.toMatchObject({ message: 'constraint violation' });
  });
});
