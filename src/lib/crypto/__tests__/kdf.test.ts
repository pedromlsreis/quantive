/**
 * KDF tests.
 *
 * libsodium's `crypto_pwhash` does not expose Argon2id parallelism (p=1 is
 * hard-coded), so we cannot match the multi-lane RFC 9106 test vectors
 * directly. Instead we verify:
 *
 *   1. determinism (same inputs → same output, on a smaller iteration count
 *      so the test runs in reasonable time),
 *   2. salt sensitivity,
 *   3. password sensitivity,
 *   4. input validation,
 *
 * and let libsodium's own KAT cover the algorithm itself.
 *
 * These tests use the production parameters (t=3, m=64MiB) for a single
 * derivation to confirm the configured production path produces a value of
 * the right shape; subsequent tests use smaller parameters for speed.
 */

import { describe, expect, it } from 'vitest';
import {
  KDF_KEY_BYTES,
  KDF_MEMLIMIT,
  KDF_OPSLIMIT,
  KDF_SALT_BYTES,
  deriveKey,
  generateSalt,
} from '../kdf';

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('KDF: configuration', () => {
  it('uses Argon2id production parameters', () => {
    expect(KDF_OPSLIMIT).toBe(3);
    expect(KDF_MEMLIMIT).toBe(64 * 1024 * 1024);
    expect(KDF_SALT_BYTES).toBe(16);
    expect(KDF_KEY_BYTES).toBe(32);
  });

  it('generateSalt yields the configured salt size and is non-deterministic', async () => {
    const a = await generateSalt();
    const b = await generateSalt();
    expect(a.length).toBe(KDF_SALT_BYTES);
    expect(b.length).toBe(KDF_SALT_BYTES);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('KDF: deriveKey', () => {
  // Single full-cost derivation: confirms the configured production path
  // produces a 32-byte output. Slow (~1s) but must run at least once.
  it('produces a 32-byte output at production parameters', async () => {
    const password = utf8('correct horse battery staple');
    const salt = await generateSalt();
    const key = await deriveKey(password, salt);
    expect(key.length).toBe(KDF_KEY_BYTES);
  }, 30_000);

  it('is deterministic for fixed (password, salt)', async () => {
    const password = utf8('p');
    const salt = new Uint8Array(KDF_SALT_BYTES).fill(0xa5);
    const k1 = await deriveKey(password, salt);
    const k2 = await deriveKey(password, salt);
    expect(Array.from(k1)).toEqual(Array.from(k2));
  }, 60_000);

  it('changes when the salt changes', async () => {
    const password = utf8('p');
    const saltA = new Uint8Array(KDF_SALT_BYTES).fill(0x01);
    const saltB = new Uint8Array(KDF_SALT_BYTES).fill(0x02);
    const kA = await deriveKey(password, saltA);
    const kB = await deriveKey(password, saltB);
    expect(Array.from(kA)).not.toEqual(Array.from(kB));
  }, 60_000);

  it('changes when the password changes', async () => {
    const salt = new Uint8Array(KDF_SALT_BYTES).fill(0xa5);
    const kA = await deriveKey(utf8('passwordA'), salt);
    const kB = await deriveKey(utf8('passwordB'), salt);
    expect(Array.from(kA)).not.toEqual(Array.from(kB));
  }, 60_000);

  it('rejects salt of wrong size', async () => {
    await expect(
      deriveKey(utf8('p'), new Uint8Array(KDF_SALT_BYTES - 1)),
    ).rejects.toThrow(/salt must be/);
  });

  it('rejects out-of-range output length', async () => {
    const salt = new Uint8Array(KDF_SALT_BYTES);
    await expect(deriveKey(utf8('p'), salt, 8)).rejects.toThrow(
      /outputBytes must be/,
    );
    await expect(deriveKey(utf8('p'), salt, 128)).rejects.toThrow(
      /outputBytes must be/,
    );
  });
});
