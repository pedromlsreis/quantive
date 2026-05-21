import { describe, it, expect } from 'vitest';
import { extractCheckoutErrorCode, messageForCheckoutError } from '../checkoutError';

describe('extractCheckoutErrorCode', () => {
  it('returns undefined when the error is null or has no context', async () => {
    expect(await extractCheckoutErrorCode(null)).toBeUndefined();
    expect(await extractCheckoutErrorCode(undefined)).toBeUndefined();
    expect(await extractCheckoutErrorCode({})).toBeUndefined();
  });

  it('returns undefined when context is not a Response-shaped object', async () => {
    expect(await extractCheckoutErrorCode({ context: { not: 'a response' } })).toBeUndefined();
  });

  it('reads the error code out of a 401 Response body', async () => {
    const context = new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401 });
    expect(await extractCheckoutErrorCode({ context })).toBe('unauthenticated');
  });

  it('returns undefined when the body is not JSON', async () => {
    const context = new Response('not json at all', { status: 500 });
    expect(await extractCheckoutErrorCode({ context })).toBeUndefined();
  });

  it('returns undefined when the JSON body lacks an error field', async () => {
    const context = new Response(JSON.stringify({ something: 'else' }), { status: 400 });
    expect(await extractCheckoutErrorCode({ context })).toBeUndefined();
  });

  it('returns undefined when the error field is not a string', async () => {
    const context = new Response(JSON.stringify({ error: 42 }), { status: 400 });
    expect(await extractCheckoutErrorCode({ context })).toBeUndefined();
  });

  it('does not consume the response so callers can still read it', async () => {
    // The PricingPage may want to log the raw response separately; cloning
    // inside the helper keeps the original readable. This guards against a
    // regression to reading `ctx.json()` directly.
    const context = new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
    expect(await extractCheckoutErrorCode({ context })).toBe('invalid_request');
    await expect(context.json()).resolves.toEqual({ error: 'invalid_request' });
  });
});

describe('messageForCheckoutError', () => {
  it('returns the dedicated message for each known code', () => {
    expect(messageForCheckoutError('unauthenticated')).toMatch(/sign in again/i);
    expect(messageForCheckoutError('email_unverified')).toMatch(/confirm your email/i);
    expect(messageForCheckoutError('invalid_request')).toMatch(/refresh the page/i);
    expect(messageForCheckoutError('checkout_unavailable')).toMatch(/try again/i);
  });

  it('falls back to the generic message for unknown codes', () => {
    expect(messageForCheckoutError('totally_made_up')).toMatch(/try again/i);
    expect(messageForCheckoutError(undefined)).toMatch(/try again/i);
  });

  it('never returns an empty string', () => {
    for (const code of ['unauthenticated', 'email_unverified', 'invalid_request', 'checkout_unavailable', undefined, 'unknown']) {
      expect(messageForCheckoutError(code).trim().length).toBeGreaterThan(0);
    }
  });
});
