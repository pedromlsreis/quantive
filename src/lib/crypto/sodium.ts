// Sumo build: includes Argon2id (`crypto_pwhash`). The non-sumo build omits
// password-hashing primitives. Spec: docs/security/encryption.md §4.
//
// The libsodium-wrappers-sumo bundle is ~187 KB gzipped. Static-importing it
// here would pull it into the landing-page chunk, since this module is
// reachable from <KeySessionProvider> mounted at the root of App.tsx.
// Loading via dynamic import() lets Vite split it into its own chunk that
// only authenticated users pay for. Every caller already awaits ready()
// before touching the library, so the lazy boundary is transparent.

type Sodium = typeof import('libsodium-wrappers-sumo').default;

let _sodium: Sodium | null = null;
let _readyPromise: Promise<void> | null = null;

export async function ready(): Promise<void> {
  if (_readyPromise) return _readyPromise;
  _readyPromise = (async () => {
    const mod = await import('libsodium-wrappers-sumo');
    await mod.default.ready;
    _sodium = mod.default;
  })();
  return _readyPromise;
}

export function getSodium(): Sodium {
  if (!_sodium) {
    throw new Error('sodium not initialised — call `await ready()` first');
  }
  return _sodium;
}
