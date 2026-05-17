// Minimal ambient declaration for the Deno globals used in this directory.
// The real types come from Deno at runtime; this file exists so the TS server
// (and vitest, which now scans these files for tests) doesn't error on the
// `Deno.env.get(...)` call in cors.ts. Keep this surface minimal — extend
// only when a new edge function actually needs another Deno API.

declare const Deno: {
  env: { get(name: string): string | undefined };
};
