import { describe, expect, it } from 'vitest';
import { byteaToBytes, bytesToBytea } from '../bytea';

describe('bytea encoding', () => {
  it('round-trips arbitrary bytes', () => {
    const data = new Uint8Array([0, 1, 2, 0xde, 0xad, 0xbe, 0xef, 0xff]);
    const encoded = bytesToBytea(data);
    expect(encoded).toBe('\\x000102deadbeefff');
    expect(Array.from(byteaToBytes(encoded))).toEqual(Array.from(data));
  });

  it('round-trips empty input', () => {
    expect(bytesToBytea(new Uint8Array(0))).toBe('\\x');
    expect(byteaToBytes('\\x').length).toBe(0);
  });

  it('uppercase hex decodes the same as lowercase', () => {
    const lower = byteaToBytes('\\xdeadbeef');
    const upper = byteaToBytes('\\xDEADBEEF');
    expect(Array.from(lower)).toEqual(Array.from(upper));
  });

  it('accepts hex with or without "\\x" prefix', () => {
    expect(Array.from(byteaToBytes('\\xff00'))).toEqual([0xff, 0x00]);
    expect(Array.from(byteaToBytes('ff00'))).toEqual([0xff, 0x00]);
  });

  it('rejects odd-length hex', () => {
    expect(() => byteaToBytes('\\xabc')).toThrow();
  });

  it('rejects non-hex characters', () => {
    expect(() => byteaToBytes('\\xZZ')).toThrow();
    expect(() => byteaToBytes('\\xab cd')).toThrow();
  });

  it('round-trips 256 random bytes', () => {
    const data = new Uint8Array(256);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
    expect(Array.from(byteaToBytes(bytesToBytea(data)))).toEqual(Array.from(data));
  });
});
