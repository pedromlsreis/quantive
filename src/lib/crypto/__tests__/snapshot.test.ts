import { describe, expect, it } from 'vitest';
import { DecryptionError } from '../aead';
import { generateDataKey } from '../keystore';
import { ENC_VERSION, decryptSnapshot, encryptSnapshot } from '../snapshot';

const USER_A = '550e8400-e29b-41d4-a716-446655440000';
const USER_B = '550e8400-e29b-41d4-a716-446655440001';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('snapshot: round-trip', () => {
  it('decrypts what it encrypted', async () => {
    const dataKey = await generateDataKey();
    const plaintext = utf8(JSON.stringify({ facts: [], refSources: [] }));
    const enc = await encryptSnapshot({ plaintext, dataKey, userId: USER_A });
    expect(enc.encVersion).toBe(ENC_VERSION);
    const dec = await decryptSnapshot({
      encrypted: enc,
      dataKey,
      userId: USER_A,
    });
    expect(Array.from(dec)).toEqual(Array.from(plaintext));
  });

  it('produces a fresh nonce on every encryption', async () => {
    const dataKey = await generateDataKey();
    const plaintext = utf8('same content');
    const e1 = await encryptSnapshot({ plaintext, dataKey, userId: USER_A });
    const e2 = await encryptSnapshot({ plaintext, dataKey, userId: USER_A });
    expect(Array.from(e1.nonce)).not.toEqual(Array.from(e2.nonce));
    expect(Array.from(e1.ciphertext)).not.toEqual(Array.from(e2.ciphertext));
  });
});

describe('snapshot: AAD binding', () => {
  it('rejects decryption under a different user_id', async () => {
    const dataKey = await generateDataKey();
    const plaintext = utf8('alice payload');
    const enc = await encryptSnapshot({ plaintext, dataKey, userId: USER_A });
    await expect(
      decryptSnapshot({ encrypted: enc, dataKey, userId: USER_B }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects an attempt to silently re-tag a v1 ciphertext as v2', async () => {
    const dataKey = await generateDataKey();
    const plaintext = utf8('payload');
    const enc = await encryptSnapshot({ plaintext, dataKey, userId: USER_A });

    // Caller forces a wrong version. decryptSnapshot rejects unknown
    // versions outright (no decrypt attempt), which is the safe behavior.
    await expect(
      decryptSnapshot({
        encrypted: { ...enc, encVersion: 2 },
        dataKey,
        userId: USER_A,
      }),
    ).rejects.toThrow(/unsupported enc_version/);
  });
});

describe('snapshot: tamper detection', () => {
  it('rejects a flipped ciphertext byte', async () => {
    const dataKey = await generateDataKey();
    const enc = await encryptSnapshot({
      plaintext: utf8('x'),
      dataKey,
      userId: USER_A,
    });
    const tampered = new Uint8Array(enc.ciphertext);
    tampered[0] ^= 0xff;
    await expect(
      decryptSnapshot({
        encrypted: { ...enc, ciphertext: tampered },
        dataKey,
        userId: USER_A,
      }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects a flipped nonce byte', async () => {
    const dataKey = await generateDataKey();
    const enc = await encryptSnapshot({
      plaintext: utf8('x'),
      dataKey,
      userId: USER_A,
    });
    const tamperedNonce = new Uint8Array(enc.nonce);
    tamperedNonce[0] ^= 0xff;
    await expect(
      decryptSnapshot({
        encrypted: { ...enc, nonce: tamperedNonce },
        dataKey,
        userId: USER_A,
      }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});
