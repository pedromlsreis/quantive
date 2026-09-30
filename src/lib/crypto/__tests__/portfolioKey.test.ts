import { describe, expect, it } from 'vitest';
import { generateDataKey } from '../keystore';
import {
  PORTFOLIO_ENC_VERSION,
  decryptPortfolio,
  encryptPortfolio,
  generateInviteSecret,
  generatePortfolioKey,
  unwrapPortfolioKey,
  unwrapPortfolioKeyFromInvite,
  wrapPortfolioKey,
  wrapPortfolioKeyForInvite,
} from '../portfolioKey';

const USER_A = '550e8400-e29b-41d4-a716-446655440000';
const USER_B = '550e8400-e29b-41d4-a716-446655440001';
const PORTFOLIO_1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const PORTFOLIO_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c9';
const INVITE_1 = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const INVITE_2 = '6ba7b811-9dad-11d1-80b4-00c04fd430c9';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('portfolio key wrapped under a DK', () => {
  it('round-trips and uses the 72-byte wire format', async () => {
    const dataKey = await generateDataKey();
    const portfolioKey = await generatePortfolioKey();
    const wrappedPk = await wrapPortfolioKey({ portfolioKey, dataKey, userId: USER_A, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    expect(wrappedPk.length).toBe(72);
    const unwrapped = await unwrapPortfolioKey({ wrappedPk, dataKey, userId: USER_A, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    expect(Array.from(unwrapped)).toEqual(Array.from(portfolioKey));
  });

  it('fails for another user, portfolio or epoch, or the wrong DK', async () => {
    const dataKey = await generateDataKey();
    const portfolioKey = await generatePortfolioKey();
    const wrappedPk = await wrapPortfolioKey({ portfolioKey, dataKey, userId: USER_A, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    const base = { wrappedPk, dataKey, userId: USER_A, portfolioId: PORTFOLIO_1, keyEpoch: 1 };

    await expect(unwrapPortfolioKey({ ...base, userId: USER_B })).rejects.toThrow();
    await expect(unwrapPortfolioKey({ ...base, portfolioId: PORTFOLIO_2 })).rejects.toThrow();
    await expect(unwrapPortfolioKey({ ...base, keyEpoch: 2 })).rejects.toThrow();
    await expect(unwrapPortfolioKey({ ...base, dataKey: await generateDataKey() })).rejects.toThrow();
  });

  it('rejects a portfolio key of the wrong length', async () => {
    const dataKey = await generateDataKey();
    await expect(
      wrapPortfolioKey({ portfolioKey: new Uint8Array(16), dataKey, userId: USER_A, portfolioId: PORTFOLIO_1, keyEpoch: 1 }),
    ).rejects.toThrow(/32 bytes/);
  });
});

describe('portfolio key wrapped under an invite secret', () => {
  it('round-trips for the right invite, portfolio, epoch and secret only', async () => {
    const portfolioKey = await generatePortfolioKey();
    const inviteSecret = await generateInviteSecret();
    const wrappedPk = await wrapPortfolioKeyForInvite({
      portfolioKey, inviteSecret, inviteId: INVITE_1, portfolioId: PORTFOLIO_1, keyEpoch: 1,
    });
    const base = { wrappedPk, inviteSecret, inviteId: INVITE_1, portfolioId: PORTFOLIO_1, keyEpoch: 1 };

    expect(Array.from(await unwrapPortfolioKeyFromInvite(base))).toEqual(Array.from(portfolioKey));
    await expect(unwrapPortfolioKeyFromInvite({ ...base, inviteId: INVITE_2 })).rejects.toThrow();
    await expect(unwrapPortfolioKeyFromInvite({ ...base, portfolioId: PORTFOLIO_2 })).rejects.toThrow();
    await expect(unwrapPortfolioKeyFromInvite({ ...base, keyEpoch: 2 })).rejects.toThrow();
    await expect(unwrapPortfolioKeyFromInvite({ ...base, inviteSecret: await generateInviteSecret() })).rejects.toThrow();
  });
});

describe('portfolio blob', () => {
  it('round-trips with a fresh nonce each time', async () => {
    const portfolioKey = await generatePortfolioKey();
    const plaintext = utf8(JSON.stringify({ name: 'Joint', facts: [], refSources: [], goals: [] }));
    const e1 = await encryptPortfolio({ plaintext, portfolioKey, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    const e2 = await encryptPortfolio({ plaintext, portfolioKey, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    expect(e1.encVersion).toBe(PORTFOLIO_ENC_VERSION);
    expect(Array.from(e1.nonce)).not.toEqual(Array.from(e2.nonce));
    const dec = await decryptPortfolio({ encrypted: e1, portfolioKey, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    expect(Array.from(dec)).toEqual(Array.from(plaintext));
  });

  it('fails when moved to another portfolio or epoch, or when its version is changed', async () => {
    const portfolioKey = await generatePortfolioKey();
    const encrypted = await encryptPortfolio({ plaintext: utf8('x'), portfolioKey, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    const base = { encrypted, portfolioKey, portfolioId: PORTFOLIO_1, keyEpoch: 1 };

    await expect(decryptPortfolio({ ...base, portfolioId: PORTFOLIO_2 })).rejects.toThrow();
    await expect(decryptPortfolio({ ...base, keyEpoch: 2 })).rejects.toThrow();
    await expect(decryptPortfolio({ ...base, encrypted: { ...encrypted, encVersion: 2 } })).rejects.toThrow(/unsupported/);
  });

  it('cannot be opened with any other key', async () => {
    const portfolioKey = await generatePortfolioKey();
    const encrypted = await encryptPortfolio({ plaintext: utf8('x'), portfolioKey, portfolioId: PORTFOLIO_1, keyEpoch: 1 });
    await expect(
      decryptPortfolio({ encrypted, portfolioKey: await generateDataKey(), portfolioId: PORTFOLIO_1, keyEpoch: 1 }),
    ).rejects.toThrow();
  });
});
