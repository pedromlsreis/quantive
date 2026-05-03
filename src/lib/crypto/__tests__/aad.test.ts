import { describe, expect, it } from 'vitest';
import {
  ENC_VERSION_BYTES,
  UUID_BYTES,
  aadForDataKeyWrap,
  aadForRecoveryWrap,
  aadForSnapshot,
  uuidToBytes,
} from '../aad';

const SAMPLE_UUID = '550e8400-e29b-41d4-a716-446655440000';
const SAMPLE_UUID_BYTES = [
  0x55, 0x0e, 0x84, 0x00, 0xe2, 0x9b, 0x41, 0xd4,
  0xa7, 0x16, 0x44, 0x66, 0x55, 0x44, 0x00, 0x00,
];

describe('AAD: uuidToBytes', () => {
  it('parses a canonical UUID to 16 bytes', () => {
    const bytes = uuidToBytes(SAMPLE_UUID);
    expect(bytes.length).toBe(UUID_BYTES);
    expect(Array.from(bytes)).toEqual(SAMPLE_UUID_BYTES);
  });

  it('accepts hyphenless UUIDs', () => {
    const bytes = uuidToBytes(SAMPLE_UUID.replace(/-/g, ''));
    expect(Array.from(bytes)).toEqual(SAMPLE_UUID_BYTES);
  });

  it('rejects malformed UUIDs', () => {
    expect(() => uuidToBytes('not-a-uuid')).toThrow();
    expect(() => uuidToBytes('550e8400-e29b-41d4-a716-44665544000')).toThrow();
    expect(() => uuidToBytes('zzzz8400-e29b-41d4-a716-446655440000')).toThrow();
  });
});

describe('AAD: aadForDataKeyWrap', () => {
  it('format: "nwa-dk-v1" || 0x00 || uuid_bytes (16)', () => {
    const aad = aadForDataKeyWrap(SAMPLE_UUID);
    const prefix = new TextEncoder().encode('nwa-dk-v1');
    expect(aad.length).toBe(prefix.length + 1 + UUID_BYTES);
    expect(Array.from(aad.slice(0, prefix.length))).toEqual(Array.from(prefix));
    expect(aad[prefix.length]).toBe(0x00);
    expect(Array.from(aad.slice(prefix.length + 1))).toEqual(SAMPLE_UUID_BYTES);
  });

  it('different UUIDs produce different AAD', () => {
    const a = aadForDataKeyWrap('550e8400-e29b-41d4-a716-446655440000');
    const b = aadForDataKeyWrap('550e8400-e29b-41d4-a716-446655440001');
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('AAD: aadForSnapshot', () => {
  it('format: "nwa-snap-v1" || 0x00 || uuid (16) || version_le_u32 (4)', () => {
    const aad = aadForSnapshot(SAMPLE_UUID, 1);
    const prefix = new TextEncoder().encode('nwa-snap-v1');
    expect(aad.length).toBe(prefix.length + 1 + UUID_BYTES + ENC_VERSION_BYTES);
    expect(Array.from(aad.slice(0, prefix.length))).toEqual(Array.from(prefix));
    expect(aad[prefix.length]).toBe(0x00);
    expect(Array.from(aad.slice(prefix.length + 1, prefix.length + 1 + UUID_BYTES))).toEqual(
      SAMPLE_UUID_BYTES,
    );
    // Little-endian u32(1) = 01 00 00 00
    expect(Array.from(aad.slice(-ENC_VERSION_BYTES))).toEqual([0x01, 0x00, 0x00, 0x00]);
  });

  it('different versions produce different AAD (downgrade-binding)', () => {
    const v1 = aadForSnapshot(SAMPLE_UUID, 1);
    const v2 = aadForSnapshot(SAMPLE_UUID, 2);
    expect(Array.from(v1)).not.toEqual(Array.from(v2));
  });

  it('rejects non-integer / out-of-range versions', () => {
    expect(() => aadForSnapshot(SAMPLE_UUID, 1.5)).toThrow();
    expect(() => aadForSnapshot(SAMPLE_UUID, -1)).toThrow();
    expect(() => aadForSnapshot(SAMPLE_UUID, 0x1_0000_0000)).toThrow();
  });
});

describe('AAD: aadForRecoveryWrap', () => {
  it('format: "nwa-rec-v1" || 0x00 || uuid (16)', () => {
    const aad = aadForRecoveryWrap(SAMPLE_UUID);
    const prefix = new TextEncoder().encode('nwa-rec-v1');
    expect(aad.length).toBe(prefix.length + 1 + UUID_BYTES);
    expect(Array.from(aad.slice(0, prefix.length))).toEqual(Array.from(prefix));
    expect(aad[prefix.length]).toBe(0x00);
  });

  it('cross-purpose AADs are mutually distinct', () => {
    const dk = aadForDataKeyWrap(SAMPLE_UUID);
    const snap = aadForSnapshot(SAMPLE_UUID, 1);
    const rec = aadForRecoveryWrap(SAMPLE_UUID);
    expect(Array.from(dk)).not.toEqual(Array.from(snap));
    expect(Array.from(dk)).not.toEqual(Array.from(rec));
    expect(Array.from(snap)).not.toEqual(Array.from(rec));
  });
});
