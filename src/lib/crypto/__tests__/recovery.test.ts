import { describe, expect, it } from 'vitest';
import {
  RECOVERY_WORD_COUNT,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeToEntropy,
  recoveryCodeToKdfInput,
} from '../recovery';
import { wordlist } from '@scure/bip39/wordlists/english.js';

describe('recovery: generation', () => {
  it('emits 24 BIP-39 words', () => {
    const code = generateRecoveryCode();
    expect(code.split(' ')).toHaveLength(RECOVERY_WORD_COUNT);
  });

  it('every generated code passes BIP-39 validation', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode();
      expect(isValidRecoveryCode(code)).toBe(true);
    }
  });

  it('round-trips through BIP-39 entropy (32 bytes)', () => {
    const code = generateRecoveryCode();
    const entropy = recoveryCodeToEntropy(code);
    expect(entropy.length).toBe(32);
  });
});

describe('recovery: normalization', () => {
  it('lowercases', () => {
    const code = generateRecoveryCode();
    const upper = code.toUpperCase();
    expect(normalizeRecoveryCode(upper)).toBe(code);
  });

  it('collapses repeated whitespace', () => {
    const code = generateRecoveryCode();
    const noisy = code.replace(/ /g, '   \t  ');
    expect(normalizeRecoveryCode(noisy)).toBe(code);
  });

  it('trims leading/trailing whitespace', () => {
    const code = generateRecoveryCode();
    expect(normalizeRecoveryCode('  ' + code + '  \n')).toBe(code);
  });

  it('NFKD-normalizes (sanity: pure-ASCII codes are idempotent)', () => {
    const code = generateRecoveryCode();
    expect(normalizeRecoveryCode(normalizeRecoveryCode(code))).toBe(code);
  });
});

describe('recovery: validation', () => {
  it('rejects garbage', () => {
    expect(isValidRecoveryCode('not a recovery code at all')).toBe(false);
    expect(isValidRecoveryCode('')).toBe(false);
  });

  it('rejects a 23-word truncation of a valid code (length check)', () => {
    const code = generateRecoveryCode();
    const truncated = code.split(' ').slice(0, 23).join(' ');
    expect(isValidRecoveryCode(truncated)).toBe(false);
  });

  it('rejects a code with a single-word substitution (checksum check)', () => {
    const code = generateRecoveryCode();
    const words = code.split(' ');
    // Flip a checksum bit (index ^ 1) so the code always fails. A swap for an
    // arbitrary word would pass the checksum 1/256 of the time, hence flaky.
    const last = words.length - 1;
    words[last] = wordlist[wordlist.indexOf(words[last]) ^ 1];
    expect(isValidRecoveryCode(words.join(' '))).toBe(false);
  });
});

describe('recovery: KDF input derivation', () => {
  it('produces UTF-8 bytes of the normalized code', () => {
    const code = generateRecoveryCode();
    const bytes = recoveryCodeToKdfInput(code);
    expect(new TextDecoder().decode(bytes)).toBe(code);
  });

  it('throws for an invalid code', () => {
    expect(() => recoveryCodeToKdfInput('not valid')).toThrow();
  });

  it('produces identical KDF input for differently-cased / whitespaced inputs', () => {
    const code = generateRecoveryCode();
    const a = recoveryCodeToKdfInput(code);
    const b = recoveryCodeToKdfInput('  ' + code.toUpperCase() + ' ');
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
