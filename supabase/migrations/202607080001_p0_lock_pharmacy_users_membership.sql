-- Phase P0: lock pharmacy membership mutations and make Owner the only client-side membership manager.

CREATE OR REPLACE FUNCTION public.is_pharmacy_member(_pharmacy_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pharmacy_users
    WHERE user_id = auth.uid()
      AND pharmacy_id = _pharmacy_id
      AND status = 'Aktif'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_pharmacy_role(_pharmacy_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pharmacy_users
    WHERE user_id = auth.uid()
      AND pharmacy_id = _pharmacy_id
      AND status = 'Aktif'
      AND role = ANY(_roles)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_pharmacy_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_pharmacy_role(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pharmacy_role(uuid, text[]) TO authenticated;

DROP POLICY IF EXISTS "Users can read own pharmacy membership" ON public.pharmacy_users;
DROP POLICY IF EXISTS "phm_select" ON public.pharmacy_users;
DROP POLICY IF EXISTS "phm_insert" ON public.pharmacy_users;
DROP POLICY IF EXISTS "phm_update" ON public.pharmacy_users;
DROP POLICY IF EXISTS "phm_delete" ON public.pharmacy_users;
DROP POLICY IF EXISTS "pharmacy_users_read_own" ON public.pharmacy_users;
DROP POLICY IF EXISTS "pharmacy_users_owner_read" ON public.pharmacy_users;
DROP POLICY IF EXISTS "pharmacy_users_owner_insert" ON public.pharmacy_users;
DROP POLICY IF EXISTS "pharmacy_users_owner_update" ON public.pharmacy_users;

CREATE POLICY "pharmacy_users_read_own"
ON public.pharmacy_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "pharmacy_users_owner_read"
ON public.pharmacy_users
FOR SELECT
TO authenticated
USING (public.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Admin']::text[]));

CREATE POLICY "pharmacy_users_owner_insert"
ON public.pharmacy_users
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[])
  AND user_id <> auth.uid()
  AND status IN ('Aktif','Nonaktif')
  AND role IN ('Owner','Apoteker','Admin','Kasir')
);

CREATE POLICY "pharmacy_users_owner_update"
ON public.pharmacy_users
FOR UPDATE
TO authenticated
USING (
  public.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[])
  AND user_id <> auth.uid()
)
WITH CHECK (
  public.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[])
  AND user_id <> auth.uid()
  AND status IN ('Aktif','Nonaktif')
  AND role IN ('Owner','Apoteker','Admin','Kasir')
);

-- No DELETE policy by design. Hapus user diganti status Nonaktif.
