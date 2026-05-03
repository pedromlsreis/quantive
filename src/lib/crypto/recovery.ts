/**
 * Recovery code generation, normalization, validation. Spec: docs/security/encryption.md §10.
 *
 * Format: BIP-39 24-word mnemonic (256 bits of entropy + 8-bit checksum).
 * The checksum catches typos with overwhelming probability — invalid codes
 * are rejected before they're ever fed to the KDF.
 *
 * The mnemonic string itself (not the entropy) is the KDF input. This keeps
 * the recovery flow symmetric with the password flow and avoids a custom
 * code path.
 */

import {
  generateMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const RECOVERY_ENTROPY_BITS = 256;
export const RECOVERY_WORD_COUNT = 24;

export function generateRecoveryCode(): string {
  return generateMnemonic(wordlist, RECOVERY_ENTROPY_BITS);
}

/**
 * Canonicalize user-typed recovery code: NFKD, lowercase, single-space-
 * separated. Tolerates extra whitespace, mixed case, and exotic Unicode
 * forms (which still happen on iOS keyboards).
 */
export function normalizeRecoveryCode(input: string): string {
  return input.normalize('NFKD').toLowerCase().trim().split(/\s+/).join(' ');
}

export function isValidRecoveryCode(code: string): boolean {
  try {
    return validateMnemonic(normalizeRecoveryCode(code), wordlist);
  } catch {
    return false;
  }
}

/**
 * Convert the recovery code into KDF input bytes. Throws if the code is
 * malformed (validateMnemonic fails) so callers cannot accidentally derive
 * a key from garbage.
 */
export function recoveryCodeToKdfInput(code: string): Uint8Array {
  const normalized = normalizeRecoveryCode(code);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error('invalid recovery code (failed BIP-39 checksum)');
  }
  return new TextEncoder().encode(normalized);
}

/**
 * Exposed only for debugging / round-trip testing. Production code does NOT
 * need the entropy bytes — the mnemonic string is what feeds the KDF.
 */
export function recoveryCodeToEntropy(code: string): Uint8Array {
  return mnemonicToEntropy(normalizeRecoveryCode(code), wordlist);
}
