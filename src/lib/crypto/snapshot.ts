/**
 * Snapshot encryption. Spec: docs/security/encryption.md §9.
 *
 * Encrypts an already-serialized portfolio payload under the user's DK.
 * This module is JSON-agnostic — callers pass UTF-8 bytes. That keeps the
 * crypto module pure (no Date / JSON shape coupling).
 */

import { decrypt, encrypt, generateNonce } from './aead';
import { aadForSnapshot } from './aad';

/** Bumped only when the wire format or AEAD primitives change. */
export const ENC_VERSION = 1;

export interface EncryptedSnapshot {
  /** AEAD ciphertext + tag, as produced by libsodium. */
  ciphertext: Uint8Array;
  /** 24-byte XChaCha20 nonce. */
  nonce: Uint8Array;
  /** Spec version of the encryption (currently 1). */
  encVersion: number;
}

export async function encryptSnapshot(args: {
  plaintext: Uint8Array;
  dataKey: Uint8Array;
  userId: string;
}): Promise<EncryptedSnapshot> {
  const nonce = await generateNonce();
  const ciphertext = await encrypt({
    key: args.dataKey,
    nonce,
    plaintext: args.plaintext,
    aad: aadForSnapshot(args.userId, ENC_VERSION),
  });
  return { ciphertext, nonce, encVersion: ENC_VERSION };
}

export async function decryptSnapshot(args: {
  encrypted: EncryptedSnapshot;
  dataKey: Uint8Array;
  userId: string;
}): Promise<Uint8Array> {
  // Reject unknown versions — never silently fall through. A future build
  // that adds enc_version=2 must be explicitly taught about it.
  if (args.encrypted.encVersion !== ENC_VERSION) {
    throw new Error(
      `unsupported enc_version: ${args.encrypted.encVersion} ` +
        `(this build supports ${ENC_VERSION})`,
    );
  }
  return decrypt({
    key: args.dataKey,
    nonce: args.encrypted.nonce,
    ciphertext: args.encrypted.ciphertext,
    // AAD must use the version from the ciphertext, not a hardcoded one,
    // so a downgrade attempt fails the AEAD tag check.
    aad: aadForSnapshot(args.userId, args.encrypted.encVersion),
  });
}
