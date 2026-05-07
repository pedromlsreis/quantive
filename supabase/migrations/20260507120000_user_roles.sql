-- ===========================================================================
-- User roles and admin gating.
--
-- Adds a typed `app_role` enum and a `user_roles` table so we can grant
-- elevated permissions to specific users without storing role on the
-- profile (which is user-editable via RLS).
--
-- Standard Supabase pattern:
--   - role checks live in SECURITY DEFINER SQL functions so RLS policies
--     can call them without recursing into user_roles' own RLS;
--   - role assignments are admin-only, never self-grantable.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Enum.
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator');

COMMENT ON TYPE public.app_role IS
  'Elevated roles. Absence of a row in user_roles means the user has no elevated role (i.e. a regular user).';

-- ---------------------------------------------------------------------------
-- 2. user_roles table.
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_roles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        app_role     NOT NULL,
  granted_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

CREATE INDEX user_roles_user_id_idx ON public.user_roles (user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Role-check helpers (SECURITY DEFINER to bypass RLS on user_roles).
--
-- Calling these from an RLS policy on user_roles itself would recurse if
-- they were SECURITY INVOKER. SECURITY DEFINER + explicit search_path is
-- the recommended Supabase pattern.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role);
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS policies.
--
-- - Any authenticated user may read their own roles (so the client can
--   render admin-only UI).
-- - Admins may read all roles, and grant or revoke any role except they
--   cannot revoke the LAST admin (enforced by trigger below).
-- - Nobody can self-assign a role via the API; INSERT/UPDATE/DELETE are
--   admin-only.
-- ---------------------------------------------------------------------------
CREATE POLICY "users can read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "admins can read all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins can grant roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins can revoke roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Prevent removing the last admin. Without this, a single admin could
-- accidentally lock everyone out of the admin surface.
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.role = 'admin'::app_role
     AND (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin'::app_role) <= 1
  THEN
    RAISE EXCEPTION 'cannot remove the last admin';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER user_roles_prevent_last_admin
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- ---------------------------------------------------------------------------
-- 5. Bootstrap the initial admin.
--
-- Idempotent: if the user does not yet exist (e.g. fresh local DB), the
-- INSERT is skipped and you can re-grant manually later.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'pedromlsreis@gmail.com' LIMIT 1;
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (admin_id, 'admin'::app_role, admin_id)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
