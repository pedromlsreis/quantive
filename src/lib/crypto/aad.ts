/**
 * AAD construction. Spec: docs/security/encryption.md §6, §15.1.3.
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
const AAD_PK_PREFIX = utf8('nwa-pk-v1');
const AAD_PF_PREFIX = utf8('nwa-pf-v1');
const AAD_INV_PREFIX = utf8('nwa-inv-v1');
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

function u32le(value: number, name: string): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${name} must be a u32 integer, got ${value}`);
  }
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, /* littleEndian = */ true);
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
  return concat(AAD_SNAP_PREFIX, ZERO, uuidToBytes(userId), u32le(encVersion, 'encVersion'));
}

/** AAD for wrapping/unwrapping the DK with the recovery-code-derived KEK. */
export function aadForRecoveryWrap(userId: string): Uint8Array {
  return concat(AAD_REC_PREFIX, ZERO, uuidToBytes(userId));
}

/**
 * AAD for a portfolio key (PK) wrapped under a member's DK. Bound to both the
 * member and the portfolio, so a wrap can't be moved to another of either.
 */
export function aadForPortfolioKeyWrap(userId: string, portfolioId: string, keyEpoch: number): Uint8Array {
  return concat(AAD_PK_PREFIX, ZERO, uuidToBytes(userId), uuidToBytes(portfolioId), u32le(keyEpoch, 'keyEpoch'));
}

/**
 * AAD for an extra portfolio's blob. Bound to the portfolio rather than a
 * user because any member may write it.
 */
export function aadForPortfolioData(portfolioId: string, keyEpoch: number, encVersion: number): Uint8Array {
  return concat(
    AAD_PF_PREFIX,
    ZERO,
    uuidToBytes(portfolioId),
    u32le(keyEpoch, 'keyEpoch'),
    u32le(encVersion, 'encVersion'),
  );
}

/** AAD for a PK wrapped under a one-time invite secret. */
export function aadForInviteWrap(inviteId: string, portfolioId: string, keyEpoch: number): Uint8Array {
  return concat(AAD_INV_PREFIX, ZERO, uuidToBytes(inviteId), uuidToBytes(portfolioId), u32le(keyEpoch, 'keyEpoch'));
}
