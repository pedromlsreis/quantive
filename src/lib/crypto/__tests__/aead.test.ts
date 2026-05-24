/**
 * AEAD tests. KAT vector from draft-irtf-cfrg-xchacha §A.3.1
 * (https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha-03#section-a.3).
 *
 * Round-trip, tamper detection, AAD-mismatch, and fuzz tests cover the
 * security-relevant behaviors that callers depend on.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { getSodium, ready } from '../sodium';
import {
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  AEAD_TAG_BYTES,
  DecryptionError,
  decrypt,
  encrypt,
  generateKey,
  generateNonce,
} from '../aead';

// libsodium loads lazily now (dynamic import); ensure it is ready before any
// test reads sodium directly.
beforeAll(async () => {
  await ready();
});

function hex(s: string): Uint8Array {
  const clean = s.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) throw new Error('bad hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// KAT from draft-irtf-cfrg-xchacha-03 §A.3.1. Cross-validates our
// XChaCha20-Poly1305 binding against the IETF reference output byte-for-byte.
const VECTOR = {
  plaintext: utf8(
    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
  ),
  aad: hex('50 51 52 53 c0 c1 c2 c3 c4 c5 c6 c7'),
  key: hex(`
    80 81 82 83 84 85 86 87 88 89 8a 8b 8c 8d 8e 8f
    90 91 92 93 94 95 96 97 98 99 9a 9b 9c 9d 9e 9f
  `),
  nonce: hex(`
    40 41 42 43 44 45 46 47 48 49 4a 4b 4c 4d 4e 4f
    50 51 52 53 54 55 56 57
  `),
  ciphertext: hex(`
    bd 6d 17 9d 3e 83 d4 3b 95 76 57 94 93 c0 e9 39
    57 2a 17 00 25 2b fa cc be d2 90 2c 21 39 6c bb
    73 1c 7f 1b 0b 4a a6 44 0b f3 a8 2f 4e da 7e 39
    ae 64 c6 70 8c 54 c2 16 cb 96 b7 2e 12 13 b4 52
    2f 8c 9b a4 0d b5 d9 45 b1 1b 69 b9 82 c1 bb 9e
    3f 3f ac 2b c3 69 48 8f 76 b2 38 35 65 d3 ff f9
    21 f9 66 4c 97 63 7d a9 76 88 12 f6 15 c6 8b 13
    b5 2e
  `),
  tag: hex('c0 87 59 24 c1 c7 98 79 47 de af d8 78 0a cf 49'),
};

describe('AEAD: XChaCha20-Poly1305 — IETF draft KAT', () => {
  it('matches the IETF reference ciphertext and tag byte-for-byte', async () => {
    const ct = await encrypt({
      key: VECTOR.key,
      nonce: VECTOR.nonce,
      plaintext: VECTOR.plaintext,
      aad: VECTOR.aad,
    });
    expect(ct.length).toBe(VECTOR.plaintext.length + AEAD_TAG_BYTES);

    const body = ct.subarray(0, VECTOR.plaintext.length);
    const tag = ct.subarray(VECTOR.plaintext.length);
    expect(Array.from(body)).toEqual(Array.from(VECTOR.ciphertext));
    expect(Array.from(tag)).toEqual(Array.from(VECTOR.tag));

    const pt = await decrypt({
      key: VECTOR.key,
      nonce: VECTOR.nonce,
      ciphertext: ct,
      aad: VECTOR.aad,
    });
    expect(Array.from(pt)).toEqual(Array.from(VECTOR.plaintext));
  });

  it('encryption is deterministic for fixed (key, nonce, plaintext, aad)', async () => {
    const a = await encrypt({
      key: VECTOR.key,
      nonce: VECTOR.nonce,
      plaintext: VECTOR.plaintext,
      aad: VECTOR.aad,
    });
    const b = await encrypt({
      key: VECTOR.key,
      nonce: VECTOR.nonce,
      plaintext: VECTOR.plaintext,
      aad: VECTOR.aad,
    });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('AEAD: round-trip', () => {
  it('decrypts what it encrypted', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const plaintext = utf8('hello, world');
    const aad = utf8('ctx-1');

    const ct = await encrypt({ key, nonce, plaintext, aad });
    const pt = await decrypt({ key, nonce, ciphertext: ct, aad });

    expect(Array.from(pt)).toEqual(Array.from(plaintext));
  });

  it('produces ciphertext exactly tag-bytes longer than plaintext', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const plaintext = new Uint8Array(100);
    const ct = await encrypt({ key, nonce, plaintext, aad: new Uint8Array(0) });
    expect(ct.length).toBe(plaintext.length + AEAD_TAG_BYTES);
  });

  it('handles empty plaintext', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const aad = utf8('e');
    const ct = await encrypt({ key, nonce, plaintext: new Uint8Array(0), aad });
    expect(ct.length).toBe(AEAD_TAG_BYTES);
    const pt = await decrypt({ key, nonce, ciphertext: ct, aad });
    expect(pt.length).toBe(0);
  });

  it('handles large plaintext (1 MiB)', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const aad = utf8('big');
    const plaintext = getSodium().randombytes_buf(1024 * 1024);
    const ct = await encrypt({ key, nonce, plaintext, aad });
    const pt = await decrypt({ key, nonce, ciphertext: ct, aad });
    expect(pt.length).toBe(plaintext.length);
    // Full-buffer compare. A 32-byte head spot-check would miss corruption
    // anywhere past the first block — the whole point of exercising 1 MiB is
    // to flush out chunking/streaming bugs that only show up at scale.
    // Compare via TypedArray equality (not Array.from) to avoid allocating
    // two 1M-element JS arrays just to assert.
    let same = pt.length === plaintext.length;
    for (let i = 0; same && i < pt.length; i++) {
      if (pt[i] !== plaintext[i]) same = false;
    }
    expect(same).toBe(true);
    // Generous budget: cold-start libsodium WASM + a 1 MiB round-trip is
    // ~4-8s on a warm machine but has been seen to take >30s on cold
    // Windows CI runners.
  }, 60_000);
});

describe('AEAD: tamper detection', () => {
  it('rejects ciphertext with a flipped byte in the body', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const plaintext = utf8('secret data');
    const aad = utf8('ctx');
    const ct = await encrypt({ key, nonce, plaintext, aad });

    const tampered = new Uint8Array(ct);
    tampered[0] ^= 0x01;

    await expect(
      decrypt({ key, nonce, ciphertext: tampered, aad }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects ciphertext with a flipped byte in the auth tag', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const plaintext = utf8('secret data');
    const aad = utf8('ctx');
    const ct = await encrypt({ key, nonce, plaintext, aad });

    const tampered = new Uint8Array(ct);
    tampered[tampered.length - 1] ^= 0x01;

    await expect(
      decrypt({ key, nonce, ciphertext: tampered, aad }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects with the wrong nonce', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const wrongNonce = await generateNonce();
    const aad = utf8('ctx');
    const ct = await encrypt({ key, nonce, plaintext: utf8('x'), aad });

    await expect(
      decrypt({ key, nonce: wrongNonce, ciphertext: ct, aad }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects with the wrong key', async () => {
    const key = await generateKey();
    const wrongKey = await generateKey();
    const nonce = await generateNonce();
    const aad = utf8('ctx');
    const ct = await encrypt({ key, nonce, plaintext: utf8('x'), aad });

    await expect(
      decrypt({ key: wrongKey, nonce, ciphertext: ct, aad }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects on AAD mismatch', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const ct = await encrypt({
      key,
      nonce,
      plaintext: utf8('x'),
      aad: utf8('ctx-A'),
    });

    await expect(
      decrypt({ key, nonce, ciphertext: ct, aad: utf8('ctx-B') }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });

  it('rejects ciphertext shorter than the auth tag', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    await expect(
      decrypt({
        key,
        nonce,
        ciphertext: new Uint8Array(AEAD_TAG_BYTES - 1),
        aad: new Uint8Array(0),
      }),
    ).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe('AEAD: input validation', () => {
  it('rejects key of wrong size', async () => {
    await expect(
      encrypt({
        key: new Uint8Array(AEAD_KEY_BYTES - 1),
        nonce: new Uint8Array(AEAD_NONCE_BYTES),
        plaintext: new Uint8Array(0),
        aad: new Uint8Array(0),
      }),
    ).rejects.toThrow(/key must be/);
  });

  it('rejects nonce of wrong size', async () => {
    await expect(
      encrypt({
        key: new Uint8Array(AEAD_KEY_BYTES),
        nonce: new Uint8Array(AEAD_NONCE_BYTES - 1),
        plaintext: new Uint8Array(0),
        aad: new Uint8Array(0),
      }),
    ).rejects.toThrow(/nonce must be/);
  });
});

describe('AEAD: fuzz (random ciphertext rejection)', () => {
  // Decryption with random bytes must never succeed. If it ever does, we
  // have either a tag-verification bug or an oracle leak. Run enough
  // iterations to make accidental success vanishingly improbable.
  it('rejects 100 random ciphertexts', async () => {
    const key = await generateKey();
    const nonce = await generateNonce();
    const aad = utf8('fuzz');
    for (let i = 0; i < 100; i++) {
      const len = AEAD_TAG_BYTES + Math.floor(Math.random() * 256);
      const ct = getSodium().randombytes_buf(len);
      await expect(
        decrypt({ key, nonce, ciphertext: ct, aad }),
      ).rejects.toBeInstanceOf(DecryptionError);
    }
  });
});
