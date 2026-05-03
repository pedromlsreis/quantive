// Sumo build: includes Argon2id (`crypto_pwhash`). The non-sumo build omits
// password-hashing primitives. Spec: docs/security/encryption.md §4.
import sodium from 'libsodium-wrappers-sumo';

export async function ready(): Promise<void> {
  await sodium.ready;
}

export { sodium };
