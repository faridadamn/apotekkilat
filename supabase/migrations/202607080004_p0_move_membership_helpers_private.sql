-- Phase P0: move membership helper functions out of the exposed public API schema.
-- Goal: RLS can still use the helpers, but clients cannot call them as public RPC endpoints.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_pharmacy_member(_pharmacy_id uuid)
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

CREATE OR REPLACE FUNCTION private.has_pharmacy_role(_pharmacy_id uuid, _roles text[])
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

REVOKE ALL ON FUNCTION private.is_pharmacy_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_pharmacy_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_pharmacy_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_pharmacy_role(uuid, text[]) TO authenticated;

DO $$
DECLARE
  r record;
  q text;
  wc text;
  create_sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual,'') ilike '%is_pharmacy_member%'
        OR coalesce(with_check,'') ilike '%is_pharmacy_member%'
        OR coalesce(qual,'') ilike '%has_pharmacy_role%'
        OR coalesce(with_check,'') ilike '%has_pharmacy_role%'
      )
  LOOP
    q := replace(replace(coalesce(r.qual,''), 'is_pharmacy_member(', 'private.is_pharmacy_member('), 'has_pharmacy_role(', 'private.has_pharmacy_role(');
    wc := replace(replace(coalesce(r.with_check,''), 'is_pharmacy_member(', 'private.is_pharmacy_member('), 'has_pharmacy_role(', 'private.has_pharmacy_role(');

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    IF r.cmd = 'SELECT' THEN
      create_sql := format('CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (%s)', r.policyname, r.schemaname, r.tablename, q);
    ELSIF r.cmd = 'INSERT' THEN
      create_sql := format('CREATE POLICY %I ON %I.%I FOR INSERT TO authenticated WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, wc);
    ELSIF r.cmd = 'UPDATE' THEN
      create_sql := format('CREATE POLICY %I ON %I.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, q, wc);
    ELSIF r.cmd = 'DELETE' THEN
      create_sql := format('CREATE POLICY %I ON %I.%I FOR DELETE TO authenticated USING (%s)', r.policyname, r.schemaname, r.tablename, q);
    ELSIF r.cmd = 'ALL' THEN
      create_sql := format('CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, q, wc);
    ELSE
      RAISE NOTICE 'Skipping unsupported policy command %.% %', r.tablename, r.policyname, r.cmd;
      CONTINUE;
    END IF;

    EXECUTE create_sql;
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname ILIKE 'Members can %'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.is_pharmacy_member(uuid);
DROP FUNCTION IF EXISTS public.has_pharmacy_role(uuid, text[]);
