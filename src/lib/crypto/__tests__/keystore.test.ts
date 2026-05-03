import { describe, expect, it } from 'vitest';
import { DecryptionError, generateKey } from '../aead';
import {
  DATA_KEY_BYTES,
  generateDataKey,
  unwrapDataKey,
  unwrapDataKeyFromRecovery,
  wrapDataKey,
  wrapDataKeyForRecovery,
} from '../keystore';

const USER_A = '550e8400-e29b-41d4-a716-446655440000';
const USER_B = '550e8400-e29b-41d4-a716-446655440001';

describe('keystore: generateDataKey', () => {
  it('produces 32-byte keys, distinct between calls', async () => {
    const a = await generateDataKey();
    const b = await generateDataKey();
    expect(a.length).toBe(DATA_KEY_BYTES);
    expect(b.length).toBe(DATA_KEY_BYTES);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('keystore: wrap/unwrap with KEK', () => {
  it('round-trips', async () => {
    const dataKey = await generateDataKey();
    const kek = await generateKey();
    const wrapped = await wrapDataKey({ dataKey, kek, userId: USER_A });
    const unwrapped = await unwrapDataKey({ wrappedDk: wrapped, kek, userId: USER_A });
    expect(Array.from(unwrapped)).toEqual(Array.from(dataKey));
  });

  it('refuses to unwrap with the wrong KEK', async () => {
    const dataKey = await generateDataKey();
    const kek = await generateKey();
    const wrongKek = await generateKey();
    const wrapped = await wrapDataKey({ dataKey, kek, userId: USER_A });
    await expect(
      unwrapDataKey({ wrappedDk: wrapped, kek: wrongKek, userId: USER_A }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('refuses to unwrap if user_id does not match (AAD binding)', async () => {
    const dataKey = await generateDataKey();
    const kek = await generateKey();
    const wrapped = await wrapDataKey({ dataKey, kek, userId: USER_A });
    await expect(
      unwrapDataKey({ wrappedDk: wrapped, kek, userId: USER_B }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('refuses to unwrap if the wrapped key is corrupted', async () => {
    const dataKey = await generateDataKey();
    const kek = await generateKey();
    const wrapped = await wrapDataKey({ dataKey, kek, userId: USER_A });

    const corrupted = new Uint8Array(wrapped);
    corrupted[corrupted.length - 1] ^= 0x01;

    await expect(
      unwrapDataKey({ wrappedDk: corrupted, kek, userId: USER_A }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('refuses to unwrap a buffer too short to contain nonce + tag', async () => {
    const kek = await generateKey();
    await expect(
      unwrapDataKey({
        wrappedDk: new Uint8Array(10),
        kek,
        userId: USER_A,
      }),
    ).rejects.toThrow();
  });

  it('produces different ciphertext on each wrap call (random nonce)', async () => {
    const dataKey = await generateDataKey();
    const kek = await generateKey();
    const w1 = await wrapDataKey({ dataKey, kek, userId: USER_A });
    const w2 = await wrapDataKey({ dataKey, kek, userId: USER_A });
    expect(Array.from(w1)).not.toEqual(Array.from(w2));
  });
});

describe('keystore: wrap/unwrap with recovery KEK', () => {
  it('round-trips', async () => {
    const dataKey = await generateDataKey();
    const recoveryKek = await generateKey();
    const wrapped = await wrapDataKeyForRecovery({
      dataKey,
      recoveryKek,
      userId: USER_A,
    });
    const unwrapped = await unwrapDataKeyFromRecovery({
      wrappedDk: wrapped,
      recoveryKek,
      userId: USER_A,
    });
    expect(Array.from(unwrapped)).toEqual(Array.from(dataKey));
  });

  it('a recovery wrap cannot be unwrapped with the password-AAD path', async () => {
    // Critical: the two AADs are distinct, so a wrap made via the recovery
    // path must NOT decrypt under the dk-wrap AAD even with the same key.
    const dataKey = await generateDataKey();
    const sharedKey = await generateKey();
    const wrapped = await wrapDataKeyForRecovery({
      dataKey,
      recoveryKek: sharedKey,
      userId: USER_A,
    });
    await expect(
      unwrapDataKey({ wrappedDk: wrapped, kek: sharedKey, userId: USER_A }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('keystore: wrap input validation', () => {
  it('rejects DK of wrong size', async () => {
    const kek = await generateKey();
    await expect(
      wrapDataKey({
        dataKey: new Uint8Array(DATA_KEY_BYTES - 1),
        kek,
        userId: USER_A,
      }),
    ).rejects.toThrow(/dataKey must be/);
  });
});
