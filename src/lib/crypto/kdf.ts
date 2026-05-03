/**
 * Argon2id password-based KDF. Spec: docs/security/encryption.md §4.2.
 *
 * Parameters: t=3, m=64 MiB, p=1, output=32B. Tuned for browser/mobile
 * feasibility; revisit annually. Bumping requires a new enc_version since
 * old wrapped DKs were derived under prior parameters.
 */

import { ready, sodium } from './sodium';

export const KDF_OPSLIMIT = 3;
export const KDF_MEMLIMIT = 64 * 1024 * 1024;
export const KDF_SALT_BYTES = 16;
export const KDF_KEY_BYTES = 32;

export async function generateSalt(): Promise<Uint8Array> {
  await ready();
  return sodium.randombytes_buf(KDF_SALT_BYTES);
}

/**
 * Derive a key from a password using Argon2id.
 *
 * @param password Raw password bytes (UTF-8 encoded). Caller is responsible
 *                 for normalizing/encoding before passing.
 * @param salt     Per-user salt (16 bytes) stored server-side.
 * @param outputBytes Length of the derived key (default 32).
 */
export async function deriveKey(
  password: Uint8Array,
  salt: Uint8Array,
  outputBytes: number = KDF_KEY_BYTES,
): Promise<Uint8Array> {
  await ready();
  if (salt.length !== KDF_SALT_BYTES) {
    throw new Error(`salt must be ${KDF_SALT_BYTES} bytes, got ${salt.length}`);
  }
  if (!Number.isInteger(outputBytes) || outputBytes < 16 || outputBytes > 64) {
    throw new Error(`outputBytes must be in [16, 64], got ${outputBytes}`);
  }
  // Normalize cross-realm typed arrays (e.g. TextEncoder output in jsdom).
  const passwordCopy =
    password.constructor === Uint8Array ? password : new Uint8Array(password);
  const saltCopy =
    salt.constructor === Uint8Array ? salt : new Uint8Array(salt);
  return sodium.crypto_pwhash(
    outputBytes,
    passwordCopy,
    saltCopy,
    KDF_OPSLIMIT,
    KDF_MEMLIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}
