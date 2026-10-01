// Ordered cleanup of a user's rows before we drop the auth.users entry.
//
// We could rely on FK cascades for most of these, but explicit deletes:
//   1. Make the intent obvious to any reader.
//   2. Survive future schema changes that re-key cascades.
//   3. Let us test the ordering and the set in isolation.

export interface UserDataTablesClient {
  from(table: string): {
    delete(): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
}

export interface ReleasePortfoliosClient {
  rpc(fn: "release_owned_portfolios", args: { p_user_id: string }): PromiseLike<{ error: { message: string } | null }>;
}

// A table whose rows are keyed by user_id, or a table plus the column that
// holds the user's id (portfolios are keyed by owner_id).
export type UserDataTable = string | { table: string; column: string };

export interface DeleteUserDataResult {
  deletedTables: string[];
  errors: Array<{ table: string; message: string }>;
}

// Tables holding user-scoped rows that any delete-user flow must clear,
// in the order they should be removed. Shared between the self-delete
// (delete-account) and admin-delete (admin-users) paths.
//
// Most of these have ON DELETE CASCADE on auth.users, so the final
// auth.admin.deleteUser call would clean them up implicitly. We delete
// explicitly anyway for two reasons:
//   1. A future migration that drops or re-keys a cascade rule won't
//      silently leave orphan rows — the explicit delete keeps the
//      contract local to this list.
//   2. `feedback` is ON DELETE SET NULL by schema (we keep the content
//      for product insight), but a user-requested deletion must remove
//      the message itself for GDPR — the explicit delete enforces that.
//
// Owned portfolios are not in this list: releaseOwnedPortfolios hands each
// shared one to the partner and deletes the rest, and must run first.
// portfolios.owner_id is ON DELETE RESTRICT, so skipping that step fails the
// final auth.admin.deleteUser instead of cascading a partner's data away.
export const USER_DATA_TABLES: readonly UserDataTable[] = [
  "portfolio_members",
  "portfolio_key_history",
  "family_beta",
  "portfolio_snapshots",
  "feedback",
  "user_keys",
  "user_roles",
  "profiles",
];

// A user's encrypted rows and the key rows that open them. Cleared on their
// own by reset-encrypted-data when a password reset without a recovery code
// leaves the data undecryptable (encryption.md §8.5): the portfolio keys are
// wrapped under the lost DK too. releaseOwnedPortfolios runs first, as for
// account deletion. The key row goes last so a failure part-way never
// leaves data behind without its key row.
export const ENCRYPTED_DATA_TABLES: readonly UserDataTable[] = [
  "portfolio_members",
  "portfolio_key_history",
  "portfolio_snapshots",
  "user_keys",
];

// Each portfolio the user owns passes to its partner, who already holds its
// key, or is deleted if it has none (release_owned_portfolios, migration
// 20261001120000). The caller stops if this fails.
export async function releaseOwnedPortfolios(
  client: ReleasePortfoliosClient,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await client.rpc("release_owned_portfolios", { p_user_id: userId });
  return { error: error ? error.message : null };
}

// Account deletion's data step: release owned portfolios, then clear every
// user-scoped table. A failed release stops before any table is touched.
export async function deleteAccountData(
  client: UserDataTablesClient & ReleasePortfoliosClient,
  userId: string,
): Promise<DeleteUserDataResult> {
  const release = await releaseOwnedPortfolios(client, userId);
  if (release.error) {
    return { deletedTables: [], errors: [{ table: "portfolios", message: release.error }] };
  }
  return deleteUserData(client, userId);
}

export async function deleteUserData(
  client: UserDataTablesClient,
  userId: string,
  tables: readonly UserDataTable[] = USER_DATA_TABLES,
): Promise<DeleteUserDataResult> {
  const deletedTables: string[] = [];
  const errors: Array<{ table: string; message: string }> = [];
  for (const entry of tables) {
    const { table, column } = typeof entry === "string" ? { table: entry, column: "user_id" } : entry;
    const { error } = await client.from(table).delete().eq(column, userId);
    if (error) {
      errors.push({ table, message: error.message });
      continue;
    }
    deletedTables.push(table);
  }
  return { deletedTables, errors };
}
