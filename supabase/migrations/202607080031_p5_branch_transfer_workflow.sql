-- Phase P5.2 — Branch transfer workflow.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- State machine: Draft -> Dikirim -> Diterima/Selesai.
-- Dispatch creates TRANSFER_OUT from source branch. Receive creates TRANSFER_IN to destination branch.

BEGIN;

CREATE TABLE IF NOT EXISTS public.branch_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  code text NOT NULL,
  from_branch_id uuid NOT NULL REFERENCES public.branches(id),
  to_branch_id uuid NOT NULL REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'Draft',
  note text,
  submitted_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  dispatched_by uuid REFERENCES auth.users(id),
  received_by uuid REFERENCES auth.users(id),
  completed_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK (status IN ('Draft','Dikirim','Diterima','Selesai','Dibatalkan')),
  CHECK (from_branch_id <> to_branch_id)
);

CREATE TABLE IF NOT EXISTS public.branch_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  branch_transfer_id uuid NOT NULL REFERENCES public.branch_transfers(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.product_batches(id),
  qty numeric NOT NULL,
  received_qty numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK (qty > 0),
  CHECK (received_qty >= 0),
  CHECK (received_qty <= qty)
);

CREATE UNIQUE INDEX IF NOT EXISTS branch_transfers_pharmacy_code_unique
  ON public.branch_transfers (pharmacy_id, code);
CREATE INDEX IF NOT EXISTS branch_transfers_branch_status_idx
  ON public.branch_transfers (pharmacy_id, from_branch_id, to_branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS branch_transfer_items_transfer_idx
  ON public.branch_transfer_items (pharmacy_id, branch_transfer_id);
CREATE INDEX IF NOT EXISTS branch_transfer_items_batch_idx
  ON public.branch_transfer_items (pharmacy_id, batch_id)
  WHERE batch_id IS NOT NULL;

ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p5_branch_transfers_select ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfers_insert_deny ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfers_update_deny ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfers_delete_deny ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfer_items_select ON public.branch_transfer_items;
DROP POLICY IF EXISTS p5_branch_transfer_items_insert_deny ON public.branch_transfer_items;
DROP POLICY IF EXISTS p5_branch_transfer_items_update_deny ON public.branch_transfer_items;
DROP POLICY IF EXISTS p5_branch_transfer_items_delete_deny ON public.branch_transfer_items;

CREATE POLICY p5_branch_transfers_select ON public.branch_transfers
FOR SELECT USING (private.is_pharmacy_member(pharmacy_id));
CREATE POLICY p5_branch_transfers_insert_deny ON public.branch_transfers
FOR INSERT WITH CHECK (false);
CREATE POLICY p5_branch_transfers_update_deny ON public.branch_transfers
FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_branch_transfers_delete_deny ON public.branch_transfers
FOR DELETE USING (false);

CREATE POLICY p5_branch_transfer_items_select ON public.branch_transfer_items
FOR SELECT USING (private.is_pharmacy_member(pharmacy_id));
CREATE POLICY p5_branch_transfer_items_insert_deny ON public.branch_transfer_items
FOR INSERT WITH CHECK (false);
CREATE POLICY p5_branch_transfer_items_update_deny ON public.branch_transfer_items
FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_branch_transfer_items_delete_deny ON public.branch_transfer_items
FOR DELETE USING (false);

CREATE OR REPLACE FUNCTION public.create_branch_transfer(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transfer_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_pharmacy_id uuid := NULLIF(p_payload->>'pharmacy_id','')::uuid;
  v_from_branch_id uuid := NULLIF(p_payload->>'from_branch_id','')::uuid;
  v_to_branch_id uuid := NULLIF(p_payload->>'to_branch_id','')::uuid;
  v_code text := COALESCE(NULLIF(p_payload->>'code',''), 'BT-' || to_char(now(),'YYMMDDHH24MISS'));
  v_item jsonb;
  v_product_id uuid;
  v_batch_id uuid;
  v_qty numeric;
  v_item_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF v_from_branch_id IS NULL OR v_to_branch_id IS NULL THEN RAISE EXCEPTION 'from_branch_id and to_branch_id are required'; END IF;
  IF v_from_branch_id = v_to_branch_id THEN RAISE EXCEPTION 'Transfer branches must be different'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;

  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to create branch transfer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = v_from_branch_id AND pharmacy_id = v_pharmacy_id) THEN RAISE EXCEPTION 'Source branch not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = v_to_branch_id AND pharmacy_id = v_pharmacy_id) THEN RAISE EXCEPTION 'Destination branch not found'; END IF;

  INSERT INTO public.branch_transfers (id, pharmacy_id, code, from_branch_id, to_branch_id, status, note, created_by, updated_by)
  VALUES (v_transfer_id, v_pharmacy_id, v_code, v_from_branch_id, v_to_branch_id, 'Draft', NULLIF(p_payload->>'note',''), v_user_id, v_user_id)
  ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    from_branch_id = EXCLUDED.from_branch_id,
    to_branch_id = EXCLUDED.to_branch_id,
    note = EXCLUDED.note,
    updated_at = now(),
    updated_by = v_user_id,
    version = public.branch_transfers.version + 1
  WHERE public.branch_transfers.status = 'Draft';

  DELETE FROM public.branch_transfer_items
  WHERE pharmacy_id = v_pharmacy_id AND branch_transfer_id = v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_batch_id := NULLIF(v_item->>'batch_id','')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required'; END IF;
    IF v_batch_id IS NULL THEN RAISE EXCEPTION 'batch_id is required for branch transfer'; END IF;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'transfer qty must be greater than zero'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_product_id AND pharmacy_id = v_pharmacy_id) THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.product_batches WHERE id = v_batch_id AND pharmacy_id = v_pharmacy_id AND product_id = v_product_id) THEN RAISE EXCEPTION 'Batch not found for product'; END IF;

    INSERT INTO public.branch_transfer_items (pharmacy_id, branch_transfer_id, product_id, batch_id, qty, created_by, updated_by)
    VALUES (v_pharmacy_id, v_transfer_id, v_product_id, v_batch_id, v_qty, v_user_id, v_user_id);
    v_item_count := v_item_count + 1;
  END LOOP;

  PERFORM private.write_audit_log(v_pharmacy_id, v_from_branch_id, 'branch_transfer', 'create', 'branch_transfers', v_transfer_id, NULL, jsonb_build_object('status','Draft','items',v_item_count,'from_branch_id',v_from_branch_id,'to_branch_id',v_to_branch_id), v_transfer_id, 'web');

  RETURN jsonb_build_object('branch_transfer_id', v_transfer_id, 'code', v_code, 'status', 'Draft', 'items', v_item_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_branch_transfer(p_branch_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transfer record;
  v_item record;
  v_available numeric;
  v_product_stock numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_transfer FROM public.branch_transfers WHERE id = p_branch_transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN RAISE EXCEPTION 'Branch transfer not found'; END IF;
  IF NOT private.has_pharmacy_role(v_transfer.pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN RAISE EXCEPTION 'Not allowed to dispatch branch transfer'; END IF;
  IF v_transfer.status <> 'Draft' THEN RAISE EXCEPTION 'Only Draft transfer can be dispatched. Current status: %', v_transfer.status; END IF;

  FOR v_item IN SELECT * FROM public.branch_transfer_items WHERE branch_transfer_id = p_branch_transfer_id AND pharmacy_id = v_transfer.pharmacy_id FOR UPDATE LOOP
    SELECT COALESCE(sellable_qty,0) INTO v_available
    FROM public.branch_inventory
    WHERE pharmacy_id = v_transfer.pharmacy_id
      AND branch_id = v_transfer.from_branch_id
      AND product_id = v_item.product_id
      AND batch_id IS NOT DISTINCT FROM v_item.batch_id
    FOR UPDATE;
    IF COALESCE(v_available,0) < v_item.qty THEN
      RAISE EXCEPTION 'Insufficient source branch stock for product % batch %', v_item.product_id, v_item.batch_id;
    END IF;

    SELECT COALESCE(stock,0) INTO v_product_stock FROM public.products WHERE id = v_item.product_id AND pharmacy_id = v_transfer.pharmacy_id FOR UPDATE;

    INSERT INTO public.stock_movements (pharmacy_id, branch_id, product_id, batch_id, movement_type, qty_in, qty_out, balance_after, reference_type, reference_id, note, created_by)
    VALUES (v_transfer.pharmacy_id, v_transfer.from_branch_id, v_item.product_id, v_item.batch_id, 'TRANSFER_OUT', 0, v_item.qty, v_product_stock, 'branch_transfer', p_branch_transfer_id, 'Branch transfer dispatch ' || v_transfer.code, v_user_id);
  END LOOP;

  UPDATE public.branch_transfers
  SET status = 'Dikirim', dispatched_at = now(), dispatched_by = v_user_id, updated_at = now(), updated_by = v_user_id, version = version + 1
  WHERE id = p_branch_transfer_id;

  PERFORM private.write_audit_log(v_transfer.pharmacy_id, v_transfer.from_branch_id, 'branch_transfer', 'dispatch', 'branch_transfers', p_branch_transfer_id, jsonb_build_object('status',v_transfer.status), jsonb_build_object('status','Dikirim'), p_branch_transfer_id, 'web');

  RETURN jsonb_build_object('branch_transfer_id', p_branch_transfer_id, 'status', 'Dikirim');
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_branch_transfer(p_branch_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transfer record;
  v_item record;
  v_product_stock numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_transfer FROM public.branch_transfers WHERE id = p_branch_transfer_id FOR UPDATE;
  IF v_transfer.id IS NULL THEN RAISE EXCEPTION 'Branch transfer not found'; END IF;
  IF NOT private.has_pharmacy_role(v_transfer.pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN RAISE EXCEPTION 'Not allowed to receive branch transfer'; END IF;
  IF v_transfer.status = 'Selesai' THEN RETURN jsonb_build_object('branch_transfer_id', p_branch_transfer_id, 'status', 'Selesai', 'idempotent_replay', true); END IF;
  IF v_transfer.status <> 'Dikirim' THEN RAISE EXCEPTION 'Only Dikirim transfer can be received. Current status: %', v_transfer.status; END IF;

  FOR v_item IN SELECT * FROM public.branch_transfer_items WHERE branch_transfer_id = p_branch_transfer_id AND pharmacy_id = v_transfer.pharmacy_id FOR UPDATE LOOP
    SELECT COALESCE(stock,0) INTO v_product_stock FROM public.products WHERE id = v_item.product_id AND pharmacy_id = v_transfer.pharmacy_id FOR UPDATE;

    INSERT INTO public.stock_movements (pharmacy_id, branch_id, product_id, batch_id, movement_type, qty_in, qty_out, balance_after, reference_type, reference_id, note, created_by)
    VALUES (v_transfer.pharmacy_id, v_transfer.to_branch_id, v_item.product_id, v_item.batch_id, 'TRANSFER_IN', v_item.qty, 0, v_product_stock, 'branch_transfer', p_branch_transfer_id, 'Branch transfer receive ' || v_transfer.code, v_user_id);

    UPDATE public.branch_transfer_items
    SET received_qty = qty, updated_at = now(), updated_by = v_user_id, version = version + 1
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.branch_transfers
  SET status = 'Selesai', received_at = now(), completed_at = now(), received_by = v_user_id, completed_by = v_user_id, updated_at = now(), updated_by = v_user_id, version = version + 1
  WHERE id = p_branch_transfer_id;

  PERFORM private.write_audit_log(v_transfer.pharmacy_id, v_transfer.to_branch_id, 'branch_transfer', 'receive', 'branch_transfers', p_branch_transfer_id, jsonb_build_object('status',v_transfer.status), jsonb_build_object('status','Selesai'), p_branch_transfer_id, 'web');

  RETURN jsonb_build_object('branch_transfer_id', p_branch_transfer_id, 'status', 'Selesai', 'idempotent_replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_branch_transfer(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dispatch_branch_transfer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_branch_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_branch_transfer(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_branch_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_branch_transfer(uuid) TO authenticated;

COMMIT;
