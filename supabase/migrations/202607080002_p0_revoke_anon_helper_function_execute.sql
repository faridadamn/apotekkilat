-- Remove default PUBLIC execute grants from helper functions; keep authenticated access for RLS evaluation.
REVOKE ALL ON FUNCTION public.is_pharmacy_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_pharmacy_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_pharmacy_role(uuid, text[]) TO authenticated;
