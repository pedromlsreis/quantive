/**
 * Wire format shared by every wrapped key (DK under KEK or recovery KEK,
 * portfolio key under DK or invite secret): nonce(24) || ciphertext_with_tag.
 * Spec: docs/security/encryption.md §7.1.
 */

import { AEAD_NONCE_BYTES } from './aead';

export function pack(nonce: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export function unpack(packed: Uint8Array): { nonce: Uint8Array; ciphertext: Uint8Array } {
  if (packed.length <= AEAD_NONCE_BYTES) {
    throw new Error(`wrapped key too short: ${packed.length} bytes`);
  }
  return {
    nonce: packed.subarray(0, AEAD_NONCE_BYTES),
    ciphertext: packed.subarray(AEAD_NONCE_BYTES),
  };
}
