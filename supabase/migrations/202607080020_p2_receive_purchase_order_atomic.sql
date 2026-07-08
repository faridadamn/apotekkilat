-- Phase P2.2/P4.5 — Atomic receive_purchase_order RPC.
-- Full live SQL body synced from Supabase gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_po_id uuid := NULLIF(p_payload->>'purchase_order_id','')::uuid;
  v_branch_id uuid := NULLIF(p_payload->>'branch_id','')::uuid;
  v_receipt_id uuid := COALESCE(NULLIF(p_payload->>'idempotency_key','')::uuid, gen_random_uuid());
  v_po record;
  v_membership record;
  v_pharmacy_id uuid;
  v_item jsonb;
  v_po_item record;
  v_product record;
  v_batch_id uuid;
  v_qty_received numeric;
  v_actual_cost numeric;
  v_batch_no text;
  v_expired_at date;
  v_location text;
  v_line_value numeric;
  v_received_value numeric := 0;
  v_received_items jsonb := '[]'::jsonb;
  v_total_order_qty numeric;
  v_total_received_qty numeric;
  v_new_status text;
  v_ap_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_po_id IS NULL THEN RAISE EXCEPTION 'purchase_order_id is required'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_id FOR UPDATE;
  IF v_po.id IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  v_pharmacy_id := v_po.pharmacy_id;

  SELECT pu.* INTO v_membership
  FROM public.pharmacy_users pu
  WHERE pu.user_id = v_user_id
    AND pu.pharmacy_id = v_pharmacy_id
    AND pu.status = 'Aktif'
    AND pu.role IN ('Purchasing','Admin Stok','Supervisor','Owner')
    AND (pu.branch_id IS NULL OR v_branch_id IS NULL OR pu.branch_id = v_branch_id)
  ORDER BY CASE WHEN pu.branch_id = v_branch_id THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_membership.id IS NULL THEN RAISE EXCEPTION 'User is not allowed to receive this purchase order'; END IF;

  IF v_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = v_branch_id AND b.pharmacy_id = v_pharmacy_id) THEN
    RAISE EXCEPTION 'Branch not found or outside tenant';
  END IF;

  IF v_po.status NOT IN ('Dalam Pengiriman','Disetujui','Approved','Partially Received','Parsial') THEN
    RAISE EXCEPTION 'Purchase order is not approved/receivable. Current status: %', v_po.status;
  END IF;

  PERFORM set_config('app.apotekkilat_allow_stock_mutation', 'on', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    SELECT * INTO v_po_item
    FROM public.purchase_order_items poi
    WHERE poi.id = NULLIF(v_item->>'purchase_order_item_id','')::uuid
      AND poi.purchase_order_id = v_po_id
      AND poi.pharmacy_id = v_pharmacy_id
    FOR UPDATE;

    IF v_po_item.id IS NULL AND NULLIF(v_item->>'product_id','') IS NOT NULL THEN
      SELECT * INTO v_po_item
      FROM public.purchase_order_items poi
      WHERE poi.purchase_order_id = v_po_id
        AND poi.pharmacy_id = v_pharmacy_id
        AND poi.product_id = NULLIF(v_item->>'product_id','')::uuid
      ORDER BY poi.created_at
      LIMIT 1
      FOR UPDATE;
    END IF;
    IF v_po_item.id IS NULL THEN RAISE EXCEPTION 'Purchase order item not found'; END IF;

    v_qty_received := COALESCE((v_item->>'qty_received')::numeric, (v_item->>'qty')::numeric, 0);
    v_actual_cost := COALESCE((v_item->>'actual_cost')::numeric, (v_item->>'cost')::numeric, v_po_item.cost, 0);
    v_batch_no := COALESCE(NULLIF(v_item->>'batch_no',''), 'PO-' || v_po.code || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6));
    v_expired_at := NULLIF(v_item->>'expired_at','')::date;
    v_location := COALESCE(NULLIF(v_item->>'location',''), 'Gudang Pusat');
    IF v_qty_received <= 0 THEN RAISE EXCEPTION 'qty_received must be greater than zero'; END IF;
    IF v_actual_cost < 0 THEN RAISE EXCEPTION 'actual_cost cannot be negative'; END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_po_item.product_id AND pharmacy_id = v_pharmacy_id FOR UPDATE;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Product not found for PO item'; END IF;

    v_batch_id := gen_random_uuid();
    INSERT INTO public.product_batches (id, pharmacy_id, product_id, batch_no, received_at, expired_at, qty, location, status, created_by, updated_by)
    VALUES (v_batch_id, v_pharmacy_id, v_product.id, v_batch_no, current_date, COALESCE(v_expired_at, v_po_item.expired_at), v_qty_received, v_location, 'SELLABLE', v_user_id, v_user_id);

    INSERT INTO public.stock_movements (pharmacy_id, branch_id, product_id, batch_id, movement_type, qty_in, qty_out, balance_after, reference_type, reference_id, note, created_by)
    VALUES (v_pharmacy_id, v_branch_id, v_product.id, v_batch_id, 'PURCHASE_RECEIPT', v_qty_received, 0, v_product.stock + v_qty_received, 'purchase_order', v_po_id, 'Receive purchase order ' || v_po.code, v_user_id);

    UPDATE public.products
    SET stock = stock + v_qty_received,
        cost = CASE WHEN v_actual_cost > 0 THEN v_actual_cost ELSE cost END,
        updated_at = now(),
        updated_by = v_user_id
    WHERE id = v_product.id AND pharmacy_id = v_pharmacy_id;

    v_line_value := v_qty_received * v_actual_cost;
    v_received_value := v_received_value + v_line_value;
    v_received_items := v_received_items || jsonb_build_array(jsonb_build_object('purchase_order_item_id', v_po_item.id, 'product_id', v_product.id, 'product_name', v_product.name, 'batch_id', v_batch_id, 'batch_no', v_batch_no, 'qty_received', v_qty_received, 'actual_cost', v_actual_cost, 'line_value', v_line_value, 'expired_at', COALESCE(v_expired_at, v_po_item.expired_at), 'location', v_location, 'status', 'SELLABLE'));
  END LOOP;

  IF v_received_value <= 0 THEN RAISE EXCEPTION 'received value must be greater than zero'; END IF;

  SELECT COALESCE(sum(qty),0) INTO v_total_order_qty FROM public.purchase_order_items WHERE pharmacy_id = v_pharmacy_id AND purchase_order_id = v_po_id;
  SELECT COALESCE(sum(sm.qty_in),0) INTO v_total_received_qty FROM public.stock_movements sm WHERE sm.pharmacy_id = v_pharmacy_id AND sm.reference_type = 'purchase_order' AND sm.reference_id = v_po_id AND sm.movement_type = 'PURCHASE_RECEIPT';
  v_new_status := CASE WHEN v_total_received_qty >= v_total_order_qty THEN 'Selesai' ELSE 'Parsial' END;

  UPDATE public.purchase_orders SET status = v_new_status, received_at = CASE WHEN v_new_status = 'Selesai' THEN now() ELSE received_at END, value = GREATEST(value, v_received_value), updated_at = now(), updated_by = v_user_id WHERE id = v_po_id AND pharmacy_id = v_pharmacy_id;

  INSERT INTO public.accounts_payable (id, pharmacy_id, supplier_id, purchase_order_id, amount, adjusted_amount, paid_amount, due_date, status, created_by, updated_by)
  VALUES (v_ap_id, v_pharmacy_id, v_po.supplier_id, v_po_id, v_received_value, v_received_value, 0, current_date + interval '30 days', 'Open', v_user_id, v_user_id);

  INSERT INTO public.journal_entries (id, pharmacy_id, source_type, source_id, note, posted_at, created_by, updated_by)
  VALUES (v_journal_id, v_pharmacy_id, 'purchase_receipt', v_po_id::text, 'Auto journal PO receipt ' || v_po.code, now(), v_user_id, v_user_id);
  INSERT INTO public.journal_entry_lines (pharmacy_id, journal_entry_id, account_code, debit, credit, created_by, updated_by)
  VALUES (v_pharmacy_id, v_journal_id, '1300', v_received_value, 0, v_user_id, v_user_id), (v_pharmacy_id, v_journal_id, '2000', 0, v_received_value, v_user_id, v_user_id);

  PERFORM private.write_audit_log(v_pharmacy_id, v_branch_id, 'po', 'receive', 'purchase_orders', v_po_id, to_jsonb(v_po), jsonb_build_object('purchase_order_id', v_po_id, 'status', v_new_status, 'received_value', v_received_value, 'items', v_received_items, 'accounts_payable_id', v_ap_id, 'journal_entry_id', v_journal_id), v_receipt_id, 'web');

  RETURN jsonb_build_object('purchase_order_id', v_po_id, 'status', v_new_status, 'received_value', v_received_value, 'accounts_payable_id', v_ap_id, 'journal_entry_id', v_journal_id, 'idempotency_key', v_receipt_id, 'idempotent_replay', false, 'items', v_received_items);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(jsonb) TO authenticated;

COMMIT;
