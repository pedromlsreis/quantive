import { describe, it, expect } from 'vitest';
import { PROTECTED_PATHS, isProtectedPath } from '../protectedPaths';

// PROTECTED_PATHS must stay in sync with APP_SHELL_PATHS in App.tsx and is
// load-bearing for the RequireUnlock prompt. Pin the list explicitly so an
// accidental addition / removal forces the test to be updated.

describe('PROTECTED_PATHS — explicit list', () => {
  it('exposes the eight known data routes in order', () => {
    expect(PROTECTED_PATHS).toEqual([
      '/dashboard',
      '/allocations',
      '/forecast',
      '/goals',
      '/performance',
      '/sources',
      '/settings',
      '/admin',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(PROTECTED_PATHS).size).toBe(PROTECTED_PATHS.length);
  });
});

describe('isProtectedPath — exact matches', () => {
  it.each(PROTECTED_PATHS)('matches the canonical route %s', (p) => {
    expect(isProtectedPath(p)).toBe(true);
  });
});

describe('isProtectedPath — sub-routes', () => {
  it.each([
    ['/dashboard/anything', true],
    ['/settings/security', true],
    ['/admin/users/42', true],
    ['/goals/abc-123', true],
  ])('matches nested routes (%s -> %p)', (path, expected) => {
    expect(isProtectedPath(path)).toBe(expected);
  });

  it('does NOT match a route whose name starts with a protected path but isn\'t one', () => {
    // `/dashboardz` is NOT protected because it neither equals `/dashboard`
    // nor starts with `/dashboard/`. Without the slash guard, prefix-matching
    // would falsely catch siblings.
    expect(isProtectedPath('/dashboardz')).toBe(false);
    expect(isProtectedPath('/settings-help')).toBe(false);
    expect(isProtectedPath('/admin-portal')).toBe(false);
  });
});

describe('isProtectedPath — public routes', () => {
  it.each([
    '/',
    '/pricing',
    '/security',
    '/privacy',
    '/terms',
    '/impressum',
    '/demo',
    '/reset-password',
  ])('does NOT match the public route %s', (p) => {
    expect(isProtectedPath(p)).toBe(false);
  });
});

describe('isProtectedPath — edge cases', () => {
  it('does not match an empty string or root', () => {
    expect(isProtectedPath('')).toBe(false);
    expect(isProtectedPath('/')).toBe(false);
  });

  it('is case-sensitive (routes in this app are lowercase)', () => {
    expect(isProtectedPath('/Dashboard')).toBe(false);
    expect(isProtectedPath('/SETTINGS')).toBe(false);
  });
});
