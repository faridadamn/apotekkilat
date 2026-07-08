-- Phase P0: official role matrix roles for pharmacy_users.

ALTER TABLE public.pharmacy_users
DROP CONSTRAINT IF EXISTS pharmacy_users_role_check;

ALTER TABLE public.pharmacy_users
ADD CONSTRAINT pharmacy_users_role_check
CHECK (role = ANY (ARRAY[
  'Owner'::text,
  'Supervisor'::text,
  'Apoteker'::text,
  'Admin Stok'::text,
  'Purchasing'::text,
  'Kasir'::text,
  'Viewer'::text
]));

DROP POLICY IF EXISTS "pharmacy_users_owner_read" ON public.pharmacy_users;
DROP POLICY IF EXISTS "pharmacy_users_owner_insert" ON public.pharmacy_users;
DROP POLICY IF EXISTS "pharmacy_users_owner_update" ON public.pharmacy_users;

CREATE POLICY "pharmacy_users_owner_read"
ON public.pharmacy_users
FOR SELECT
TO authenticated
USING (public.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[]));

CREATE POLICY "pharmacy_users_owner_insert"
ON public.pharmacy_users
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[])
  AND user_id <> auth.uid()
  AND status IN ('Aktif','Nonaktif')
  AND role IN ('Owner','Supervisor','Apoteker','Admin Stok','Purchasing','Kasir','Viewer')
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
  AND role IN ('Owner','Supervisor','Apoteker','Admin Stok','Purchasing','Kasir','Viewer')
);
