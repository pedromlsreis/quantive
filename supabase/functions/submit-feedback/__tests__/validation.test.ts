import { describe, it, expect } from 'vitest';
import {
  parseFeedbackBody,
  VALID_FEEDBACK_TYPES,
  MAX_MESSAGE_LENGTH,
} from '../validation';

describe('parseFeedbackBody — rejects', () => {
  it('null body', () => {
    expect(parseFeedbackBody(null)).toEqual({
      ok: false,
      status: 400,
      error: 'Missing type or message',
    });
  });

  it('undefined body', () => {
    expect(parseFeedbackBody(undefined)).toEqual({
      ok: false,
      status: 400,
      error: 'Missing type or message',
    });
  });

  it('non-object body (string, number, boolean)', () => {
    for (const raw of ['hello', 42, true, false, []]) {
      const result = parseFeedbackBody(raw);
      // Arrays pass typeof === 'object' so they hit the missing-field branch
      // — either way it's a 400, which is the contract we care about.
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.status).toBe(400);
    }
  });

  it('empty object (no type, no message)', () => {
    expect(parseFeedbackBody({})).toEqual({
      ok: false,
      status: 400,
      error: 'Missing type or message',
    });
  });

  it('type present but message missing', () => {
    expect(parseFeedbackBody({ type: 'bug' })).toEqual({
      ok: false,
      status: 400,
      error: 'Missing type or message',
    });
  });

  it('message present but type missing', () => {
    expect(parseFeedbackBody({ message: 'something' })).toEqual({
      ok: false,
      status: 400,
      error: 'Missing type or message',
    });
  });

  it('type outside the allowlist', () => {
    // The CHECK constraint on feedback.type only accepts feature/improvement/bug.
    // The validator must reject anything else before the DB does.
    for (const type of ['praise', 'spam', 'BUG', 'Bug', 'feedback', '']) {
      const result = parseFeedbackBody({ type, message: 'real message' });
      if (type === '') {
        // Empty string falls through "missing" check earlier — still a 400.
        expect(result.ok).toBe(false);
      } else {
        expect(result).toEqual({
          ok: false,
          status: 400,
          error: 'Invalid feedback type',
        });
      }
    }
  });

  it('type is the right value but wrong shape (number, object)', () => {
    expect(parseFeedbackBody({ type: 1, message: 'm' })).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid feedback type',
    });
    expect(parseFeedbackBody({ type: { tag: 'bug' }, message: 'm' })).toEqual({
      ok: false,
      status: 400,
      error: 'Invalid feedback type',
    });
  });

  it('message that is whitespace-only', () => {
    // Trim before length-check, so "    " counts as empty.
    expect(parseFeedbackBody({ type: 'bug', message: '   \n\t  ' })).toEqual({
      ok: false,
      status: 400,
      error: 'Message must be 1-2000 characters',
    });
  });

  it('message that exceeds MAX_MESSAGE_LENGTH', () => {
    // 2001 chars rejected; the cap exists so an abusive payload never
    // reaches the email worker.
    const tooLong = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
    expect(parseFeedbackBody({ type: 'bug', message: tooLong })).toEqual({
      ok: false,
      status: 400,
      error: 'Message must be 1-2000 characters',
    });
  });

  it('message is the right type but wrong shape (number, array)', () => {
    expect(parseFeedbackBody({ type: 'bug', message: 42 })).toEqual({
      ok: false,
      status: 400,
      error: 'Message must be 1-2000 characters',
    });
    expect(parseFeedbackBody({ type: 'bug', message: ['hi'] })).toEqual({
      ok: false,
      status: 400,
      error: 'Message must be 1-2000 characters',
    });
  });
});

describe('parseFeedbackBody — accepts', () => {
  it.each(VALID_FEEDBACK_TYPES)('a well-formed %s submission', (type) => {
    const result = parseFeedbackBody({ type, message: 'real message' });
    expect(result).toEqual({ ok: true, type, message: 'real message' });
  });

  it('trims surrounding whitespace from message', () => {
    const result = parseFeedbackBody({ type: 'bug', message: '  please fix the export  ' });
    expect(result).toEqual({ ok: true, type: 'bug', message: 'please fix the export' });
  });

  it('accepts a message of exactly MAX_MESSAGE_LENGTH characters', () => {
    // Boundary: 2000 ok, 2001 not.
    const exact = 'a'.repeat(MAX_MESSAGE_LENGTH);
    const result = parseFeedbackBody({ type: 'feature', message: exact });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.length).toBe(MAX_MESSAGE_LENGTH);
  });

  it('accepts a 1-character message after trimming', () => {
    const result = parseFeedbackBody({ type: 'feature', message: ' x ' });
    expect(result).toEqual({ ok: true, type: 'feature', message: 'x' });
  });

  it('ignores unknown extra fields rather than rejecting', () => {
    // HN crowd will probe — sending extra fields should not cause a 400 as
    // long as type+message are valid, and we must NOT echo them back.
    const result = parseFeedbackBody({
      type: 'bug',
      message: 'real',
      __proto__: { isAdmin: true },
      stripeCustomer: 'cus_evil',
    });
    expect(result).toEqual({ ok: true, type: 'bug', message: 'real' });
  });
});

describe('parseFeedbackBody — exposed contract', () => {
  it('lists the three allowed types and nothing else', () => {
    // Snapshot the allowlist so a careless add doesn't ship without
    // updating the DB CHECK constraint and the email subject formatter.
    expect([...VALID_FEEDBACK_TYPES]).toEqual(['feature', 'improvement', 'bug']);
  });

  it('caps message length at 2000 characters', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(2000);
  });
});
