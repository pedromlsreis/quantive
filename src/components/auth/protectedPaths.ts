/**
 * Routes that render decrypted portfolio data and therefore need an unlocked
 * DK in memory. Should mirror the data routes inside AppShell.
 *
 * MAINTENANCE: if you add a new route in src/App.tsx APP_SHELL_PATHS that
 * reads encrypted user data, add it here too. The reciprocal comment lives
 * next to APP_SHELL_PATHS.
 *
 * Exceptions kept off the list on purpose:
 * - reset-password: runs its own password+recovery flow; prompting for the
 *   forgotten password there is the bug of bugs.
 * - Marketing/legal/demo routes: no decryption needed.
 */
export const PROTECTED_PATHS = [
  '/dashboard',
  '/allocations',
  '/forecast',
  '/sources',
  '/settings',
  '/admin',
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}
