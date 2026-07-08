-- Keep pharmacy_users SELECT as one auditable policy.
DROP POLICY IF EXISTS "pharmacy_users_read_own" ON public.pharmacy_users;
DROP POLICY IF EXISTS "pharmacy_users_owner_read" ON public.pharmacy_users;

CREATE POLICY "pharmacy_users_select"
ON public.pharmacy_users
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR private.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[])
);
