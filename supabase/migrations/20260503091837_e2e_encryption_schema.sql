-- ===========================================================================
-- Phase 2 of #33 (E2E encryption): schema only.
--
-- Spec: docs/security/encryption.md §7
--
-- This migration adds the storage shape required for client-side encryption.
-- It does NOT touch existing data: every row in portfolio_snapshots stays
-- as enc_version=0 (legacy plaintext) until the client lazily re-encrypts
-- on next login (Phase 5).
--
-- Sizes for byte-length CHECK constraints:
--   - kdf_salt              16  (Argon2id salt)
--   - wrapped_dk_kek        72  (24 nonce + 32 DK plaintext + 16 Poly1305 tag)
--   - wrapped_dk_recovery   72  (same shape)
--   - recovery_kdf_salt     16  (Argon2id salt for recovery code)
--   - portfolio_snapshots.nonce  24  (XChaCha20 nonce)
--
-- These lengths are also asserted in code (src/lib/crypto/), but enforcing
-- at the DB makes accidental bad writes impossible.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. user_keys: per-user wrapped Data Key + KDF salt(s).
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_keys (
  user_id              UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Argon2id salt for password -> KEK derivation.
  kdf_salt             BYTEA        NOT NULL,

  -- DK wrapped under password-derived KEK. Wire format: nonce(24) || ciphertext_with_tag.
  wrapped_dk_kek       BYTEA        NOT NULL,

  -- DK wrapped under recovery-code-derived KEK. NULL if user did not opt
  -- into recovery. Same wire format as wrapped_dk_kek.
  wrapped_dk_recovery  BYTEA,

  -- Argon2id salt for recovery_code -> recovery_KEK derivation.
  -- NULL iff wrapped_dk_recovery is NULL (enforced by paired CHECK below).
  recovery_kdf_salt    BYTEA,

  -- KDF + AEAD parameter version. enc_version=1 means
  --   Argon2id(t=3, m=64MiB) + XChaCha20-Poly1305.
  -- Bump if production parameters change; never reuse a value.
  enc_version          INT          NOT NULL DEFAULT 1,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Length invariants (defense in depth; client also enforces).
  CONSTRAINT user_keys_kdf_salt_len_chk
    CHECK (octet_length(kdf_salt) = 16),
  CONSTRAINT user_keys_wrapped_dk_kek_len_chk
    CHECK (octet_length(wrapped_dk_kek) = 72),
  CONSTRAINT user_keys_wrapped_dk_recovery_len_chk
    CHECK (wrapped_dk_recovery IS NULL OR octet_length(wrapped_dk_recovery) = 72),
  CONSTRAINT user_keys_recovery_kdf_salt_len_chk
    CHECK (recovery_kdf_salt IS NULL OR octet_length(recovery_kdf_salt) = 16),

  -- Recovery pair invariant: both columns NULL or both NOT NULL.
  CONSTRAINT user_keys_recovery_pair_chk CHECK (
    (wrapped_dk_recovery IS NULL     AND recovery_kdf_salt IS NULL)
    OR
    (wrapped_dk_recovery IS NOT NULL AND recovery_kdf_salt IS NOT NULL)
  ),

  -- enc_version is whitelisted. Bumping requires a deliberate ALTER.
  CONSTRAINT user_keys_enc_version_chk CHECK (enc_version = 1)
);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

-- Self-only access. DELETE is intentionally NOT exposed via RLS — purging
-- a user's keys would orphan their snapshot ciphertexts. Account deletion
-- goes through delete-account (service role) and cascades via the FK.
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

-- Reuse the project's standard updated_at trigger function from the
-- initial migration (20260302091120). It sets NEW.updated_at = now().
CREATE TRIGGER update_user_keys_updated_at
  BEFORE UPDATE ON public.user_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. portfolio_snapshots: add encrypted columns + version + invariant.
-- ---------------------------------------------------------------------------

-- The data column was created NOT NULL in 20260302091120. We have to drop
-- that constraint so v1 (encrypted) rows can store data IS NULL.
ALTER TABLE public.portfolio_snapshots
  ALTER COLUMN data DROP NOT NULL;

ALTER TABLE public.portfolio_snapshots
  ADD COLUMN encrypted_data BYTEA,
  ADD COLUMN nonce          BYTEA,
  ADD COLUMN enc_version    INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.portfolio_snapshots.encrypted_data IS
  'AEAD ciphertext (XChaCha20-Poly1305) of the portfolio JSON. Populated only when enc_version >= 1.';
COMMENT ON COLUMN public.portfolio_snapshots.nonce IS
  '24-byte XChaCha20 nonce used to encrypt encrypted_data. Populated only when enc_version >= 1.';
COMMENT ON COLUMN public.portfolio_snapshots.enc_version IS
  '0 = legacy plaintext (read from data); 1 = v1 encrypted (read from encrypted_data + nonce). See docs/security/encryption.md.';

-- Storage invariant. enc_version is the discriminator:
--   - 0 (legacy):  data populated; encrypted_data, nonce NULL.
--   - 1 (v1):      encrypted_data + nonce populated; data NULL.
-- Any other value is rejected. When enc_version=2 is introduced, drop and
-- recreate this constraint with the new branch — a deliberate, reviewable
-- step.
ALTER TABLE public.portfolio_snapshots
  ADD CONSTRAINT portfolio_snapshots_enc_invariant CHECK (
    (enc_version = 0
      AND data IS NOT NULL
      AND encrypted_data IS NULL
      AND nonce IS NULL)
    OR
    (enc_version = 1
      AND data IS NULL
      AND encrypted_data IS NOT NULL
      AND nonce IS NOT NULL
      AND octet_length(nonce) = 24)
  );

-- ---------------------------------------------------------------------------
-- 3. Local-test seed (commented out by default; uncomment for verifying RLS
-- against a local supabase stack with `supabase db reset`).
-- ---------------------------------------------------------------------------

-- INSERT INTO public.user_keys (user_id, kdf_salt, wrapped_dk_kek)
-- VALUES (
--   '00000000-0000-0000-0000-000000000001',
--   decode('00112233445566778899aabbccddeeff', 'hex'),
--   decode(repeat('00', 72), 'hex')
-- );
