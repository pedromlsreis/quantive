// Pure selection logic for the check-subscription edge function. Kept in a
// separate module so it can be unit-tested without the Deno serve runtime.
//
// `active` and `trialing` are full entitlement. `past_due` is mid-dunning:
// Stripe is still retrying the card and the user should keep Pro access
// during that grace window. Anything else (canceled, incomplete,
// incomplete_expired, unpaid, paused) is not entitled.

export type EntitledStatus = "active" | "trialing" | "past_due";

export interface MinimalSubscription {
  status: string;
}

const RANK: Record<EntitledStatus, number> = {
  active: 4,
  trialing: 3,
  past_due: 2,
};

export function isEntitledStatus(status: string): status is EntitledStatus {
  return status in RANK;
}

export function pickEntitledSubscription<T extends MinimalSubscription>(
  subs: readonly T[],
): T | null {
  let best: T | null = null;
  let bestRank = -1;
  for (const s of subs) {
    if (!isEntitledStatus(s.status)) continue;
    const r = RANK[s.status];
    if (r > bestRank) {
      best = s;
      bestRank = r;
    }
  }
  return best;
}
