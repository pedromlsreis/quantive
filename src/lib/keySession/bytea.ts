/**
 * BYTEA <-> Uint8Array conversion for PostgREST.
 *
 * PostgREST's default JSON serialization for BYTEA is the legacy "\x" hex
 * escape format (e.g. "\\xdeadbeef"). Both reads and writes accept this
 * format. We do NOT use base64 because PostgREST's BYTEA-as-base64 mode is
 * not the default and would couple us to a server-side configuration knob.
 */

export function bytesToBytea(b: Uint8Array): string {
  let hex = '';
  for (const byte of b) hex += byte.toString(16).padStart(2, '0');
  return '\\x' + hex;
}

export function byteaToBytes(s: string): Uint8Array {
  const hex = s.startsWith('\\x') ? s.slice(2) : s;
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`invalid bytea hex: ${s}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
