# End-to-End Encryption — Design

**Status:** Implemented (v0.1 wire format = `enc_version = 1`)
**Last updated:** 2026-05-04
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

---

## 1. TL;DR

Portfolio data (`portfolio_snapshots.data`) is encrypted in the user's browser **before** it ever reaches the server. The server stores ciphertext only; a full database leak reveals no portfolio contents. Encryption keys are derived from the user's password using Argon2id; data is encrypted with XChaCha20-Poly1305 with per-encryption random nonces. A separate, opt-in 24-word recovery code can be used to recover access if the password is forgotten.

We do **not** claim to defend against an actively malicious server, a compromised browser, or a forgotten password without a recovery code. Section 13 enumerates exactly what we don't protect against.

---

## 2. Scope

### In scope (v1)

- Confidentiality and integrity of `portfolio_snapshots.data` (the user's portfolio JSON: facts + reference sources).
- Authenticated key derivation tied to the user's account password.
- Optional, opt-in recovery via a 24-word code generated at signup.
- A clean migration path for existing users with plaintext snapshots.

### Out of scope (v1)

- Encryption of profile fields (`profiles.display_name`).
- Encryption of feedback messages.
- Encryption of email addresses or auth metadata (Supabase auth requires plaintext email for password reset / magic links).
- Multi-device "trust this device" flows (would require storing a wrapped key locally — deferred).
- Sharing encrypted data between users (relevant to [#38](https://github.com/pedromlsreis/quantive/issues/38) — multi-portfolio).
- Subresource integrity (SRI) on the two third-party `script-src` origins (`js.stripe.com`, `eu.i.posthog.com`/`eu-assets.i.posthog.com`). The decision and rationale are documented in [`sri-policy.md`](./sri-policy.md). Stripe.js is not loaded from our HTML at all (billing is a hosted-Checkout redirect, not Stripe Elements); PostHog's bundled core ships inside our hashed, immutable assets, and the dynamically-loaded extension bundles have no published per-version hashes to pin against. Reproducible build pipelines remain out of scope (see §16 for why this matters and §17 for the path forward).

---

## 3. Threat model

### 3.1 Goals

The system MUST guarantee, under the assumed adversary capabilities (§3.3):

1. **Confidentiality at rest.** Portfolio contents cannot be recovered from the database alone, regardless of who controls it.
2. **Integrity.** The server cannot tamper with stored ciphertext without detection on decryption.
3. **User-binding.** The server cannot substitute one user's ciphertext for another user's ciphertext without the substitution being detected on decryption (binding via AAD; §6).
4. **Forward independence of password change.** Changing the account password re-wraps the data key only; existing snapshot ciphertexts remain valid and require no re-encryption.

### 3.2 Non-goals

The system does NOT defend against:

1. An **actively malicious server** that ships modified JavaScript to the user's browser. The server can serve a malicious build that exfiltrates the password during entry. This is a fundamental limitation of web-based E2E (Bitwarden, Standard Notes, ProtonMail share it). Mitigations exist (SRI, signed builds, native clients) but are out of scope for v1. See §16.
2. A **compromised user device**: malware, keyloggers, malicious browser extensions, or screen-recording software.
3. **Metadata leakage**: row counts, snapshot sizes, update timestamps, the user's email address, the existence of an account. The server *does* see all of these.
4. **Forgotten password without recovery code.** If the user has not opted into a recovery code and forgets their password, the data is permanently unrecoverable. This is a feature, not a bug, of true E2E.
5. **Coercion.** A user compelled to disclose their password disclosed everything.
6. **Supply chain attacks** on transitive npm dependencies (mitigated by lockfile pinning + `npm audit`, but not eliminated).

### 3.3 Adversary capabilities (assumed)

| Adversary | Capability | What they can / can't do |
|---|---|---|
| **Passive database read** (leaked backup, malicious DBA, subpoena of stored data) | Reads any row in any table | Cannot decrypt portfolio data. Sees emails, timestamps, row sizes. |
| **Active server (transient)** | Modifies stored data without modifying served JS | Detected: AAD-bound integrity check fails on next decrypt. |
| **Active server (persistent)** | Modifies stored data AND the served JavaScript | Wins. Out of scope (§3.2.1). |
| **Network MitM** | Reads / modifies TLS-protected traffic | Stopped by HTTPS + HSTS; we do not add app-level signing on top. |
| **Other authenticated user** | Has a valid account on the same Supabase project | Stopped by Postgres RLS + AAD binding to user_id. |

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

The DK is generated **once at signup** and never rotates by default. This means a single compromised KEK at any point in the user's history exposes all snapshots. For most users this is fine; for paranoid users we may add an explicit "rotate data key" flow later (re-encrypts every snapshot with a new DK).

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

---

## 8. Authentication and key derivation flow

### 8.1 Signup (new user, opting into recovery)

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

If step 3 returns no row, treat as an error and abort the load. Pre-#33 plaintext users were all migrated during the rollout window (§11); a missing `user_keys` row today indicates a signup race condition, a partial account-creation failure, or a manual intervention — none of which the client should silently "recover" by falling back to plaintext.

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

Outcome (3) is consistent with the threat model (§3.2.4) but is operationally distinct enough to be called out separately: it can happen even to a user who *remembers* their password but resets "just in case", and our UI must surface this before the reset is confirmed. The reset page in the app shows an explicit warning when the account is in the encrypted-no-recovery state.

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
  - clearAttribution()                       // UTM key from analytics
  - QueryCacheGuard separately clears React Query cache
  - KeySessionContext separately zeros KEK/DK
```

A `beforeunload` handler on authed users wipes the same data + draft keys as defence-in-depth against tab close without explicit sign-out. JS gives no guarantee here, but it raises the bar against another user opening the browser and seeing a previous tab's cache.

The guest-load effect (which rehydrates a guest cache on page load) is gated on `authLoading` so it cannot race `getSession()` and flash a prior user's data to whoever opened the tab before auth resolves.

What survives the watcher by design: `sb-*` (Supabase auth, cleared by `supabase.auth.signOut()`), `cookie-consent` (intentional cross-session), and `pref-*` / `preferred-currency` (preferences, not data — server profile rehydrates on next login).

`/settings` and `/admin` are auth-gated via `RequireAuth`; other shell routes stay guest-accessible because they double as demo entry points and now have no cache to leak.

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
- On `beforeunload` and `visibilitychange` (after a configurable idle timeout, default 30 minutes): zero KEK and DK and force re-prompt on next action.
- KEK and DK are **never** placed in `localStorage`, `sessionStorage`, IndexedDB, or any persistent store.

A hostile script running in the same origin (XSS) bypasses all of this — see §13.

---

## 13. What we explicitly do NOT defend against

We will publish exactly this list on the public privacy / security page so users can self-select.

1. **Active malicious server.** A compromised Supabase project (or a malicious operator) can ship modified JavaScript on the next page load that exfiltrates the password as the user types. The encryption design assumes the JS the browser runs is the JS this repository describes. Our first-party assets are emitted by Vite with hashed filenames and served `immutable`, which means the bytes at any given `/assets/*.js` URL are bound to their hash; an attacker who replaces the bytes must also collide the filename. The stronger mitigations — signed builds, a native client — are not in v1. Subresource integrity on third-party `script-src` origins is documented in [`sri-policy.md`](./sri-policy.md): not applicable to Stripe (we do not load Stripe.js), and not pursued for PostHog's runtime-loaded extension bundles (vendor publishes no per-version hashes; a pinned hash would break on the next silent rotation).

2. **Compromised user device.** Malware, keyloggers, and malicious browser extensions run with the user's privileges and can read everything the user sees. No application-level mitigation.

3. **Cross-site scripting (XSS)** in our own application. A successful XSS in a logged-in tab can read the in-memory KEK and DK. Mitigations: strict CSP, input sanitization, code review, dependency auditing. We do not claim the codebase is XSS-free; we claim we follow standard practices and welcome reports.

4. **Metadata leakage.** The server sees: account existence, email, login timestamps, snapshot sizes (which leak rough portfolio complexity), update frequencies. None of this is encrypted.

5. **Supply chain attacks** on transitive npm dependencies. Lockfile pinning + `npm audit` + Dependabot mitigate but do not eliminate.

6. **Forgotten password without recovery code.** Permanent data loss. By design.

7. **Coercion.** Legal, physical, or social pressure to disclose the password.

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
- **Encrypted sharing** between users for [#38](https://github.com/pedromlsreis/quantive/issues/38) (multi-portfolio). Will require per-portfolio key wrap with member public keys (libsodium `crypto_box`).
- **PAKE-based authentication** (OPAQUE / SRP-6a) so the password is never sent to the server even for auth. Eliminates the "Supabase auth sees password" caveat. Requires replacing Supabase auth or layering custom auth.
- **Third-party security audit** by a recognized firm (Trail of Bits, NCC Group, Cure53). Targeted at the crypto module + auth flow. Funded post-revenue.
- **"Wipe and start fresh"** flow for users who forget their password AND skipped the recovery code. Currently they're stuck (can reset password via email but the at-rest wrap stays unrecoverable). Needs an edge-function path to delete `user_keys` + `portfolio_snapshots` under service role.

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
| **KDF** | Key Derivation Function. Here, Argon2id. |
| **TOFU** | Trust On First Use. The assumption that the JS delivered on the first interaction is legitimate. |
| **XChaCha20-Poly1305** | Extended-nonce variant of ChaCha20-Poly1305 AEAD. 256-bit key, 192-bit nonce, 128-bit auth tag. |
