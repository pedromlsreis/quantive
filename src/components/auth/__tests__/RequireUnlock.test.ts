import { describe, it, expect } from 'vitest';
import { isProtectedPath, PROTECTED_PATHS } from '../protectedPaths';

// Pure-function tests for the route gate. The modal's full behaviour (only
// fires for authed + locked users, etc.) is wired through React state and
// would need heavy mocking — covered by the existing key-session ops/store
// tests + e2e instead. Here we pin the route contract so any future change
// to PROTECTED_PATHS is conscious.

describe('isProtectedPath — data routes', () => {
  it.each([
    '/dashboard',
    '/allocations',
    '/forecast',
    '/sources',
    '/settings',
    '/admin',
  ])('protects %s (renders decrypted user data)', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each([
    '/dashboard/foo',
    '/allocations/123',
    '/settings/security',
    '/admin/users',
  ])('protects sub-path %s', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });
});

describe('isProtectedPath — public routes', () => {
  it.each([
    '/',
    '/pricing',
    '/demo',
    '/privacy',
    '/terms',
    '/security',
    '/impressum',
  ])('does not protect %s', (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});

describe('isProtectedPath — recovery edge case', () => {
  it('does NOT protect /reset-password — must not show the unlock modal there', () => {
    // Regression guard: the reset-password flow runs its own password +
    // recovery code flow. Prompting for the forgotten password there would
    // be the bug of bugs (per the source comment).
    expect(isProtectedPath('/reset-password')).toBe(false);
  });
});

describe('PROTECTED_PATHS surface', () => {
  it('does not partially match neighbouring paths', () => {
    // '/admin' must not protect '/administrate' or '/adminx'. The
    // `startsWith(p + '/')` rule prevents this — pin it with a test so any
    // refactor of the matcher keeps the boundary.
    expect(isProtectedPath('/administrate')).toBe(false);
    expect(isProtectedPath('/adminx')).toBe(false);
    expect(isProtectedPath('/settingsx')).toBe(false);
  });

  it('exports the canonical list as a non-empty array', () => {
    expect(Array.isArray(PROTECTED_PATHS)).toBe(true);
    expect(PROTECTED_PATHS.length).toBeGreaterThan(0);
  });
});
