/**
 * XChaCha20-Poly1305 AEAD wrapper. Spec: docs/security/encryption.md §4.1.
 *
 * 256-bit key, 192-bit nonce (random nonces are safe), 128-bit auth tag.
 * The library returns ciphertext with the tag appended; we keep that wire
 * format and do not split it.
 */

import { ready, getSodium } from './sodium';

export const AEAD_KEY_BYTES = 32;
export const AEAD_NONCE_BYTES = 24;
export const AEAD_TAG_BYTES = 16;

export class DecryptionError extends Error {
  constructor(message = 'AEAD decryption failed') {
    super(message);
    this.name = 'DecryptionError';
  }
}

function assertKey(key: Uint8Array): void {
  if (key.length !== AEAD_KEY_BYTES) {
    throw new Error(`key must be ${AEAD_KEY_BYTES} bytes, got ${key.length}`);
  }
}

function assertNonce(nonce: Uint8Array): void {
  if (nonce.length !== AEAD_NONCE_BYTES) {
    throw new Error(`nonce must be ${AEAD_NONCE_BYTES} bytes, got ${nonce.length}`);
  }
}

/**
 * libsodium's `constructor === Uint8Array` check rejects cross-realm typed
 * arrays — notably the output of `TextEncoder.encode()` in jsdom v20, which
 * is a different Uint8Array constructor than the one libsodium captured at
 * module load. Copy into a fresh array in the current realm before passing.
 */
function realm(buf: Uint8Array): Uint8Array {
  if (buf.constructor === Uint8Array) return buf;
  const out = new Uint8Array(buf.length);
  out.set(buf);
  return out;
}

export async function generateKey(): Promise<Uint8Array> {
  await ready();
  return getSodium().randombytes_buf(AEAD_KEY_BYTES);
}

export async function generateNonce(): Promise<Uint8Array> {
  await ready();
  return getSodium().randombytes_buf(AEAD_NONCE_BYTES);
}

export async function encrypt(args: {
  key: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
  aad: Uint8Array;
}): Promise<Uint8Array> {
  await ready();
  assertKey(args.key);
  assertNonce(args.nonce);
  return getSodium().crypto_aead_xchacha20poly1305_ietf_encrypt(
    realm(args.plaintext),
    realm(args.aad),
    null, // nsec is unused for XChaCha20-Poly1305
    realm(args.nonce),
    realm(args.key),
  );
}

export async function decrypt(args: {
  key: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  aad: Uint8Array;
}): Promise<Uint8Array> {
  await ready();
  assertKey(args.key);
  assertNonce(args.nonce);
  if (args.ciphertext.length < AEAD_TAG_BYTES) {
    throw new DecryptionError('ciphertext shorter than auth tag');
  }
  try {
    return getSodium().crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      realm(args.ciphertext),
      realm(args.aad),
      realm(args.nonce),
      realm(args.key),
    );
  } catch {
    // libsodium throws a generic Error on auth failure. We do NOT propagate
    // its message: returning a uniform error avoids accidental oracles.
    throw new DecryptionError();
  }
}
