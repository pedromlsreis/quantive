// Genuine XChaCha20-Poly1305 output for the landing privacy figure.
//
// Produced once with `encrypt` from src/lib/crypto under a throwaway demo key
// and nonce, with the same AAD framing the app uses for snapshots
// (docs/security/encryption.md §6.2). sealFixture.test.ts re-encrypts and
// decrypts these constants, so the page can never drift into fake ciphertext.
// If the plaintext changes, regenerate the ciphertext with a NEW nonce: reusing
// a nonce for a different plaintext is exactly the mistake a reader will look for.

/** Published on purpose: it protects nothing but this example. */
export const SEAL_DEMO_KEY_HEX = 'da754ab01b7d04f8c9093c3fe7b2d7b0d4c2b2bf4c40802c4d5f5946f54942b0';
export const SEAL_NONCE_HEX = 'fda4b8b72870e21c1ebae4a0f26354ff45fd846168a2caa1';
export const SEAL_USER_ID = '0d3e0d3e-0000-4000-8000-000000000001';

/**
 * One entry, serialised the way cloudSync serialises portfolio facts.
 * The hero shows the pension as held in GBP, so it is stored in GBP: facts
 * keep their native currency and are converted only for display.
 */
export const SEAL_PLAINTEXT =
  '{"date":"2026-09-01T00:00:00.000Z","idSource":"Pension Plan","sourceVl":31732.65,"currency":"GBP"}';

/** Ciphertext with the 16-byte Poly1305 tag appended (libsodium wire format). */
export const SEAL_CIPHERTEXT_HEX =
  'f490dbf7e73ec738862e4e1fb58884b17516d055055ce118512c4ff79d46d82b774f19e1f7a3984035029873f4ce1d' +
  '09eefdfc9ff936f9e64bc6b2e4b726168ef23cc5023ddb98030975e91c97c66deb1312c4853270733dc7da95c27985' +
  '5ede9e02d17fa4ff8fabf2cbc16a900df9a04531';

export const SEAL_TAG_BYTES = 16;
