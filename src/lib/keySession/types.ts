/**
 * Types and storage interface for the key session layer.
 * Spec: docs/security/encryption.md §8.
 *
 * The KeyStore interface decouples the pure unlock logic (`ops.ts`) from
 * the persistent storage backend. Tests inject an in-memory store; the
 * production app uses `supabaseStore.ts`.
 */

export interface UserKeysRow {
  user_id: string;
  kdf_salt: Uint8Array;
  wrapped_dk_kek: Uint8Array;
  wrapped_dk_recovery: Uint8Array | null;
  recovery_kdf_salt: Uint8Array | null;
  enc_version: number;
}

export interface KeyStore {
  /** Returns the user_keys row for a user, or null if none exists. */
  getUserKeys(userId: string): Promise<UserKeysRow | null>;

  /** Inserts a fresh user_keys row. Caller is responsible for ensuring no row already exists. */
  insertUserKeys(row: UserKeysRow): Promise<void>;

  /** True iff the user has at least one row in portfolio_snapshots (legacy or v1). */
  hasPortfolioSnapshot(userId: string): Promise<boolean>;
}
