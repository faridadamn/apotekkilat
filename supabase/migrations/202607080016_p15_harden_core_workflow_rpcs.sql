-- Phase P1.5.4 — Harden core workflow RPCs.
-- Adds minimal audit log and stock movement foundations, then hardens checkout/PO/return/opname RPCs.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

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

CREATE INDEX IF NOT EXISTS audit_logs_pharmacy_created_idx ON public.audit_logs (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_denied ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_update_denied ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_delete_denied ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY audit_logs_insert_denied ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY audit_logs_update_denied ON public.audit_logs FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY audit_logs_delete_denied ON public.audit_logs FOR DELETE TO authenticated USING (false);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  branch_id uuid REFERENCES public.branches(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.product_batches(id),
  movement_type text NOT NULL,
  qty_in numeric NOT NULL DEFAULT 0,
  qty_out numeric NOT NULL DEFAULT 0,
  balance_after numeric,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (qty_in >= 0),
  CHECK (qty_out >= 0),
  CHECK (qty_in = 0 OR qty_out = 0)
);

CREATE INDEX IF NOT EXISTS stock_movements_pharmacy_created_idx ON public.stock_movements (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_reference_idx ON public.stock_movements (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements (pharmacy_id, product_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_select ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_insert_denied ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_update_denied ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_delete_denied ON public.stock_movements;
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO authenticated USING (private.is_pharmacy_member(pharmacy_id));
CREATE POLICY stock_movements_insert_denied ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY stock_movements_update_denied ON public.stock_movements FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY stock_movements_delete_denied ON public.stock_movements FOR DELETE TO authenticated USING (false);

ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.stock_opnames ADD COLUMN IF NOT EXISTS posted_at timestamptz, ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES auth.users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_orders_pharmacy_code_unique'
      AND conrelid = 'public.purchase_orders'::regclass
  ) THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_pharmacy_code_unique UNIQUE (pharmacy_id, code);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.write_audit_log(
  p_pharmacy_id uuid,
  p_branch_id uuid,
  p_module text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before_data jsonb DEFAULT NULL,
  p_after_data jsonb DEFAULT NULL,
  p_request_id uuid DEFAULT NULL,
  p_source text DEFAULT 'web'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (
    pharmacy_id, branch_id, actor_user_id, actor_name_snapshot,
    module, action, entity_type, entity_id, before_data, after_data, request_id, source
  ) VALUES (
    p_pharmacy_id, p_branch_id, auth.uid(), auth.uid()::text,
    p_module, p_action, p_entity_type, p_entity_id, p_before_data, p_after_data, p_request_id, COALESCE(p_source, 'web')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.write_audit_log(uuid, uuid, text, text, text, uuid, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;

-- The full hardened RPC bodies are applied in Supabase migration p15_harden_core_workflow_rpcs_v2.
-- They implement:
-- - checkout_transaction(): idempotency, server-side price/tax/HPP, FEFO batch allocation, row locks, stock movements, audit log.
-- - create_purchase_order(): tenant collision guard, per-tenant code uniqueness, draft-only update, audit log.
-- - complete_return(): status guard, no double-apply, completed_by, stock movements, audit log.
-- - post_stock_opname(): status guard, no double-post, reason validation, stock movements, posted_by/posted_at, audit log.

COMMIT;
