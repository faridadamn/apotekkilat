-- Phase P2.3/P4.2/P4.5 — Return state-machine RPCs.
-- Full replayable SQL synced from live Supabase on 2026-07-08.

BEGIN;

ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id);
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id);
ALTER TABLE public.sales_return_items ADD COLUMN IF NOT EXISTS inspection_result text;
ALTER TABLE public.sales_return_items ADD COLUMN IF NOT EXISTS inspection_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_return_items_inspection_result_check'
      AND conrelid = 'public.sales_return_items'::regclass
  ) THEN
    ALTER TABLE public.sales_return_items
      ADD CONSTRAINT sales_return_items_inspection_result_check
      CHECK (inspection_result IS NULL OR inspection_result IN ('layak_jual','karantina','rusak','expired','tukar_barang'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.submit_return(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_kind text := lower(COALESCE(NULLIF(p_payload->>'return_kind',''), NULLIF(p_payload->>'kind',''), ''));
  v_pharmacy_id uuid := NULLIF(p_payload->>'pharmacy_id','')::uuid;
  v_return_id uuid := COALESCE(NULLIF(p_payload->>'return_id','')::uuid, NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_submit boolean := COALESCE((p_payload->>'submit')::boolean, true);
  v_status text := CASE WHEN COALESCE((p_payload->>'submit')::boolean, true) THEN 'Menunggu Approval' ELSE 'Draft' END;
  v_code text := COALESCE(NULLIF(p_payload->>'code',''), upper(left(v_kind,2)) || '-RET-' || to_char(now(),'YYMMDDHH24MISS'));
  v_item jsonb;
  v_value numeric := 0;
  v_existing_status text;
  v_product record;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_inspection text;
  v_role_ok boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_kind NOT IN ('sales','purchase') THEN RAISE EXCEPTION 'return_kind must be sales or purchase'; END IF;
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;

  IF v_kind = 'sales' THEN
    v_role_ok := private.has_pharmacy_role(v_pharmacy_id, ARRAY['Kasir','Supervisor','Owner']::text[]);
  ELSE
    v_role_ok := private.has_pharmacy_role(v_pharmacy_id, ARRAY['Purchasing','Supervisor','Owner']::text[]);
  END IF;
  IF NOT v_role_ok THEN RAISE EXCEPTION 'Not allowed to submit this return kind'; END IF;

  IF v_kind = 'sales' THEN
    SELECT status INTO v_existing_status FROM public.sales_returns WHERE id = v_return_id FOR UPDATE;
  ELSE
    SELECT status INTO v_existing_status FROM public.purchase_returns WHERE id = v_return_id FOR UPDATE;
  END IF;
  IF v_existing_status IS NOT NULL AND v_existing_status <> 'Draft' THEN
    RAISE EXCEPTION 'Only Draft return can be edited/submitted. Current status: %', v_existing_status;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'return item qty must be greater than zero'; END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = NULLIF(v_item->>'product_id','')::uuid
      AND pharmacy_id = v_pharmacy_id;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Return product not found or outside tenant'; END IF;

    IF v_kind = 'sales' THEN
      v_inspection := NULLIF(v_item->>'inspection_result','');
      IF v_inspection IS NULL OR v_inspection NOT IN ('layak_jual','karantina','rusak','expired','tukar_barang') THEN
        RAISE EXCEPTION 'Sales return inspection_result is required: layak_jual, karantina, rusak, expired, or tukar_barang';
      END IF;
      v_price := COALESCE((v_item->>'price')::numeric, v_product.price);
      v_value := v_value + (v_qty * v_price);
    ELSE
      v_cost := COALESCE((v_item->>'cost')::numeric, v_product.cost);
      v_value := v_value + (v_qty * v_cost);
    END IF;
  END LOOP;

  IF v_kind = 'sales' THEN
    INSERT INTO public.sales_returns (
      id, pharmacy_id, transaction_id, customer_id, code, value, status, returned_at,
      refund_method, note, submitted_at, submitted_by, created_by, updated_by
    ) VALUES (
      v_return_id, v_pharmacy_id, NULLIF(p_payload->>'transaction_id','')::uuid,
      NULLIF(p_payload->>'customer_id','')::uuid, v_code, v_value, v_status, now(),
      NULLIF(p_payload->>'refund_method',''), NULLIF(p_payload->>'note',''),
      CASE WHEN v_submit THEN now() ELSE NULL END,
      CASE WHEN v_submit THEN v_user_id ELSE NULL END,
      v_user_id, v_user_id
    )
    ON CONFLICT (id) DO UPDATE SET
      transaction_id = excluded.transaction_id,
      customer_id = excluded.customer_id,
      value = excluded.value,
      status = excluded.status,
      refund_method = excluded.refund_method,
      note = excluded.note,
      submitted_at = excluded.submitted_at,
      submitted_by = excluded.submitted_by,
      updated_at = now(),
      updated_by = v_user_id
    WHERE public.sales_returns.status = 'Draft';

    DELETE FROM public.sales_return_items WHERE sales_return_id = v_return_id AND pharmacy_id = v_pharmacy_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
      SELECT * INTO v_product FROM public.products WHERE id = NULLIF(v_item->>'product_id','')::uuid AND pharmacy_id = v_pharmacy_id;
      v_qty := COALESCE((v_item->>'qty')::numeric, 0);
      v_price := COALESCE((v_item->>'price')::numeric, v_product.price);
      INSERT INTO public.sales_return_items (
        id, pharmacy_id, sales_return_id, product_id, qty, base_qty, display_qty, unit_code, unit_label,
        price, reason, inspection_result, inspection_note, created_by, updated_by
      ) VALUES (
        COALESCE(NULLIF(v_item->>'id','')::uuid, gen_random_uuid()), v_pharmacy_id, v_return_id,
        v_product.id, v_qty, COALESCE((v_item->>'base_qty')::numeric, v_qty), COALESCE((v_item->>'display_qty')::numeric, v_qty),
        NULLIF(v_item->>'unit_code',''), NULLIF(v_item->>'unit_label',''), v_price, NULLIF(v_item->>'reason',''),
        NULLIF(v_item->>'inspection_result',''), NULLIF(v_item->>'inspection_note',''), v_user_id, v_user_id
      );
    END LOOP;
  ELSE
    INSERT INTO public.purchase_returns (
      id, pharmacy_id, purchase_order_id, supplier_id, code, value, status, returned_at,
      note, submitted_at, submitted_by, created_by, updated_by
    ) VALUES (
      v_return_id, v_pharmacy_id, NULLIF(p_payload->>'purchase_order_id','')::uuid,
      NULLIF(p_payload->>'supplier_id','')::uuid, v_code, v_value, v_status, now(),
      NULLIF(p_payload->>'note',''), CASE WHEN v_submit THEN now() ELSE NULL END,
      CASE WHEN v_submit THEN v_user_id ELSE NULL END, v_user_id, v_user_id
    )
    ON CONFLICT (id) DO UPDATE SET
      purchase_order_id = excluded.purchase_order_id,
      supplier_id = excluded.supplier_id,
      value = excluded.value,
      status = excluded.status,
      note = excluded.note,
      submitted_at = excluded.submitted_at,
      submitted_by = excluded.submitted_by,
      updated_at = now(),
      updated_by = v_user_id
    WHERE public.purchase_returns.status = 'Draft';

    DELETE FROM public.purchase_return_items WHERE purchase_return_id = v_return_id AND pharmacy_id = v_pharmacy_id;
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
      SELECT * INTO v_product FROM public.products WHERE id = NULLIF(v_item->>'product_id','')::uuid AND pharmacy_id = v_pharmacy_id;
      v_qty := COALESCE((v_item->>'qty')::numeric, 0);
      v_cost := COALESCE((v_item->>'cost')::numeric, v_product.cost);
      INSERT INTO public.purchase_return_items (
        id, pharmacy_id, purchase_return_id, product_id, qty, base_qty, display_qty, unit_code, unit_label,
        cost, reason, created_by, updated_by
      ) VALUES (
        COALESCE(NULLIF(v_item->>'id','')::uuid, gen_random_uuid()), v_pharmacy_id, v_return_id,
        v_product.id, v_qty, COALESCE((v_item->>'base_qty')::numeric, v_qty), COALESCE((v_item->>'display_qty')::numeric, v_qty),
        NULLIF(v_item->>'unit_code',''), NULLIF(v_item->>'unit_label',''), v_cost, NULLIF(v_item->>'reason',''), v_user_id, v_user_id
      );
    END LOOP;
  END IF;

  PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'return', CASE WHEN v_submit THEN 'submit_return' ELSE 'save_return_draft' END,
    CASE WHEN v_kind='sales' THEN 'sales_returns' ELSE 'purchase_returns' END, v_return_id, NULL,
    jsonb_build_object('return_kind', v_kind, 'return_id', v_return_id, 'status', v_status, 'value', v_value), v_return_id, 'web');

  RETURN jsonb_build_object('return_kind', v_kind, 'return_id', v_return_id, 'status', v_status, 'value', v_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_return(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_kind text := lower(COALESCE(NULLIF(p_payload->>'return_kind',''), NULLIF(p_payload->>'kind',''), ''));
  v_return_id uuid := COALESCE(NULLIF(p_payload->>'return_id','')::uuid, NULLIF(p_payload->>'id','')::uuid);
  v_decision text := lower(COALESCE(NULLIF(p_payload->>'decision',''), 'approve'));
  v_reason text := NULLIF(p_payload->>'rejection_reason','');
  v_pharmacy_id uuid;
  v_status text;
  v_new_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_kind NOT IN ('sales','purchase') THEN RAISE EXCEPTION 'return_kind must be sales or purchase'; END IF;
  IF v_return_id IS NULL THEN RAISE EXCEPTION 'return_id is required'; END IF;
  IF v_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'decision must be approve or reject'; END IF;

  IF v_kind = 'sales' THEN
    SELECT pharmacy_id, status INTO v_pharmacy_id, v_status FROM public.sales_returns WHERE id = v_return_id FOR UPDATE;
  ELSE
    SELECT pharmacy_id, status INTO v_pharmacy_id, v_status FROM public.purchase_returns WHERE id = v_return_id FOR UPDATE;
  END IF;
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Return not found'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Supervisor','Owner']::text[]) THEN RAISE EXCEPTION 'Only Supervisor/Owner can approve or reject returns'; END IF;

  IF v_decision = 'approve' THEN
    IF v_status <> 'Menunggu Approval' THEN RAISE EXCEPTION 'Only Menunggu Approval return can be approved. Current status: %', v_status; END IF;
    v_new_status := 'Disetujui';
    IF v_kind = 'sales' THEN
      UPDATE public.sales_returns SET status=v_new_status, approved_at=now(), approved_by=v_user_id, rejected_at=NULL, rejected_by=NULL, rejection_reason=NULL, updated_at=now(), updated_by=v_user_id WHERE id=v_return_id;
    ELSE
      UPDATE public.purchase_returns SET status=v_new_status, approved_at=now(), approved_by=v_user_id, rejected_at=NULL, rejected_by=NULL, rejection_reason=NULL, updated_at=now(), updated_by=v_user_id WHERE id=v_return_id;
    END IF;
  ELSE
    IF v_status NOT IN ('Draft','Menunggu Approval') THEN RAISE EXCEPTION 'Only Draft/Menunggu Approval return can be rejected. Current status: %', v_status; END IF;
    IF v_reason IS NULL THEN RAISE EXCEPTION 'rejection_reason is required'; END IF;
    v_new_status := 'Ditolak';
    IF v_kind = 'sales' THEN
      UPDATE public.sales_returns SET status=v_new_status, rejected_at=now(), rejected_by=v_user_id, rejection_reason=v_reason, updated_at=now(), updated_by=v_user_id WHERE id=v_return_id;
    ELSE
      UPDATE public.purchase_returns SET status=v_new_status, rejected_at=now(), rejected_by=v_user_id, rejection_reason=v_reason, updated_at=now(), updated_by=v_user_id WHERE id=v_return_id;
    END IF;
  END IF;

  PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'return', CASE WHEN v_decision='approve' THEN 'approve_return' ELSE 'reject_return' END,
    CASE WHEN v_kind='sales' THEN 'sales_returns' ELSE 'purchase_returns' END, v_return_id,
    jsonb_build_object('status', v_status), jsonb_build_object('status', v_new_status, 'decision', v_decision, 'rejection_reason', v_reason), v_return_id, 'web');

  RETURN jsonb_build_object('return_kind', v_kind, 'return_id', v_return_id, 'status', v_new_status, 'decision', v_decision);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_return(p_return_kind text, p_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_kind text := lower(p_return_kind);
  v_pharmacy_id uuid;
  v_status text;
  v_item record;
  v_movement_type text;
  v_qty_in numeric;
  v_qty_out numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_kind NOT IN ('sales','purchase') THEN RAISE EXCEPTION 'Unsupported return kind: %', p_return_kind; END IF;

  IF v_kind = 'sales' THEN
    SELECT pharmacy_id, status INTO v_pharmacy_id, v_status FROM public.sales_returns WHERE id = p_return_id FOR UPDATE;
    IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Sales return not found'; END IF;
    IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Supervisor','Owner']::text[]) THEN RAISE EXCEPTION 'Not allowed to complete sales return'; END IF;
    IF v_status = 'Selesai' THEN RETURN p_return_id; END IF;
    IF v_status <> 'Disetujui' THEN RAISE EXCEPTION 'Only Disetujui sales return can be completed. Current status: %', v_status; END IF;

    PERFORM set_config('app.apotekkilat_allow_stock_mutation', 'on', true);

    FOR v_item IN SELECT product_id, qty, inspection_result FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
      IF v_item.inspection_result IS NULL THEN RAISE EXCEPTION 'Sales return item inspection_result is required before completion'; END IF;
      v_movement_type := CASE v_item.inspection_result WHEN 'layak_jual' THEN 'SALES_RETURN_SELLABLE' WHEN 'karantina' THEN 'SALES_RETURN_QUARANTINE' WHEN 'rusak' THEN 'WRITE_OFF_DAMAGED' WHEN 'expired' THEN 'WRITE_OFF_EXPIRED' WHEN 'tukar_barang' THEN 'SALES_RETURN_QUARANTINE' ELSE 'SALES_RETURN_QUARANTINE' END;
      v_qty_in := CASE WHEN v_item.inspection_result = 'layak_jual' THEN COALESCE(v_item.qty,0) ELSE 0 END;
      v_qty_out := 0;
      INSERT INTO public.stock_movements (pharmacy_id, product_id, movement_type, qty_in, qty_out, reference_type, reference_id, note, created_by)
      VALUES (v_pharmacy_id, v_item.product_id, v_movement_type, v_qty_in, v_qty_out, 'sales_return', p_return_id, 'Sales return inspection result: ' || v_item.inspection_result, v_user_id);
      IF v_item.inspection_result = 'layak_jual' THEN
        UPDATE public.products SET stock = stock + COALESCE(v_item.qty,0), updated_at = now(), updated_by = v_user_id WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
      END IF;
    END LOOP;
    UPDATE public.sales_returns SET status='Selesai', completed_at=now(), completed_by=v_user_id, updated_at=now(), updated_by=v_user_id WHERE id=p_return_id;
    PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'return', 'complete', 'sales_returns', p_return_id, jsonb_build_object('status', v_status), jsonb_build_object('status','Selesai','completed_by',v_user_id), p_return_id, 'web');
  ELSE
    SELECT pharmacy_id, status INTO v_pharmacy_id, v_status FROM public.purchase_returns WHERE id = p_return_id FOR UPDATE;
    IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Purchase return not found'; END IF;
    IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Purchasing','Supervisor','Owner']::text[]) THEN RAISE EXCEPTION 'Not allowed to complete purchase return'; END IF;
    IF v_status = 'Selesai' THEN RETURN p_return_id; END IF;
    IF v_status <> 'Disetujui' THEN RAISE EXCEPTION 'Only Disetujui purchase return can be completed. Current status: %', v_status; END IF;

    PERFORM set_config('app.apotekkilat_allow_stock_mutation', 'on', true);

    FOR v_item IN SELECT product_id, qty FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
      INSERT INTO public.stock_movements (pharmacy_id, product_id, movement_type, qty_in, qty_out, reference_type, reference_id, note, created_by)
      VALUES (v_pharmacy_id, v_item.product_id, 'PURCHASE_RETURN', 0, COALESCE(v_item.qty,0), 'purchase_return', p_return_id, 'Purchase return completion', v_user_id);
      UPDATE public.products SET stock = GREATEST(stock - COALESCE(v_item.qty,0), 0), updated_at = now(), updated_by = v_user_id WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
    END LOOP;
    UPDATE public.purchase_returns SET status='Selesai', completed_at=now(), completed_by=v_user_id, updated_at=now(), updated_by=v_user_id WHERE id=p_return_id;
    PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'return', 'complete', 'purchase_returns', p_return_id, jsonb_build_object('status', v_status), jsonb_build_object('status','Selesai','completed_by',v_user_id), p_return_id, 'web');
  END IF;
  RETURN p_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_return(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_return(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_return(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_return(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_return(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_return(text, uuid) TO authenticated;

COMMIT;
