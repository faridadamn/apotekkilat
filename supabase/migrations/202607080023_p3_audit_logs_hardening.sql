-- Phase P3.1 — Harden audit_logs as the canonical audit trail.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  branch_id uuid REFERENCES public.branches(id),
  actor_user_id uuid REFERENCES auth.users(id),
  actor_name_snapshot text,
  module text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  source text NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_owner_supervisor ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_deny ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_update_deny ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_delete_deny ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_denied ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_update_denied ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_delete_denied ON public.audit_logs;
DROP POLICY IF EXISTS p3_audit_logs_select ON public.audit_logs;
DROP POLICY IF EXISTS p3_audit_logs_insert_deny ON public.audit_logs;
DROP POLICY IF EXISTS p3_audit_logs_update_deny ON public.audit_logs;
DROP POLICY IF EXISTS p3_audit_logs_delete_deny ON public.audit_logs;

CREATE POLICY p3_audit_logs_select ON public.audit_logs
FOR SELECT
USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));

CREATE POLICY p3_audit_logs_insert_deny ON public.audit_logs
FOR INSERT
WITH CHECK (false);

CREATE POLICY p3_audit_logs_update_deny ON public.audit_logs
FOR UPDATE
USING (false)
WITH CHECK (false);

CREATE POLICY p3_audit_logs_delete_deny ON public.audit_logs
FOR DELETE
USING (false);

CREATE INDEX IF NOT EXISTS audit_logs_pharmacy_created_idx ON public.audit_logs (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON public.audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_request_idx ON public.audit_logs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_module_action_idx ON public.audit_logs (pharmacy_id, module, action, created_at DESC);

CREATE OR REPLACE FUNCTION private.write_audit_log(
  p_pharmacy_id uuid,
  p_branch_id uuid,
  p_module text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before_data jsonb DEFAULT NULL::jsonb,
  p_after_data jsonb DEFAULT NULL::jsonb,
  p_request_id uuid DEFAULT NULL::uuid,
  p_source text DEFAULT 'web'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_audit_id uuid;
  v_actor_user_id uuid := auth.uid();
  v_actor_name text;
BEGIN
  IF p_pharmacy_id IS NULL THEN RAISE EXCEPTION 'audit pharmacy_id is required'; END IF;
  IF NULLIF(trim(COALESCE(p_module,'')), '') IS NULL THEN RAISE EXCEPTION 'audit module is required'; END IF;
  IF NULLIF(trim(COALESCE(p_action,'')), '') IS NULL THEN RAISE EXCEPTION 'audit action is required'; END IF;
  IF NULLIF(trim(COALESCE(p_entity_type,'')), '') IS NULL THEN RAISE EXCEPTION 'audit entity_type is required'; END IF;

  SELECT pu.full_name INTO v_actor_name
  FROM public.pharmacy_users pu
  WHERE pu.pharmacy_id = p_pharmacy_id
    AND pu.user_id = v_actor_user_id
  ORDER BY CASE WHEN pu.status='Aktif' THEN 0 ELSE 1 END, pu.updated_at DESC
  LIMIT 1;

  v_actor_name := COALESCE(v_actor_name, v_actor_user_id::text, 'system');

  INSERT INTO public.audit_logs (
    pharmacy_id, branch_id, actor_user_id, actor_name_snapshot,
    module, action, entity_type, entity_id,
    before_data, after_data, request_id, source
  ) VALUES (
    p_pharmacy_id, p_branch_id, v_actor_user_id, v_actor_name,
    p_module, p_action, p_entity_type, p_entity_id,
    p_before_data, p_after_data, p_request_id, COALESCE(NULLIF(p_source,''), 'web')
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION private.write_audit_log(uuid, uuid, text, text, text, uuid, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;

COMMIT;
