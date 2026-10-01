/**
 * Portfolio keys (PK) for extra portfolios. Spec: docs/security/encryption.md §5.2, §6.4–§6.6.
 *
 * Each extra portfolio has its own random PK. The PK encrypts the portfolio's
 * blob and is stored only wrapped: under each member's DK, and under a
 * one-time invite secret while an invitation is pending. The personal
 * portfolio does not use a PK; it stays under the DK (snapshot.ts).
 *
 * Like snapshot.ts, this module is JSON-agnostic: callers pass UTF-8 bytes.
 */

import { decrypt, encrypt, generateKey, generateNonce } from './aead';
import { aadForInviteWrap, aadForPortfolioData, aadForPortfolioKeyWrap } from './aad';
import { pack, unpack } from './wrapFormat';

export const PORTFOLIO_KEY_BYTES = 32;
export const INVITE_SECRET_BYTES = 32;

/** Bumped only when the portfolio blob's wire format or AEAD primitives change. */
export const PORTFOLIO_ENC_VERSION = 1;

export interface EncryptedPortfolio {
  /** AEAD ciphertext + tag. */
  ciphertext: Uint8Array;
  /** 24-byte XChaCha20 nonce. */
  nonce: Uint8Array;
  encVersion: number;
}

function assertLength(bytes: Uint8Array, expected: number, name: string): void {
  if (bytes.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes`);
  }
}

export async function generatePortfolioKey(): Promise<Uint8Array> {
  return generateKey();
}

/** A fresh secret for an invite link. Never sent to the server. */
export async function generateInviteSecret(): Promise<Uint8Array> {
  return generateKey();
}

export async function wrapPortfolioKey(args: {
  portfolioKey: Uint8Array;
  dataKey: Uint8Array;
  userId: string;
  portfolioId: string;
  keyEpoch: number;
}): Promise<Uint8Array> {
  assertLength(args.portfolioKey, PORTFOLIO_KEY_BYTES, 'portfolioKey');
  const nonce = await generateNonce();
  const ciphertext = await encrypt({
    key: args.dataKey,
    nonce,
    plaintext: args.portfolioKey,
    aad: aadForPortfolioKeyWrap(args.userId, args.portfolioId, args.keyEpoch),
  });
  return pack(nonce, ciphertext);
}

export async function unwrapPortfolioKey(args: {
  wrappedPk: Uint8Array;
  dataKey: Uint8Array;
  userId: string;
  portfolioId: string;
  keyEpoch: number;
}): Promise<Uint8Array> {
  const { nonce, ciphertext } = unpack(args.wrappedPk);
  return decrypt({
    key: args.dataKey,
    nonce,
    ciphertext,
    aad: aadForPortfolioKeyWrap(args.userId, args.portfolioId, args.keyEpoch),
  });
}

export async function wrapPortfolioKeyForInvite(args: {
  portfolioKey: Uint8Array;
  inviteSecret: Uint8Array;
  inviteId: string;
  portfolioId: string;
  keyEpoch: number;
}): Promise<Uint8Array> {
  assertLength(args.portfolioKey, PORTFOLIO_KEY_BYTES, 'portfolioKey');
  assertLength(args.inviteSecret, INVITE_SECRET_BYTES, 'inviteSecret');
  const nonce = await generateNonce();
  const ciphertext = await encrypt({
    key: args.inviteSecret,
    nonce,
    plaintext: args.portfolioKey,
    aad: aadForInviteWrap(args.inviteId, args.portfolioId, args.keyEpoch),
  });
  return pack(nonce, ciphertext);
}

export async function unwrapPortfolioKeyFromInvite(args: {
  wrappedPk: Uint8Array;
  inviteSecret: Uint8Array;
  inviteId: string;
  portfolioId: string;
  keyEpoch: number;
}): Promise<Uint8Array> {
  assertLength(args.inviteSecret, INVITE_SECRET_BYTES, 'inviteSecret');
  const { nonce, ciphertext } = unpack(args.wrappedPk);
  return decrypt({
    key: args.inviteSecret,
    nonce,
    ciphertext,
    aad: aadForInviteWrap(args.inviteId, args.portfolioId, args.keyEpoch),
  });
}

export async function encryptPortfolio(args: {
  plaintext: Uint8Array;
  portfolioKey: Uint8Array;
  portfolioId: string;
  keyEpoch: number;
}): Promise<EncryptedPortfolio> {
  const nonce = await generateNonce();
  const ciphertext = await encrypt({
    key: args.portfolioKey,
    nonce,
    plaintext: args.plaintext,
    aad: aadForPortfolioData(args.portfolioId, args.keyEpoch, PORTFOLIO_ENC_VERSION),
  });
  return { ciphertext, nonce, encVersion: PORTFOLIO_ENC_VERSION };
}

export async function decryptPortfolio(args: {
  encrypted: EncryptedPortfolio;
  portfolioKey: Uint8Array;
  portfolioId: string;
  keyEpoch: number;
}): Promise<Uint8Array> {
  if (args.encrypted.encVersion !== PORTFOLIO_ENC_VERSION) {
    throw new Error(
      `unsupported portfolio enc_version: ${args.encrypted.encVersion} ` +
        `(this build supports ${PORTFOLIO_ENC_VERSION})`,
    );
  }
  return decrypt({
    key: args.portfolioKey,
    nonce: args.encrypted.nonce,
    ciphertext: args.encrypted.ciphertext,
    // The version comes from the row, so a downgrade fails the tag check.
    aad: aadForPortfolioData(args.portfolioId, args.keyEpoch, args.encrypted.encVersion),
  });
}
