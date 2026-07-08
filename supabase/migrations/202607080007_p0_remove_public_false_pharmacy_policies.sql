-- Remove redundant public false policies. No INSERT/DELETE policy means denied by RLS.
DROP POLICY IF EXISTS "phm_insert" ON public.pharmacies;
DROP POLICY IF EXISTS "phm_delete" ON public.pharmacies;
