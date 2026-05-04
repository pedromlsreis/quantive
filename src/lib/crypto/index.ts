/**
 * Public API for the Quantive E2E encryption module.
 *
 * Spec: docs/security/encryption.md
 *
 * Design constraint: this module is pure (no I/O, no network, no React, no
 * Supabase). It is meant to be reviewed in isolation. Callers in higher
 * layers do all the persistence.
 */

export { ready } from './sodium';

export {
  AEAD_KEY_BYTES,
  AEAD_NONCE_BYTES,
  AEAD_TAG_BYTES,
  DecryptionError,
  decrypt,
  encrypt,
  generateKey,
  generateNonce,
} from './aead';

export {
  KDF_KEY_BYTES,
  KDF_MEMLIMIT,
  KDF_OPSLIMIT,
  KDF_SALT_BYTES,
  deriveKey,
  generateSalt,
} from './kdf';

export {
  ENC_VERSION_BYTES,
  UUID_BYTES,
  aadForDataKeyWrap,
  aadForRecoveryWrap,
  aadForSnapshot,
  uuidToBytes,
} from './aad';

export {
  DATA_KEY_BYTES,
  generateDataKey,
  unwrapDataKey,
  unwrapDataKeyFromRecovery,
  wrapDataKey,
  wrapDataKeyForRecovery,
} from './keystore';

export type { EncryptedSnapshot } from './snapshot';
export {
  ENC_VERSION,
  decryptSnapshot,
  encryptSnapshot,
} from './snapshot';

export {
  RECOVERY_WORD_COUNT,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeToEntropy,
  recoveryCodeToKdfInput,
} from './recovery';
