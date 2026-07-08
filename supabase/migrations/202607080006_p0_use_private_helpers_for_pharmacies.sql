-- Align pharmacies policies with private membership helper.
DROP POLICY IF EXISTS "phm_select" ON public.pharmacies;
DROP POLICY IF EXISTS "phm_update" ON public.pharmacies;

CREATE POLICY "phm_select"
ON public.pharmacies
FOR SELECT
TO authenticated
USING (private.is_pharmacy_member(id));

CREATE POLICY "phm_update"
ON public.pharmacies
FOR UPDATE
TO authenticated
USING (private.has_pharmacy_role(id, ARRAY['Owner']::text[]))
WITH CHECK (private.has_pharmacy_role(id, ARRAY['Owner']::text[]));
