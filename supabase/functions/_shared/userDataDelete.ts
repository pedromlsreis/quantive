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
export const USER_DATA_TABLES = [
  "portfolio_snapshots",
  "feedback",
  "user_keys",
  "user_roles",
  "profiles",
] as const;

export async function deleteUserData(
  client: UserDataTablesClient,
  userId: string,
  tables: readonly string[] = USER_DATA_TABLES,
): Promise<DeleteUserDataResult> {
  const deletedTables: string[] = [];
  const errors: Array<{ table: string; message: string }> = [];
  for (const table of tables) {
    const { error } = await client.from(table).delete().eq("user_id", userId);
    if (error) {
      errors.push({ table, message: error.message });
      continue;
    }
    deletedTables.push(table);
  }
  return { deletedTables, errors };
}
