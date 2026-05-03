/**
 * Data Key (DK) lifecycle. Spec: docs/security/encryption.md §5, §8.
 *
 * The DK is generated once per user at signup, then wrapped (encrypted) under
 * the password-derived KEK and optionally a recovery-derived KEK. Wire format
 * for both wraps: nonce(24) || ciphertext_with_tag.
 */

import {
  AEAD_NONCE_BYTES,
  decrypt,
  encrypt,
  generateKey,
  generateNonce,
} from './aead';
import {
  aadForDataKeyWrap,
  aadForRecoveryWrap,
} from './aad';

export const DATA_KEY_BYTES = 32;

export async function generateDataKey(): Promise<Uint8Array> {
  return generateKey();
}

function pack(nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

function unpack(packed: Uint8Array): { nonce: Uint8Array; ciphertext: Uint8Array } {
  if (packed.length <= AEAD_NONCE_BYTES) {
    throw new Error(`wrapped key too short: ${packed.length} bytes`);
  }
  return {
    nonce: packed.subarray(0, AEAD_NONCE_BYTES),
    ciphertext: packed.subarray(AEAD_NONCE_BYTES),
  };
}

export async function wrapDataKey(args: {
  dataKey: Uint8Array;
  kek: Uint8Array;
  userId: string;
}): Promise<Uint8Array> {
  if (args.dataKey.length !== DATA_KEY_BYTES) {
    throw new Error(`dataKey must be ${DATA_KEY_BYTES} bytes`);
  }
  const nonce = await generateNonce();
  const ciphertext = await encrypt({
    key: args.kek,
    nonce,
    plaintext: args.dataKey,
    aad: aadForDataKeyWrap(args.userId),
  });
  return pack(nonce, ciphertext);
}

export async function unwrapDataKey(args: {
  wrappedDk: Uint8Array;
  kek: Uint8Array;
  userId: string;
}): Promise<Uint8Array> {
  const { nonce, ciphertext } = unpack(args.wrappedDk);
  return decrypt({
    key: args.kek,
    nonce,
    ciphertext,
    aad: aadForDataKeyWrap(args.userId),
  });
}

export async function wrapDataKeyForRecovery(args: {
  dataKey: Uint8Array;
  recoveryKek: Uint8Array;
  userId: string;
}): Promise<Uint8Array> {
  if (args.dataKey.length !== DATA_KEY_BYTES) {
    throw new Error(`dataKey must be ${DATA_KEY_BYTES} bytes`);
  }
  const nonce = await generateNonce();
  const ciphertext = await encrypt({
    key: args.recoveryKek,
    nonce,
    plaintext: args.dataKey,
    aad: aadForRecoveryWrap(args.userId),
  });
  return pack(nonce, ciphertext);
}

export async function unwrapDataKeyFromRecovery(args: {
  wrappedDk: Uint8Array;
  recoveryKek: Uint8Array;
  userId: string;
}): Promise<Uint8Array> {
  const { nonce, ciphertext } = unpack(args.wrappedDk);
  return decrypt({
    key: args.recoveryKek,
    nonce,
    ciphertext,
    aad: aadForRecoveryWrap(args.userId),
  });
}
