-- Dedupe any existing rows per user, keeping the most recently updated.
DELETE FROM public.portfolio_snapshots a
USING public.portfolio_snapshots b
WHERE a.user_id = b.user_id
  AND a.updated_at < b.updated_at;

-- Required for cloudSync.upsertSnapshot's `onConflict: 'user_id'`.
ALTER TABLE public.portfolio_snapshots
  ADD CONSTRAINT portfolio_snapshots_user_id_key UNIQUE (user_id);
