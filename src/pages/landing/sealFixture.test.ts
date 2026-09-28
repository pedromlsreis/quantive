import { describe, expect, it } from 'vitest';
import { AEAD_TAG_BYTES, ENC_VERSION, aadForSnapshot, decrypt, encrypt } from '@/lib/crypto';
import {
  SEAL_CIPHERTEXT_HEX,
  SEAL_DEMO_KEY_HEX,
  SEAL_NONCE_HEX,
  SEAL_PLAINTEXT,
  SEAL_TAG_BYTES,
  SEAL_USER_ID,
} from './sealFixture';

const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

describe('landing seal fixture', () => {
  const key = unhex(SEAL_DEMO_KEY_HEX);
  const nonce = unhex(SEAL_NONCE_HEX);
  const aad = aadForSnapshot(SEAL_USER_ID, ENC_VERSION);
  const plaintext = new TextEncoder().encode(SEAL_PLAINTEXT);

  it('is the real output of the app crypto module', async () => {
    const ct = await encrypt({ key, nonce, plaintext, aad });
    expect(hex(ct)).toBe(SEAL_CIPHERTEXT_HEX);
  });

  it('decrypts back to the displayed plaintext', async () => {
    const out = await decrypt({ key, nonce, ciphertext: unhex(SEAL_CIPHERTEXT_HEX), aad });
    expect(new TextDecoder().decode(out)).toBe(SEAL_PLAINTEXT);
  });

  it('shows body and tag lengths that match the wire format', () => {
    expect(SEAL_TAG_BYTES).toBe(AEAD_TAG_BYTES);
    expect(SEAL_CIPHERTEXT_HEX.length / 2).toBe(plaintext.length + AEAD_TAG_BYTES);
  });

  it('fails for another account (AAD bound to the user id)', async () => {
    const otherAad = aadForSnapshot('0d3e0d3e-0000-4000-8000-000000000002', ENC_VERSION);
    await expect(
      decrypt({ key, nonce, ciphertext: unhex(SEAL_CIPHERTEXT_HEX), aad: otherAad }),
    ).rejects.toThrow();
  });
});
