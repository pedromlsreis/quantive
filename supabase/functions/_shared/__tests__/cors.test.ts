import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The cors module reads Deno.env at request time. Stub the global before
// importing so tests can drive the allowlist deterministically. The mock is
// scoped per-test via vi.stubGlobal + unstubAllGlobals in afterEach.
const envStore = new Map<string, string>();
vi.stubGlobal('Deno', {
  env: {
    get: (key: string) => envStore.get(key),
  },
});

import {
  parseAllowedOrigins,
  pickAllowedOrigin,
  buildCorsHeaders,
  corsPreflightResponse,
} from '../cors';

const DEFAULT_ALLOWLIST = [
  'https://usequantive.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

function makeRequest(origin: string | null = null): Request {
  return new Request('https://api.example/edge-fn', {
    method: 'POST',
    headers: origin ? { origin } : {},
  });
}

beforeEach(() => {
  envStore.clear();
});

afterEach(() => {
  envStore.clear();
});

describe('parseAllowedOrigins', () => {
  it('returns the defaults when input is null/undefined/empty', () => {
    expect(parseAllowedOrigins(null)).toEqual(DEFAULT_ALLOWLIST);
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_ALLOWLIST);
    expect(parseAllowedOrigins('')).toEqual(DEFAULT_ALLOWLIST);
    expect(parseAllowedOrigins('   ')).toEqual(DEFAULT_ALLOWLIST);
  });

  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com,https://c.com'))
      .toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });

  it('drops empty entries from a malformed list and keeps the rest', () => {
    expect(parseAllowedOrigins('https://a.com,,https://b.com,'))
      .toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('pickAllowedOrigin', () => {
  it('returns the origin when it is in the allowlist', () => {
    expect(pickAllowedOrigin('https://usequantive.app', DEFAULT_ALLOWLIST))
      .toBe('https://usequantive.app');
  });

  it('returns null when the origin is not in the allowlist', () => {
    expect(pickAllowedOrigin('https://evil.example', DEFAULT_ALLOWLIST)).toBeNull();
  });

  it('returns null when no origin is given (server-to-server)', () => {
    expect(pickAllowedOrigin(null, DEFAULT_ALLOWLIST)).toBeNull();
  });

  it('does NOT match by substring or prefix (security: full string equality)', () => {
    // A spoofed origin that contains an allowed substring must not match.
    expect(pickAllowedOrigin('https://usequantive.app.evil.com', DEFAULT_ALLOWLIST)).toBeNull();
    expect(pickAllowedOrigin('https://evil.com/https://usequantive.app', DEFAULT_ALLOWLIST)).toBeNull();
  });

  it('is case-sensitive (browsers always send lowercase scheme/host; spoofed mixed-case is rejected)', () => {
    expect(pickAllowedOrigin('HTTPS://USEQUANTIVE.APP', DEFAULT_ALLOWLIST)).toBeNull();
  });
});

describe('buildCorsHeaders', () => {
  it('always emits Vary: Origin and the Allow-Headers list', () => {
    const headers = buildCorsHeaders(makeRequest('https://usequantive.app'));
    expect(headers['Vary']).toBe('Origin');
    expect(headers['Access-Control-Allow-Headers']).toContain('authorization');
    expect(headers['Access-Control-Allow-Headers']).toContain('content-type');
  });

  it('echoes Allow-Origin for an allowlisted origin', () => {
    const headers = buildCorsHeaders(makeRequest('https://usequantive.app'));
    expect(headers['Access-Control-Allow-Origin']).toBe('https://usequantive.app');
  });

  it('OMITS Allow-Origin for a non-allowlisted origin (the load-bearing security property)', () => {
    const headers = buildCorsHeaders(makeRequest('https://evil.example'));
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    // Vary must still be set so caches behave correctly.
    expect(headers['Vary']).toBe('Origin');
  });

  it('OMITS Allow-Origin for a request with no Origin header (server-to-server)', () => {
    const headers = buildCorsHeaders(makeRequest(null));
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('honours the ALLOWED_ORIGINS env override', () => {
    envStore.set('ALLOWED_ORIGINS', 'https://staging.usequantive.app');

    const allowed = buildCorsHeaders(makeRequest('https://staging.usequantive.app'));
    expect(allowed['Access-Control-Allow-Origin']).toBe('https://staging.usequantive.app');

    // A previously-default origin is now rejected because the env override
    // replaces (not extends) the allowlist — this is intentional so an
    // explicit env value is the source of truth.
    const previouslyDefault = buildCorsHeaders(makeRequest('https://usequantive.app'));
    expect(previouslyDefault['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('falls back to defaults when ALLOWED_ORIGINS is set to a blank string', () => {
    envStore.set('ALLOWED_ORIGINS', '   ');
    const headers = buildCorsHeaders(makeRequest('https://usequantive.app'));
    expect(headers['Access-Control-Allow-Origin']).toBe('https://usequantive.app');
  });
});

describe('corsPreflightResponse', () => {
  it('returns 204 with the right CORS headers for an allowlisted origin', () => {
    const res = corsPreflightResponse(makeRequest('http://localhost:5173'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('returns 204 without Allow-Origin for a non-allowlisted origin', () => {
    const res = corsPreflightResponse(makeRequest('https://evil.example'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBe('Origin');
  });
});
