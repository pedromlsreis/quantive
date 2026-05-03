/**
 * AAD construction. Spec: docs/security/encryption.md §6.
 *
 * AAD binds ciphertext to context (user, version, kind). The server cannot
 * substitute one user's ciphertext for another's without decryption failing.
 *
 * All values are deterministic from inputs — never randomized — so the same
 * inputs at encrypt time and decrypt time produce byte-identical AAD.
 */

const AAD_DK_PREFIX = utf8('nwa-dk-v1');
const AAD_SNAP_PREFIX = utf8('nwa-snap-v1');
const AAD_REC_PREFIX = utf8('nwa-rec-v1');
const ZERO = new Uint8Array([0x00]);

export const UUID_BYTES = 16;
export const ENC_VERSION_BYTES = 4;

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/**
 * RFC 4122 canonical hex form (with hyphens) -> 16 raw bytes.
 * Strict: rejects malformed input rather than silently mangling.
 */
export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== UUID_BYTES * 2 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`invalid UUID: ${uuid}`);
  }
  const out = new Uint8Array(UUID_BYTES);
  for (let i = 0; i < UUID_BYTES; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** AAD for wrapping/unwrapping the DK with the password-derived KEK. */
export function aadForDataKeyWrap(userId: string): Uint8Array {
  return concat(AAD_DK_PREFIX, ZERO, uuidToBytes(userId));
}

/**
 * AAD for snapshot ciphertext.
 *
 * Includes encVersion so a server cannot silently downgrade a v1 row to
 * a v0 (legacy plaintext) marker without breaking integrity.
 */
export function aadForSnapshot(userId: string, encVersion: number): Uint8Array {
  if (
    !Number.isInteger(encVersion) ||
    encVersion < 0 ||
    encVersion > 0xffffffff
  ) {
    throw new Error(`encVersion must be a u32 integer, got ${encVersion}`);
  }
  const v = new Uint8Array(ENC_VERSION_BYTES);
  new DataView(v.buffer).setUint32(0, encVersion, /* littleEndian = */ true);
  return concat(AAD_SNAP_PREFIX, ZERO, uuidToBytes(userId), v);
}

/** AAD for wrapping/unwrapping the DK with the recovery-code-derived KEK. */
export function aadForRecoveryWrap(userId: string): Uint8Array {
  return concat(AAD_REC_PREFIX, ZERO, uuidToBytes(userId));
}
