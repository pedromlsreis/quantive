# End-to-End Encryption — Design

**Status:** Implemented (v0.1 wire format = `enc_version = 1`)
**Last updated:** 2026-10-01
**Tracking issue:** [#33](https://github.com/pedromlsreis/quantive/issues/33)

> This document is the source of truth for how Quantive encrypts user data. It is **public on purpose**: the encryption module is open-source under [`src/lib/crypto/`](../../src/lib/crypto/), and this design is meant to be reviewed by the community. If you spot something wrong, please open an issue.

## What's verified by tests

| Property | Verified by |
|---|---|
| AEAD round-trip (XChaCha20-Poly1305) | [aead.test.ts](../../src/lib/crypto/__tests__/aead.test.ts) |
| Tamper detection on ciphertext / nonce / tag | [aead.test.ts](../../src/lib/crypto/__tests__/aead.test.ts) |
| AAD-mismatch rejection | [aead.test.ts](../../src/lib/crypto/__tests__/aead.test.ts) |
| Random-ciphertext fuzz (no oracle) | [aead.test.ts](../../src/lib/crypto/__tests__/aead.test.ts) |
| Argon2id parameters + determinism | [kdf.test.ts](../../src/lib/crypto/__tests__/kdf.test.ts) |
| AAD framing for DK / snapshot / recovery wraps | [aad.test.ts](../../src/lib/crypto/__tests__/aad.test.ts) |
| BIP-39 round-trip + checksum rejection | [recovery.test.ts](../../src/lib/crypto/__tests__/recovery.test.ts) |
| New-user provisioning | [keySession/ops.test.ts](../../src/lib/keySession/__tests__/ops.test.ts) |
| **Cross-user AAD isolation** (A's wrap can't be unwrapped under B's id) | [keySession/ops.test.ts](../../src/lib/keySession/__tests__/ops.test.ts) |
| Recovery flow round-trip + **byte-identical DK invariant** | [keySession/recovery.test.ts](../../src/lib/keySession/__tests__/recovery.test.ts) |
| Change-password rotates wrap; recovery wrap untouched | [keySession/recovery.test.ts](../../src/lib/keySession/__tests__/recovery.test.ts) |
| Encrypted-snapshot upsert + decode round-trip | [cloudSync.encrypted.test.ts](../../src/lib/__tests__/cloudSync.encrypted.test.ts) |
| AAD framing for portfolio-key, portfolio-blob and invite wraps (§6.4–§6.6) | [aad.test.ts](../../src/lib/crypto/__tests__/aad.test.ts) |
| **Portfolio isolation**: a PK wrap or blob fails under another user, portfolio, epoch or key | [portfolioKey.test.ts](../../src/lib/crypto/__tests__/portfolioKey.test.ts) |
| Portfolio create / list / compare-and-swap save; a swapped blob is skipped, not shown; fact dates stored as calendar days | [portfolios.test.ts](../../src/lib/__tests__/portfolios.test.ts) |
| Key rotation re-encrypts at the next epoch and the old key can no longer write; an earlier version opens with the retired key | [portfolios.test.ts](../../src/lib/__tests__/portfolios.test.ts) |
| **Invite secret never reaches the server**; a changed secret or another invite's id is refused before any call; the partner's re-wrap opens with their DK only | [portfolioSharing.test.ts](../../src/lib/__tests__/portfolioSharing.test.ts) |
| Invite secret taken out of the address bar before the app starts; analytics never carries a URL fragment or an invite id | [inviteFragment.test.ts](../../src/lib/__tests__/inviteFragment.test.ts), [analytics.events.test.ts](../../src/lib/__tests__/analytics.events.test.ts) |
| Concurrent edits: unsaved edits replayed on the stored version, applying an edit twice changes nothing, a clashing rename is dropped with a message | [portfolioOps.test.ts](../../src/lib/__tests__/portfolioOps.test.ts), [portfolioSync.test.ts](../../src/lib/__tests__/portfolioSync.test.ts) |
| **RLS, triggers and sharing functions** on an in-memory Postgres with the real migrations: isolation, one-time invites, the partner seat, rotation, revisions, ownership transfer | [portfolioSharing.sql.test.ts](../../supabase/tests/portfolioSharing.sql.test.ts) |
| The same, against the live project as two signed-in users (run locally; needs the E2E test users) | [rls-portfolios.spec.ts](../../e2e/rls-portfolios.spec.ts) |
| Invite, join, concurrent edits and removal in two browsers | [family-sharing.spec.ts](../../e2e/family-sharing.spec.ts) |

---

## 1. TL;DR

Portfolio data (`portfolio_snapshots.data`) is encrypted in the user's browser **before** it ever reaches the server. The server stores ciphertext only; a full database leak reveals no portfolio contents. Encryption keys are derived from the user's password using Argon2id; data is encrypted with XChaCha20-Poly1305 with per-encryption random nonces. A separate, opt-in 24-word recovery code can be used to recover access if the password is forgotten.

With the Family plan a user can keep extra portfolios, each under its own key, and share one with a partner. The key travels to the partner in an invite link the owner sends themselves; the server never holds anything that opens a shared portfolio (§5.2, §8.7–§8.10).

We do **not** claim to defend against an actively malicious server, a compromised browser, or a forgotten password without a recovery code. Section 13 enumerates exactly what we don't protect against.

---

## 2. Scope

### In scope (v1)

- Confidentiality and integrity of `portfolio_snapshots.data` (the user's portfolio JSON: facts + reference sources).
- Authenticated key derivation tied to the user's account password.
- Optional, opt-in recovery via a 24-word code generated at signup.
- A clean migration path for existing users with plaintext snapshots.
- Extra portfolios per account, each under its own portfolio key, and sharing one with a partner who has their own account (Family plan, [#38](https://github.com/pedromlsreis/quantive/issues/38); §5.2, §6.4–§6.6, §7.3, §8.7–§8.10, §9.3).

### Out of scope (v1)

- Encryption of profile fields (`profiles.display_name`).
- Encryption of feedback messages.
- Encryption of email addresses or auth metadata (Supabase auth requires plaintext email for password reset / magic links).
- Multi-device "trust this device" flows (would require storing a wrapped key locally — deferred).
- Sharing with more than one person, and sharing the personal portfolio. A portfolio is shared with at most one partner, and the personal portfolio is never shared (§5.2).
- Subresource integrity (SRI) on the two third-party `script-src` origins (`js.stripe.com`, `eu.i.posthog.com`/`eu-assets.i.posthog.com`). The decision and rationale are documented in [`sri-policy.md`](./sri-policy.md). Stripe.js is not loaded from our HTML at all (billing is a hosted-Checkout redirect, not Stripe Elements); PostHog's bundled core ships inside our hashed, immutable assets, and the dynamically-loaded extension bundles have no published per-version hashes to pin against. Reproducible build pipelines remain out of scope (see §16 for why this matters and §15 for the path forward).

---

## 3. Threat model

### 3.1 Goals

The system MUST guarantee, under the assumed adversary capabilities (§3.3):

1. **Confidentiality at rest.** Portfolio contents cannot be recovered from the database alone, regardless of who controls it.
2. **Integrity.** The server cannot tamper with stored ciphertext without detection on decryption.
3. **User-binding.** The server cannot substitute one user's ciphertext for another user's ciphertext without the substitution being detected on decryption (binding via AAD; §6).
4. **Forward independence of password change.** Changing the account password re-wraps the data key only; existing snapshot ciphertexts remain valid and require no re-encryption.
5. **Portfolio isolation.** An extra portfolio opens only with its own key. Being someone's partner gives no access to either person's personal portfolio, and the server never holds a key that opens a shared portfolio, including while an invitation is pending.

### 3.2 Non-goals

The system does NOT defend against:

1. An **actively malicious server** that ships modified JavaScript to the user's browser. The server can serve a malicious build that exfiltrates the password during entry. This is a fundamental limitation of web-based E2E (Bitwarden, Standard Notes, ProtonMail share it). Mitigations exist (SRI, signed builds, native clients) but are out of scope for v1. See §16.
2. A **compromised user device**: malware, keyloggers, malicious browser extensions, or screen-recording software.
3. **Metadata leakage**: row counts, snapshot sizes, update timestamps, the user's email address, the existence of an account, and for shared portfolios who shares with whom, the invitee's email address and the invite and membership timestamps. The server *does* see all of these.
4. **Forgotten password without recovery code.** If the user has not opted into a recovery code and forgets their password, the data is permanently unrecoverable. This is a feature, not a bug, of true E2E.
5. **Coercion.** A user compelled to disclose their password disclosed everything.
6. **Supply chain attacks** on transitive npm dependencies (mitigated by lockfile pinning + `npm audit`, but not eliminated).
7. **Rollback of a shared portfolio across sessions.** The server can withhold a write or serve an older revision. A browser notices a stale revision only when its own compare-and-swap fails (§9.3); nothing detects an older version served to a fresh session.

### 3.3 Adversary capabilities (assumed)

| Adversary | Capability | What they can / can't do |
|---|---|---|
| **Passive database read** (leaked backup, malicious DBA, subpoena of stored data) | Reads any row in any table | Cannot decrypt portfolio data. Sees emails, timestamps, row sizes, who shares with whom, and invitees' emails. An invite row holds the portfolio key wrapped under a secret the server never sees. |
| **Active server (transient)** | Modifies stored data without modifying served JS | Detected: AAD-bound integrity check fails on next decrypt. Cannot give a partner a key of its choosing: a wrap under the invite secret verifies only for someone who knows the secret. Can withhold writes or serve an older revision (§3.2.7). |
| **Active server (persistent)** | Modifies stored data AND the served JavaScript | Wins. Out of scope (§3.2.1). |
| **Network MitM** | Reads / modifies TLS-protected traffic | Stopped by HTTPS + HSTS; we do not add app-level signing on top. |
| **Other authenticated user** | Has a valid account on the same Supabase project | Stopped by Postgres RLS + AAD binding to user_id. |
| **Partner** (Family) | Member of a shared portfolio | Reads and writes the shared portfolio, by design. Cannot read either person's personal portfolio (different key, user-bound AAD). Cannot remove the owner, change anyone's wrapped key, rotate the key or invite anyone (§7.3). Can overwrite the shared portfolio with valid but wrong content; the last 20 versions are kept and can be restored (§9.3). |
| **Removed partner** | Was a member | Loses server access at once (RLS). Keeps what they already saw, and may have kept the portfolio key from memory. After the rotation (§8.9) that key opens nothing written from then on. Versions from before the rotation stay readable with it only if they get the ciphertext some other way, such as a database leak; that is data they already had. |
| **Anyone holding an invite link** | Has the URL, including its secret | Cannot join without signing in as the invited email address, confirmed. The link works once, expires after 7 days, and stops working when the key rotates. |
| **Online credential guessing / signup abuse** (bots, credential stuffing) | Automated requests against the auth endpoints | Throttled by GoTrue rate limits and gated by Cloudflare Turnstile CAPTCHA. Perimeter only: it raises the cost of *online* guessing but is not part of the cryptographic guarantee. A leaked database is still gated by Argon2id (§4.2), not by this. |

### 3.4 Trust boundary

```
┌─────────────────────────────────┐
│  Browser (trusted)              │
│   - Password stays here         │
│   - KEK derived here            │
│   - DK lives in memory only     │
│   - Plaintext exists only here  │
└──────────────┬──────────────────┘
               │  (only ciphertext + wrapped DK + salt cross this line)
               ▼
┌─────────────────────────────────┐
│  Supabase / Network (untrusted  │
│  for confidentiality, trusted   │
│  for delivering correct JS at   │
│  TOFU)                          │
└─────────────────────────────────┘
```

---

## 4. Cryptographic primitives

All primitives are provided by **libsodium** via [`libsodium-wrappers-sumo`](https://github.com/jedisct1/libsodium.js) (the WASM build of libsodium; the `sumo` variant is required because it includes the Argon2id `crypto_pwhash` API that the standard build omits). The exact pinned version is in `package.json` and is reviewed against the [libsodium audit history](https://download.libsodium.org/doc/installation#integrity-checking) at upgrade time.

| Concern | Primitive | libsodium API |
|---|---|---|
| Authenticated encryption (AEAD) | XChaCha20-Poly1305 | `crypto_aead_xchacha20poly1305_ietf_encrypt` / `_decrypt` |
| Password-based KDF | Argon2id (RFC 9106) | `crypto_pwhash` with `crypto_pwhash_ALG_ARGON2ID13` |
| Random bytes | OS CSPRNG (via `crypto.getRandomValues`) | `randombytes_buf` |
| Constant-time comparison | libsodium internal (Poly1305 tag verification) | `crypto_aead_*_decrypt` (returns failure, no oracle) |
| Memory zeroing | best-effort (JS limitation) | `sodium_memzero` |

### 4.1 Why XChaCha20-Poly1305 (not AES-GCM)

XChaCha20-Poly1305 has a **192-bit nonce**. Random nonces collide only after ~2^96 encryptions per key — effectively never. AES-GCM has a 96-bit nonce, where random-nonce collisions become a concern at ~2^32 messages per key (NIST SP 800-38D, §8.3). For a personal dashboard the AES-GCM bound would also be fine in practice, but XChaCha20-Poly1305 removes the question entirely and matches the modern default in libsodium / Tink / WireGuard.

XChaCha20-Poly1305 is documented in [draft-irtf-cfrg-xchacha](https://datatracker.ietf.org/doc/draft-irtf-cfrg-xchacha/). It is not (yet) an IETF RFC, but it is a published construction over the RFC 8439 ChaCha20-Poly1305 primitives via the `HChaCha20` nonce-extension function, and is broadly deployed.

### 4.2 Argon2id parameters

| Parameter | Value | Rationale |
|---|---|---|
| Algorithm | Argon2id | OWASP 2024 recommendation; resistant to both side-channel and GPU/ASIC attacks |
| Time cost (`opslimit`) | 3 | One step above libsodium `INTERACTIVE` (2) |
| Memory cost (`memlimit`) | 64 MiB (67 108 864 bytes) | Works on mid-range mobile browsers without OOM; stronger than `INTERACTIVE` would imply |
| Parallelism | 1 (libsodium default for `crypto_pwhash`) | libsodium does not expose parallelism; single-threaded is acceptable in browser |
| Salt | 16 random bytes per user | libsodium `crypto_pwhash_SALTBYTES` |
| Output length | 32 bytes | XChaCha20-Poly1305 key size |

These parameters intentionally trade some strength for mobile feasibility. Plan to revisit annually as device baselines improve. The KDF cost is documented in `enc_version` so future versions can bump these without breaking decrypt.

### 4.3 Why Argon2id (not PBKDF2 / scrypt / bcrypt)

- **PBKDF2** is no longer state of the art (no memory hardness; cheap on GPUs). Acceptable for legacy compat but not for new designs in 2026.
- **scrypt** is fine but lacks Argon2's side-channel resistance (Argon2id is a hybrid of memory-hard `Argon2d` and side-channel-resistant `Argon2i`).
- **bcrypt** is for password *storage* (not key derivation); 72-byte input limit.

Argon2id is the OWASP recommendation, the libsodium default for `crypto_pwhash`, and the choice made by 1Password, Bitwarden, and Standard Notes.

---

## 5. Key hierarchy

```
                  user password (entered on login form)
                          │
                          │  Argon2id(salt = user_keys.kdf_salt,
                          │           t=3, m=64MiB, output=32B)
                          ▼
                       KEK (32B)            in memory only;
                          │                 zeroed on logout
                          │  XChaCha20-Poly1305 unwrap
                          │  AAD = "nwa-dk-v1" || 0x00 || user_uuid
                          ▼
                       DK (32B)             in memory only;
                          │                 zeroed on logout
                          │  XChaCha20-Poly1305 encrypt
                          │  AAD = snapshot AAD (§6.2)
                          ▼
            snapshot ciphertext + nonce
            (stored in portfolio_snapshots)
```

### 5.1 Key lifetimes

| Key | Generated | Stored on server? | Lives in memory… |
|---|---|---|---|
| Password | typed by user | never | only during login (immediately consumed by Argon2id, then zeroed) |
| KEK | derived from password + salt | never | until logout / tab close |
| DK | once at signup, random | yes, **wrapped** | until logout / tab close |
| Recovery code | once at signup if opted in | never (user holds) | only when entered for recovery |
| Recovery KEK | derived from recovery code | never | only during recovery flow |
| Portfolio key (PK) | when an extra portfolio is created, and at each rotation (§8.9) | yes, **wrapped**: once per member under their DK, and under S while an invite is pending | with the DK: zeroed on lock, logout, user change and tab close |
| Invite secret (S) | per invitation, in the owner's browser | never | owner's browser until the link is shown; partner's browser from opening the link until they join |

The DK is generated **once at signup** and never rotates by default. This means a single compromised KEK at any point in the user's history exposes all snapshots. For most users this is fine; for paranoid users we may add an explicit "rotate data key" flow later (re-encrypts every snapshot with a new DK).

### 5.2 Portfolio keys (extra portfolios and sharing)

```
DK (per user) ──wraps──► PK_p (32B, one per extra portfolio p)
                            │  stored wrapped, once per member (portfolio_members.wrapped_pk)
                            ▼
               portfolio blob ciphertext (portfolios.encrypted_data)

S (32B invite secret, URL fragment only) ──wraps──► PK_p   (single use, while an invite is pending)
```

- **PK_p** is random, generated by the owner's browser when the portfolio is created. It is stored only wrapped: under each member's DK, and under S while an invitation is pending. In memory it has the DK's lifetime (§12).
- **S** is random, generated per invitation. It exists only in the owner's browser, in the invite link, and in the partner's browser while they accept. It never reaches the server (§8.8).
- Every wrap uses the §7.1 wire format: `nonce(24) || ciphertext_with_tag`, 72 bytes for a 32-byte key.
- **No new primitives.** Sharing uses the same XChaCha20-Poly1305 wrap as the rest of this document; there is no public-key cryptography (§5.3).

The personal portfolio does not move to a portfolio key. It keeps its key, AAD and storage (§5, §6.2, §9.1), its ciphertext was never re-encrypted, and it is never shared. Its AAD binds it to the user (§3.1.3), which is a stronger guarantee than binding to a portfolio.

### 5.3 Why an invite link rather than public keys

An earlier plan wrapped PK to each member's public key with libsodium `crypto_box`. It was dropped:

- **Authenticity.** Public keys would be fetched from the server, so a malicious server could hand the owner its own key at invite time. Ruling that out needs both people to compare a fingerprint over another channel. The invite link already travels over another channel, and it carries the key itself.
- **Surface.** Public keys add a keypair per user, a wrapped private key, and another primitive to audit and maintain.
- **Cost.** Quantive cannot email the invitation; the owner sends the link themselves. That is accepted as the price of the server never being able to open a shared portfolio.

---

## 6. Authenticated additional data (AAD) — binding rules

AAD prevents the server from substituting ciphertext between users or between fields without detection. Every encryption operation in the system uses an AAD computed deterministically from context. AAD format is **versioned** so it can evolve.

### 6.1 AAD for wrapping the DK with KEK

```
AAD = "nwa-dk-v1" || 0x00 || user_uuid_bytes (16B)
```

Where `user_uuid_bytes` is the canonical RFC 4122 binary form of the user's auth UUID.

### 6.2 AAD for snapshot encryption

```
AAD = "nwa-snap-v1" || 0x00 || user_uuid_bytes (16B) || enc_version_le_u32 (4B)
```

A server attempting to copy `user_A`'s snapshot ciphertext into `user_B`'s row would cause decryption to fail because the AAD `user_B` would not match the AEAD tag computed under `user_A`. Likewise an attempt to silently downgrade `enc_version` would fail.

### 6.3 AAD for wrapping DK with recovery code

```
AAD = "nwa-rec-v1" || 0x00 || user_uuid_bytes (16B)
```

### 6.4 AAD for wrapping a portfolio key under a member's DK

```
AAD = "nwa-pk-v1" || 0x00 || user_uuid (16B) || portfolio_uuid (16B) || key_epoch_le_u32 (4B)
```

Bound to both the member and the portfolio: the server cannot move one member's wrapped PK to another member or another portfolio without decryption failing.

### 6.5 AAD for a portfolio blob

```
AAD = "nwa-pf-v1" || 0x00 || portfolio_uuid (16B) || key_epoch_le_u32 (4B) || enc_version_le_u32 (4B)
```

Bound to the portfolio rather than a user, because either member may write it.

### 6.6 AAD for wrapping a portfolio key under an invite secret

```
AAD = "nwa-inv-v1" || 0x00 || invite_uuid (16B) || portfolio_uuid (16B) || key_epoch_le_u32 (4B)
```

`key_epoch` starts at 1 and increases with every rotation (§8.9). A wrap or blob cannot be presented under another epoch without detection, and an invitation made before a rotation cannot be redeemed after it. The portfolio and invite ids are generated by the client, because they are bound into the AAD before the rows exist.

---

## 7. Storage model (schema changes)

### 7.1 New table: `user_keys`

```sql
CREATE TABLE public.user_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Argon2id salt for password → KEK derivation. Random per user, 16 bytes.
  kdf_salt BYTEA NOT NULL,

  -- DK wrapped under KEK. Format: nonce(24B) || ciphertext_with_tag.
  wrapped_dk_kek BYTEA NOT NULL,

  -- DK wrapped under recovery KEK (NULL if user did not opt in).
  -- Same format: nonce(24B) || ciphertext_with_tag.
  wrapped_dk_recovery BYTEA,

  -- Argon2id salt for recovery_code → recovery_KEK derivation.
  -- NULL if wrapped_dk_recovery is NULL.
  recovery_kdf_salt BYTEA,

  -- KDF parameter version. enc_version=1 means Argon2id t=3, m=64MiB.
  enc_version INT NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    (wrapped_dk_recovery IS NULL AND recovery_kdf_salt IS NULL)
    OR
    (wrapped_dk_recovery IS NOT NULL AND recovery_kdf_salt IS NOT NULL)
  )
);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own keys"
  ON public.user_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own keys"
  ON public.user_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own keys"
  ON public.user_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 7.2 Changes to `portfolio_snapshots`

```sql
ALTER TABLE public.portfolio_snapshots
  ADD COLUMN encrypted_data BYTEA,
  ADD COLUMN nonce BYTEA,
  ADD COLUMN enc_version INT NOT NULL DEFAULT 0;

-- enc_version semantics:
--   0  = legacy plaintext (historic). No longer readable by the load path;
--        see §11. The `data` JSONB column still exists in the schema for
--        backfill/audit but is NULL on every migrated row.
--   1  = v1 encrypted. Read from `encrypted_data` BYTEA + `nonce`; data IS NULL.

-- Invariant (enforced app-side):
--   enc_version = 1 ⇔ data IS NULL AND encrypted_data IS NOT NULL AND nonce IS NOT NULL
```

The legacy plaintext column is retained in the schema for forensic reasons only — every supported row has it `NULL`. See §11 for the migration history.

### 7.3 Extra portfolios and sharing

Migrations [`20260930120000_portfolios.sql`](../../supabase/migrations/20260930120000_portfolios.sql), [`20261001120000_portfolio_sharing.sql`](../../supabase/migrations/20261001120000_portfolio_sharing.sql) and [`20261002120000_family_billing.sql`](../../supabase/migrations/20261002120000_family_billing.sql).

| Table | Holds | Who can write |
|---|---|---|
| `portfolios` | `owner_id`, blob ciphertext and nonce, `enc_version`, `revision`, `key_epoch`, `rotation_due`, `saved_at`/`saved_by` | Only through database functions; clients have no INSERT or UPDATE. The owner may DELETE. `revision` is set by the functions, never by a client. |
| `portfolio_members` | One row per member: `wrapped_pk`, `key_epoch` | Inserted only by functions; no UPDATE. DELETE lets a partner leave and the owner remove the partner. Nobody can delete the owner's row. |
| `portfolio_invites` | `invitee_email` (lower-case), PK wrapped under S, `key_epoch`, `expires_at` (7 days), consumption fields | Only through functions, except that the owner may DELETE (revoke) a pending invite. The wrapped PK is cleared when the invite is accepted; expired invites are purged daily. |
| `family_partners` | One `partner_id` per owner | Only through functions. A trigger rejects any member other than the owner who is not the owner's partner, and frees the seat once the partner is in none of the owner's portfolios. |
| `portfolio_revisions` | The last 20 ciphertexts a save replaced, with who saved them and when | A trigger. Members can read them to restore a version (§9.3). |
| `portfolio_key_history` | The owner's wrap of each retired PK | Written by `rotate_portfolio_key`. Readable only by that owner, to open versions from before a rotation. The removed partner already had these keys, so keeping them costs nothing. |

`portfolios.owner_id` is the only record of ownership. Every table has RLS: a portfolio and its rows are visible only to its owner and members; invites only to their creator. The database functions are:

- `create_portfolio`: sets the owner to the caller; at most 5 per owner.
- `save_portfolio`: a compare-and-swap on `revision` and `key_epoch` that returns `ok`, `conflict` or `forbidden`.
- `create_portfolio_invite`: the caller must own the portfolio and have the Family plan, no rotation may be due, and the epoch must be current. "Has the Family plan" is `has_family()`: a `family_beta` row, or an active, trialing or past-due subscription whose `profiles.subscription_plan` is `family`. Only the service role writes either (the Stripe webhook and `check-subscription` write the plan); clients can't insert or update those columns. `accept_portfolio_invite` applies the same test to the owner. Once the seat is taken, invites can only go to that partner. A new invite replaces the pending one.
- `get_portfolio_invite` and `accept_portfolio_invite`: see §8.8. Statuses that describe the invite come only after the caller's email matches, so a stranger holding the id learns only that it isn't theirs.
- `rotate_portfolio_key`: owner only, and only once the owner is the only member left.
- `list_portfolio_people`: the members of the caller's portfolios, with their email addresses.
- `release_owned_portfolios`: service role only; see §8.10.

---

## 8. Authentication and key derivation flow

### 8.1 Signup (new user, opting into recovery)

The sequence below is the logical order. In the implementation, keys are created at the account's first unlock rather than inside the signup call. [`detectAndUnlock`](../../src/lib/keySession/ops.ts) finds no `user_keys` row, runs steps a–e and inserts the row with the recovery columns NULL (step k). The recovery code (steps f–j) is offered straight after that unlock and can be set up later from Settings. Both paths wrap the already-unlocked DK (§10).

```
1. User enters: email, password (and confirms it)
2. Browser calls Supabase auth signUp(email, password)
   → Supabase stores its own bcrypt of the password (its standard mechanism)
3. On success:
     a. salt        = randombytes(16)
     b. KEK         = Argon2id(password, salt, t=3, m=64MiB, len=32)
     c. DK          = randombytes(32)
     d. nonce_kek   = randombytes(24)
     e. wrap_kek    = AEAD_encrypt(key=KEK, nonce=nonce_kek,
                                    plaintext=DK, aad=AAD_dk(§6.1))
     f. recovery_code = generate_24_word_mnemonic()       // §10
     g. r_salt      = randombytes(16)
     h. R_KEK       = Argon2id(recovery_code, r_salt, t=3, m=64MiB, len=32)
     i. nonce_rec   = randombytes(24)
     j. wrap_rec    = AEAD_encrypt(key=R_KEK, nonce=nonce_rec,
                                    plaintext=DK, aad=AAD_rec(§6.3))
     k. INSERT INTO user_keys (user_id, kdf_salt, wrapped_dk_kek,
                                wrapped_dk_recovery, recovery_kdf_salt,
                                enc_version) VALUES (..., 1)
4. UI displays recovery_code ONCE with strong "save this" warnings
   and a confirmation step ("type the 8th word to confirm you saved it")
5. Zero(KEK), Zero(DK), Zero(recovery_code) — DK is regenerated on next login
```

### 8.2 Signup (without recovery)

Same as §8.1 but skip steps `f`–`j`. `wrapped_dk_recovery` and `recovery_kdf_salt` remain NULL. User is shown a clear warning that forgetting the password = data loss, with a "I understand" confirmation. Recovery can be opted into later from settings (re-prompts for password to unwrap DK).

### 8.3 Login (existing user)

```
1. User enters: email, password
2. Browser calls Supabase auth signIn(email, password)
   → on success: session token + auth.uid()
3. SELECT kdf_salt, wrapped_dk_kek FROM user_keys WHERE user_id = auth.uid()
4. KEK = Argon2id(password, kdf_salt, t=3, m=64MiB, len=32)
5. nonce_kek || ct_kek = wrapped_dk_kek
   DK = AEAD_decrypt(key=KEK, nonce=nonce_kek, ciphertext=ct_kek,
                      aad=AAD_dk(§6.1))
   → If decrypt fails: password is wrong (or wrap is corrupted)
6. Hold KEK + DK in memory for the session
7. Zero(password)
```

If step 3 returns no row, the client checks for a `portfolio_snapshots` row:

- **No snapshot:** this is the account's first unlock, and keys are provisioned (§8.1).
- **A snapshot exists:** unlock fails with `MissingKeysError` ([`ops.ts`](../../src/lib/keySession/ops.ts)). The DK that encrypted the snapshot is gone, and provisioning a new one would leave the snapshot undecryptable without telling anyone. The unlock prompt tells the user to reset their password, which clears both rows (§8.5).

Pre-#33 plaintext users were all migrated during the rollout window (§11). A missing `user_keys` row next to a snapshot today means a partial account-creation failure or a manual intervention, and the client never "recovers" from it by falling back to plaintext.

### 8.4 Recovery (forgotten password)

```
1. User clicks "forgot password" → standard Supabase email reset flow
2. User sets new_password via Supabase reset
3. On first login with new password:
     a. KEK_new fails to unwrap wrapped_dk_kek (old salt + old password baked in)
        → UI prompts: "Your data is encrypted with your old password.
                       Enter your recovery code to unlock and re-encrypt."
     b. User pastes 24-word recovery_code
     c. R_KEK = Argon2id(recovery_code, recovery_kdf_salt, t=3, m=64MiB, len=32)
     d. nonce_rec || ct_rec = wrapped_dk_recovery
     e. DK = AEAD_decrypt(key=R_KEK, nonce=nonce_rec, ciphertext=ct_rec,
                           aad=AAD_rec(§6.3))
4. Now we have DK. Re-wrap DK under the new password:
     a. salt_new      = randombytes(16)   // fresh salt!
     b. KEK_new       = Argon2id(new_password, salt_new, t=3, m=64MiB, len=32)
     c. nonce_kek_new = randombytes(24)
     d. wrap_kek_new  = AEAD_encrypt(KEK_new, nonce_kek_new, DK, aad=AAD_dk)
     e. UPDATE user_keys SET kdf_salt=salt_new, wrapped_dk_kek=wrap_kek_new
5. Optionally rotate the recovery code (recommended after recovery is used).
```

If the user has no recovery code AND forgot the password, data is unrecoverable. This is communicated upfront at signup (§8.2).

### 8.5 Password reset without recovery — explicit consequence

The Supabase email-based password reset flow rotates the account credential, but it cannot by itself rewrap the user's `wrapped_dk_kek`: the wrap is keyed under the *old* password, and the reset flow never sees the old password. There are exactly three outcomes after a reset:

1. **User has no encrypted snapshots yet** (e.g. fresh account, plaintext-era account that hasn't been migrated). Reset proceeds as a normal password change. Nothing to rewrap.
2. **User has a recovery code.** On next sign-in, decryption with the new KEK fails; the UI prompts for the recovery code, recovers the DK, and re-wraps it under a fresh KEK derived from the new password (§8.4 step 4).
3. **User has encrypted snapshots and no recovery code.** The old wrap cannot be opened by the new password, and there is no second wrap to fall back on. The encrypted data is permanently unrecoverable.

Outcome (3) is consistent with the threat model (§3.2.4) but is operationally distinct enough to be called out separately: it can happen even to a user who *remembers* their password but resets "just in case", and our UI must surface this before the reset is confirmed. The reset page in the app shows an explicit warning when the account is in the encrypted-no-recovery state, and the user must tick a box accepting the loss.

On submit, the reset page first calls the [`reset-encrypted-data`](../../supabase/functions/reset-encrypted-data/index.ts) edge function, then changes the password:
- The function first passes any extra portfolio the user shares to the partner, who can still open it, and deletes the user's other extra portfolios (§8.10). It then deletes the user's portfolio memberships and retired portfolio keys, their `portfolio_snapshots` row and finally their `user_keys` row, stopping at the first failure. The next unlock provisions fresh keys (§8.1) and the account starts empty.
- The function only runs for a session opened from an emailed link (amr method `otp`) within the last hour. A session opened with a password, including a stolen one, cannot wipe data.
- If the wipe fails, the password is not changed.

The same path handles a snapshot whose `user_keys` row is missing (§8.3).

### 8.6 Sign-out and client-side data lifecycle

Authenticated users' decrypted portfolio never touches localStorage. Cloud is the single source of truth post-decode (§9.2). Guests — unauthenticated visitors using the demo or local-only flow — keep a plaintext `portfolio-data` cache for offline-first ergonomics; the threat model accepts this because there's no account to leak across.

A single watcher in `PortfolioContext` enforces the boundary on every user-id transition (sign-out, account switch). Mirrors `KeySessionContext`'s KEK/DK zeroing pattern (§5.1) so cleanup is centralised rather than spread across every signOut caller:

```
Trigger: user.id changes from a non-null previous value to anything else
Action:
  - setData(null), setFilters(default), setIsMockData(false), syncStatus='idle'
  - invalidate any in-flight cloud save (bump requestId, drop refs)
  - localStorage.removeItem:
      portfolio-data
      portfolio-data-is-mock
      add-measurement-draft
      portfolio-custom-milestones
      recovery-offered:<previousUserId>
      onboarding-dismissed:<previousUserId>
      active-portfolio:<previousUserId>       // last-open extra portfolio (§9.3)
  - sessionStorage.removeItem:
      welcome-invoked:<previousUserId>
  - clearAttribution()                       // UTM key from analytics
  - QueryCacheGuard separately clears React Query cache
  - KeySessionContext separately zeros KEK/DK
```

The invite secret S (§8.8) is never written to storage, so the watcher has nothing to wipe for it; it lives in a module variable and is zeroed once used.

A `beforeunload` handler on authed users wipes the same data + draft keys as defence-in-depth against tab close without explicit sign-out. JS gives no guarantee here, but it raises the bar against another user opening the browser and seeing a previous tab's cache.

The guest-load effect (which rehydrates a guest cache on page load) is gated on `authLoading` so it cannot race `getSession()` and flash a prior user's data to whoever opened the tab before auth resolves.

What survives the watcher by design: `sb-*` (Supabase auth, cleared by `supabase.auth.signOut()`), `quantive_analytics_consent` (intentional cross-session), and `pref-*` / `preferred-currency` (preferences, not data — server profile rehydrates on next login).

`/settings` and `/admin` are auth-gated via `RequireAuth`; other shell routes stay guest-accessible because they double as demo entry points and now have no cache to leak.

### 8.7 Create an extra portfolio (owner)

```
1. pid     = uuid v4 (client)
   PK      = randombytes(32)
2. wrap    = AEAD_encrypt(key=DK, nonce, PK, aad=AAD_pk(user, pid, epoch=1))      // §6.4
3. ct      = AEAD_encrypt(key=PK, nonce, JSON(portfolio + name), aad=AAD_pf(pid, 1, enc_version))   // §6.5
4. create_portfolio(pid, wrap, ct, nonce)
```

The portfolio's name is inside the ciphertext; the server stores no plaintext name.

### 8.8 Invite and accept

```
Owner:
1. S        = randombytes(32)
   iid      = uuid v4
2. wrap_inv = AEAD_encrypt(key=S, nonce, PK, aad=AAD_inv(iid, pid, epoch))     // §6.6
3. create_portfolio_invite(iid, pid, invitee_email, wrap_inv, epoch)
4. link     = https://<origin>/join/<iid>#k=<base64url(S)>
   Shown once; the owner sends it through a channel of their choice.
   Zero(S)

Partner:
5. Opens the link. Before the app starts, the page reads S from the
   fragment into memory and removes it from the address bar.
6. Signs in with the invited email address (confirmed) and unlocks (§8.3).
7. get_portfolio_invite(iid) → wrap_inv, pid, epoch. Returned only to that account.
8. PK       = AEAD_decrypt(key=S, nonce, wrap_inv, aad=AAD_inv(iid, pid, epoch))
   Fails if S, iid, pid or epoch differ; nothing is sent in that case.
9. wrap_p   = AEAD_encrypt(key=DK_partner, nonce, PK, aad=AAD_pk(partner, pid, epoch))
10. accept_portfolio_invite(iid, wrap_p)
    Locks the portfolio row, then in one UPDATE consumes the invite
    (pending, unexpired, current epoch) and clears wrap_inv; takes the
    partner seat; inserts the member row.
11. Zero(S), Zero(PK)
```

- Browsers do not send URL fragments in requests or in `Referer` headers.
- [`inviteFragment.ts`](../../src/lib/inviteFragment.ts) is the first import of the app entry, so S is out of the address bar before analytics or the router start. Analytics also strips any fragment from every URL it sends and collapses `/join/<id>` to `/join`.
- Joining takes both factors: the link (for S) and a signed-in, confirmed account for the invited email address.
- The row the server keeps is useless without S.
- A new partner who still has to confirm their email address can come back to the same tab afterwards; after a reload, S is gone and the link has to be opened again.

### 8.9 Removing the partner, or the partner leaving

```
1. The member row is deleted: by the owner (remove), or by the partner (leave).
   RLS cuts the partner's access at once. A trigger sets rotation_due and
   deletes any invite still pending.
2. The owner's browser rotates the key: straight away after a removal, or
   on its next load when the partner left.
     PK'    = randombytes(32)
     epoch' = epoch + 1
     ct'    = AEAD_encrypt(key=PK', nonce, plaintext, aad=AAD_pf(pid, epoch', enc_version))
     wrap'  = AEAD_encrypt(key=DK_owner, nonce, PK', aad=AAD_pk(owner, pid, epoch'))
     rotate_portfolio_key(pid, expected_revision, epoch, ct', nonce, wrap')
   The function keeps the owner's previous wrap in portfolio_key_history.
3. Invitations made before the rotation wrap the old PK under the old
   epoch, and are rejected.
```

Rotation re-wraps PK' for the owner only. That is complete because a portfolio has a single partner seat: once the partner is gone, the owner is the only member left, and `rotate_portfolio_key` refuses to run while anyone else is. A design with more seats would have to re-wrap PK' for every remaining member.

### 8.10 Account deletion and resetting encrypted data

Both run [`release_owned_portfolios`](../../supabase/migrations/20261001120000_portfolio_sharing.sql) before the user's own rows are deleted:

- A portfolio the user owns that has a partner passes to the partner, who already holds its key. The user's member row then goes, which sets `rotation_due`, so the new owner re-keys it on their next load.
- A portfolio without a partner is deleted.
- `portfolios.owner_id` is `ON DELETE RESTRICT`. If the release fails, the deletion stops instead of cascading a partner's data away.

The same applies to the wipe after a password reset without a recovery code (§8.5): the user can no longer open their portfolio keys, but their partner can.

Without the Family plan, the new owner can view and export the portfolio but not edit it. The same holds for both people when a Family subscription ends. Like every plan limit, this is enforced in the client; it protects revenue, not confidentiality, and the server still refuses new invites.

When a partner deletes their account, their member row goes, `rotation_due` is set and the seat frees.

---

## 9. Encryption / decryption flow

### 9.1 Save snapshot

```
INPUT: portfolio: PortfolioData       // facts + refSources
       DK: 32B in memory
       user_uuid: UUID

1. plaintext = JSON.stringify(portfolio)            // UTF-8 bytes
2. nonce     = randombytes(24)
3. aad       = build_snapshot_aad(user_uuid, 1)     // §6.2
4. ct        = AEAD_encrypt(key=DK, nonce, plaintext, aad)

5. UPSERT INTO portfolio_snapshots
     (user_id, encrypted_data, nonce, enc_version, data)
   VALUES
     (user_uuid, ct, nonce, 1, NULL)
   ON CONFLICT (user_id) DO UPDATE
     SET encrypted_data = EXCLUDED.encrypted_data,
         nonce          = EXCLUDED.nonce,
         enc_version    = EXCLUDED.enc_version,
         data           = NULL
```

The `ON CONFLICT (user_id)` upsert depends on the unique constraint added in [#33's prereq migration](../../supabase/migrations/20260430202925_portfolio_snapshots_unique_user.sql).

### 9.2 Load snapshot

```
1. SELECT enc_version, encrypted_data, nonce
   FROM portfolio_snapshots WHERE user_id = auth.uid()
   ORDER BY updated_at DESC LIMIT 1

2. IF enc_version = 1:
     aad       = build_snapshot_aad(user_uuid, 1)
     plaintext = AEAD_decrypt(key=DK, nonce, ciphertext=encrypted_data, aad)
              // throws if tag mismatch → integrity failure → surface to user
   ELSE:
     fail with "unsupported snapshot enc_version: N"
     // includes the historic enc_version=0 plaintext marker — see §11.

3. portfolio = JSON.parse(plaintext)
```

### 9.3 Save and load an extra portfolio

Loading lists every portfolio the user is a member of, unwraps each PK with the DK (§6.4) and decrypts each blob (§6.5). A portfolio that fails to open is skipped and counted, so it cannot hide the others.

Two people can write the same blob, so a save is a compare-and-swap, and edits are kept as operations until they are saved ([`portfolioOps.ts`](../../src/lib/portfolioOps.ts), [`portfolioSync.ts`](../../src/lib/portfolioSync.ts)):

```
1. Each edit (an entry, a source rename, a goal, …) is applied to what is on
   screen and queued as an op.
2. One write at a time: encrypt(stored version + queued ops) and call
   save_portfolio(pid, expected_revision, key_epoch, ct, nonce, enc_version).
3. ok        → the written content becomes the stored version; those ops are done.
   conflict  → someone saved first. Fetch and decrypt their version, apply the
               queued ops to it again, and write again.
   forbidden → access is gone (removed, or the portfolio was deleted). Stop.
```

- Applying an op twice changes nothing, because a save can land while its response is lost.
- An op that no longer applies after a replay is dropped with a message, for example renaming a source to a name the partner just used. Replacing everything (a spreadsheet import, or restoring a version) is dropped rather than replayed, so it cannot silently wipe the other person's edits.
- Fact dates in an extra portfolio are stored as calendar days (`YYYY-MM-DD`) and read as local midnight, so partners in different time zones see the same day.
- A partner's saves appear when the window regains focus; there is no realtime channel.
- Each save keeps the version it replaced (`portfolio_revisions`, last 20). Restoring one saves it as a new version, so the restore can itself be undone.

---

## 10. Recovery code

### 10.1 Generation

```
mnemonic = bip39_generate(32 bytes of entropy → 24 words)
```

The 24-word BIP-39 mnemonic gives 256 bits of entropy. We use the BIP-39 word list because it is well-known to crypto-savvy users and produces memorable, transcribable codes. We do **not** use BIP-39's HD-derivation semantics — only the encoding.

### 10.2 Display

The mnemonic is displayed once, post-signup, with:

- Strong visual warnings ("You will need this if you forget your password. We cannot recover it for you.")
- A copy-to-clipboard button
- A download button (saves a `.txt`)
- A confirmation step that requires the user to type back **one specific word** (e.g., the 8th word) to ensure they actually saved it

### 10.3 Use as KDF input

The mnemonic words are joined with single ASCII spaces (BIP-39 normalization rules — NFKD, lowercase, single space) before being fed to Argon2id. Casing and whitespace ambiguity in user input is handled by the UI (case-insensitive, whitespace-collapsed) before normalization.

---

## 11. Migration of existing users (lazy) — completed

This section is kept for historical context. The migration described here ran during the `enc_version = 1` rollout window; the code paths it relied on are no longer present in the load flow.

At the rollout of `enc_version = 1`, existing users had `portfolio_snapshots` rows with `enc_version = 0` and plaintext `data`. They were migrated lazily on next login:

```
1. After successful login (§8.3) and DK unlock:
     a. SELECT enc_version, data FROM portfolio_snapshots WHERE user_id = ?
     b. IF enc_version = 0:
          - plaintext = data
          - encrypt and upsert per §9.1 (writes enc_version=1, clears `data`)
2. UI showed a one-time toast: "Your data is now end-to-end encrypted."
```

Once the active user base had migrated, the v0 reader was removed from both `decodeSnapshot` (in `src/lib/cloudSync.ts`) and `decryptSnapshot` (in `src/lib/crypto/snapshot.ts`). The `data JSONB` column itself remains in the schema, but is `NULL` on every migrated row. A v0 row encountered today cannot be loaded by the current build — by design.

If a stuck v0 row is ever surfaced (an account that signed up before #33, never returned during the rollout window, and is now trying to load), the recovery path is a manual server-side migration — not re-introducing the v0 reader in the client.

---

## 12. Memory hygiene

JavaScript provides no hard memory-zeroing guarantee due to garbage collection. We approximate as best we can:

- Sensitive buffers (`password`, `KEK`, `DK`, `recovery_code`) are held in `Uint8Array` instances, **not** strings.
- After use, `sodium.memzero(buf)` is called.
- On `logout()`: zero KEK and DK, drop references.
- On `beforeunload`, and after an idle timeout (default 15 minutes; configurable in Settings as off, 5, 15, 30 or 60 minutes): zero KEK and DK and force a re-prompt on the next action. Background tabs throttle timers, so the timeout is also checked on `visibilitychange` when the tab becomes visible again.
- KEK and DK are **never** placed in `localStorage`, `sessionStorage`, IndexedDB, or any persistent store.
- Portfolio keys follow the DK: held in the same in-memory store and zeroed with it on lock, logout and user change. A key replaced by a rotation is zeroed.
- The invite secret S is held in memory from the moment the page reads it until the invite is accepted, then zeroed. It is never stored.

A hostile script running in the same origin (XSS) bypasses all of this — see §13.

---

## 13. What we explicitly do NOT defend against

We will publish exactly this list on the public privacy / security page so users can self-select.

1. **Active malicious server.** A compromised Supabase project (or a malicious operator) can ship modified JavaScript on the next page load that exfiltrates the password as the user types. The encryption design assumes the JS the browser runs is the JS this repository describes. Our first-party assets are emitted by Vite with hashed filenames and served `immutable`, which means the bytes at any given `/assets/*.js` URL are bound to their hash; an attacker who replaces the bytes must also collide the filename. The stronger mitigations — signed builds, a native client — are not in v1. Subresource integrity on third-party `script-src` origins is documented in [`sri-policy.md`](./sri-policy.md): not applicable to Stripe (we do not load Stripe.js), and not pursued for PostHog's runtime-loaded extension bundles (vendor publishes no per-version hashes; a pinned hash would break on the next silent rotation).

2. **Compromised user device.** Malware, keyloggers, and malicious browser extensions run with the user's privileges and can read everything the user sees. No application-level mitigation.

3. **Cross-site scripting (XSS)** in our own application. A successful XSS in a logged-in tab can read the in-memory KEK and DK. Mitigations: strict CSP, input sanitization, code review, dependency auditing. We do not claim the codebase is XSS-free; we claim we follow standard practices and welcome reports.

4. **Metadata leakage.** The server sees: account existence, email, login timestamps, snapshot sizes (which leak rough portfolio complexity), update frequencies, and for shared portfolios who shares with whom and the invitee's email address. None of this is encrypted.

5. **Supply chain attacks** on transitive npm dependencies. Lockfile pinning + `npm audit` + Dependabot mitigate but do not eliminate.

6. **Forgotten password without recovery code.** Permanent data loss. By design.

7. **Coercion.** Legal, physical, or social pressure to disclose the password.

8. **A partner keeping what they saw.** A partner can read, export or copy a shared portfolio while they are a member. Removing them and rotating the key stops access to what is written afterwards, not to what they already had.

---

## 14. Open-source posture

The encryption module (`src/lib/crypto/`) is licensed under the MIT License (see [`src/lib/crypto/LICENSE`](../../src/lib/crypto/LICENSE)) and is intended to be reviewed in isolation. It contains no Quantive-specific business logic — it is a thin wrapper over libsodium with explicit AAD framing. The rest of the repository is licensed under the PolyForm Noncommercial License 1.0.0.

The module will:

- Have **no I/O**: pure functions only. Database calls and network calls happen in higher layers.
- Ship with a **Known Answer Test (KAT) vector** from draft-irtf-cfrg-xchacha (XChaCha20-Poly1305 §A.3.1) executed in the test suite. For Argon2id we exercise the configured production parameters (`t=3, m=64MiB`) for determinism, salt sensitivity, and password sensitivity, but do not match RFC 9106's published vectors: libsodium's `crypto_pwhash` hard-codes parallelism to `p=1`, and every RFC 9106 vector uses `p ≥ 4`.
- Ship with a **fuzz target** (decryption with random ciphertexts, expecting failure) to catch accidental oracles.
- Be **unit-tested at >95% line coverage**.

---

## 15. Future work

Out of scope for v1, tracked separately:

- **Signed bundles** (mitigates active malicious server). Couples to [#37](https://github.com/pedromlsreis/quantive/issues/37) (own domain) where we control the deploy pipeline. Subresource Integrity is *not* in this list — see [`sri-policy.md`](./sri-policy.md) for why pinning hashes on the current third-party origins is counter-productive given the vendor stability guarantees on offer.
- **Multi-device "remember me"** via a device key wrapped in a hardware-backed CryptoKey (WebAuthn / Passkeys).
- **Data key rotation** flow for paranoid users (the password wrap and recovery wrap can already rotate independently; the underlying DK does not).
- **More than one partner per portfolio.** Rotation would have to re-wrap the new key for every remaining member (§8.9), and the partner seat would become a list.
- **Detecting rollback of a shared portfolio** across sessions (§3.2.7), for example with a revision counter each member signs and remembers.
- **Realtime updates between partners.** Today a partner's saves appear when the window regains focus (§9.3).
- **PAKE-based authentication** (OPAQUE / SRP-6a) so the password is never sent to the server even for auth. Eliminates the "Supabase auth sees password" caveat. Requires replacing Supabase auth or layering custom auth.
- **Third-party security audit** by a recognized firm (Trail of Bits, NCC Group, Cure53). Targeted at the crypto module + auth flow. Funded post-revenue.

---

## 16. The "actively malicious server" caveat (read this)

This is the single most important honest caveat in this entire design.

When a user opens the site, the server delivers the JavaScript that runs. If the server is compromised (or compelled), it can deliver JavaScript that says "exfiltrate the password and the DK to my logging endpoint" instead of "encrypt the data locally." Once that happens, all the cryptography in this document is bypassed.

This applies equally to **every web-based E2E system in existence**: Bitwarden's web vault, ProtonMail's web app, Standard Notes' web app, Signal's never-shipped web client. It is the reason native apps with verifiable signatures (or browser extensions with reproducible builds) exist.

What we do today: HTTPS, HSTS with `preload`, a strict CSP (`default-src 'self'`; no `'unsafe-inline'`, no `'unsafe-eval'`, no broad `https:` script source), and Vite's hashed-filename `immutable` asset pipeline so the URL of every first-party script is itself a content hash — a replacement of the bytes requires a new filename, which requires a deploy. This gives the bundled code roughly the property SRI would provide on a single load, while preserving the ability to ship fixes. SRI on the two third-party `script-src` origins (Stripe and PostHog) was evaluated and not adopted; the rationale and the conditions that would change the decision live in [`sri-policy.md`](./sri-policy.md). Stronger mitigations — signed builds, a native client — remain on the roadmap and would protect against the *first* load (TOFU) which neither hashed filenames nor SRI can.

We will state this explicitly on the public security page. Users who need protection against an actively malicious server should not use a web-based encryption tool (this one or any other).

---

## 17. References

- **libsodium documentation** — <https://doc.libsodium.org/>
- **RFC 8439** — ChaCha20 and Poly1305 for IETF Protocols. <https://datatracker.ietf.org/doc/html/rfc8439>
- **RFC 9106** — Argon2 Memory-Hard Function for Password Hashing and Proof-of-Work Applications. <https://datatracker.ietf.org/doc/html/rfc9106>
- **draft-irtf-cfrg-xchacha** — XChaCha: eXtended-nonce ChaCha and AEAD_XChaCha20_Poly1305. <https://datatracker.ietf.org/doc/draft-irtf-cfrg-xchacha/>
- **NIST SP 800-38D** — Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM). <https://csrc.nist.gov/publications/detail/sp/800-38d/final>
- **OWASP Password Storage Cheat Sheet** — <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>
- **BIP-39** — Mnemonic code for generating deterministic keys. <https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki>
- **Bitwarden Security Whitepaper** — for prior-art comparison. <https://bitwarden.com/help/bitwarden-security-white-paper/>
- **Standard Notes Specification** — for prior-art comparison. <https://docs.standardnotes.com/specification/encryption>

---

## 18. Glossary

| Term | Definition |
|---|---|
| **AEAD** | Authenticated Encryption with Associated Data. Cipher mode that provides confidentiality + integrity + binding to context (AAD). |
| **AAD** | Additional Authenticated Data. Plaintext context (e.g. user_id) bound into an AEAD ciphertext. Tampering with it causes decryption to fail. |
| **Argon2id** | Memory-hard password-hashing function. Hybrid of Argon2d and Argon2i. RFC 9106. |
| **DK** | Data Key. Random 32-byte symmetric key used to encrypt portfolio data. Generated once per user. |
| **KEK** | Key-Encryption Key. Derived from the user's password; used only to wrap/unwrap the DK. |
| **PK** | Portfolio Key. Random 32-byte key for one extra portfolio, wrapped under each member's DK (§5.2). |
| **S** | Invite secret. Random 32 bytes carried only in an invite link's fragment; wraps the PK while the invite is pending (§8.8). |
| **Key epoch** | Counter bound into every PK wrap and blob; increases with each rotation (§6.6, §8.9). |
| **KDF** | Key Derivation Function. Here, Argon2id. |
| **TOFU** | Trust On First Use. The assumption that the JS delivered on the first interaction is legitimate. |
| **XChaCha20-Poly1305** | Extended-nonce variant of ChaCha20-Poly1305 AEAD. 256-bit key, 192-bit nonce, 128-bit auth tag. |
