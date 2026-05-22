// Pure decision logic for the stripe_events idempotency check.
//
// Stripe retries deliveries on any non-2xx response (network blip, 5xx,
// timeout). The deduplication invariant is: insert (event_id) first; if the
// insert succeeds we run the handler exactly once, if it conflicts on the
// unique index we have already processed this event and ack with 200, if it
// fails for any other reason we 500 so Stripe retries.
//
// This module is the decision table. It does not perform the insert itself —
// the caller passes the raw `{ data, error }` result from supabase-js so the
// branch logic stays free of I/O and is unit-testable.

export type IdempotencyOutcome =
  | { kind: "process" }
  | { kind: "duplicate"; reason: "unique_violation" | "no_rows" }
  | { kind: "error"; code?: string; message: string };

export interface IdempotencyInsertResult {
  data: Array<{ event_id: string }> | null;
  error: { code?: string; message?: string } | null;
}

export function decideIdempotencyOutcome(
  result: IdempotencyInsertResult,
): IdempotencyOutcome {
  if (result.error) {
    // Postgres unique_violation — the event_id already exists, so Stripe is
    // re-delivering an event we have already handled. Ack and move on.
    if (result.error.code === "23505") {
      return { kind: "duplicate", reason: "unique_violation" };
    }
    return {
      kind: "error",
      code: result.error.code,
      message: result.error.message ?? "unknown",
    };
  }
  if (!result.data || result.data.length === 0) {
    // Defensive: insert returned no rows without an error. supabase-js can
    // surface ON CONFLICT DO NOTHING this way depending on the PostgREST
    // version, so we treat empty-result as duplicate rather than as success.
    return { kind: "duplicate", reason: "no_rows" };
  }
  return { kind: "process" };
}
