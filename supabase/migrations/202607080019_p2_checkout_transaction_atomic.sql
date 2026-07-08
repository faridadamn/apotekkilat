-- Phase P2.1/P4.3/P5.3 — Atomic checkout_transaction RPC.
-- Replayable SQL body synced from live design on 2026-07-08.
-- Handles branch guard, idempotency, server-side price/cost, FEFO SELLABLE batch allocation, journal, stock movement, customer points, and audit log.

BEGIN;

DROP FUNCTION IF EXISTS public.checkout_transaction(jsonb);

CREATE OR REPLACE FUNCTION public.checkout_transaction(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_branch_id uuid := NULLIF(p_payload->>'branch_id','')::uuid;
  v_customer_id uuid := NULLIF(p_payload->>'customer_id','')::uuid;
  v_prescription_id uuid := NULLIF(p_payload->>'prescription_id','')::uuid;
  v_payment_method text := COALESCE(NULLIF(p_payload->>'payment_method',''), 'Tunai');
  v_idempotency_key uuid := NULLIF(p_payload->>'idempotency_key','')::uuid;
  v_tx_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_membership record;
  v_branch record;
  v_existing record;
  v_pharmacy_id uuid;
  v_item jsonb;
  v_product record;
  v_unit record;
  v_batch record;
  v_product_id uuid;
  v_unit_code text;
  v_qty numeric;
  v_base_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_hpp numeric := 0;
  v_remaining numeric;
  v_take numeric;
  v_batch_available numeric;
  v_any_batch numeric;
  v_tx_code text;
  v_items jsonb := '[]'::jsonb;
  v_debit_account text;
  v_points_added integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_branch_id IS NULL THEN RAISE EXCEPTION 'branch_id is required'; END IF;
  IF v_idempotency_key IS NULL THEN RAISE EXCEPTION 'idempotency_key is required'; END IF;
  IF v_payment_method NOT IN ('Tunai','QRIS','Debit','Kredit') THEN RAISE EXCEPTION 'Unsupported payment_method: %', v_payment_method; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'items are required'; END IF;

  SELECT pu.* INTO v_membership
  FROM public.pharmacy_users pu
  WHERE pu.user_id = v_user_id
    AND pu.status = 'Aktif'
    AND pu.role IN ('Kasir','Supervisor','Owner')
    AND (pu.branch_id IS NULL OR pu.branch_id = v_branch_id)
  ORDER BY CASE WHEN pu.branch_id = v_branch_id THEN 0 ELSE 1 END
  LIMIT 1;
  IF v_membership.id IS NULL THEN RAISE EXCEPTION 'User is not allowed to checkout for this branch'; END IF;
  v_pharmacy_id := v_membership.pharmacy_id;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_branch_id AND pharmacy_id = v_pharmacy_id;
  IF v_branch.id IS NULL THEN RAISE EXCEPTION 'Branch not found or outside active tenant'; END IF;

  SELECT * INTO v_existing FROM public.transactions WHERE pharmacy_id = v_pharmacy_id AND idempotency_key = v_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('transaction_id', v_existing.id, 'code', v_existing.code, 'subtotal', v_existing.subtotal, 'tax', v_existing.tax, 'total', v_existing.total, 'payment_method', v_existing.payment_method, 'idempotency_key', v_existing.idempotency_key, 'status', v_existing.status, 'idempotent_replay', true);
  END IF;

  IF v_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = v_customer_id AND pharmacy_id = v_pharmacy_id AND status = 'Aktif') THEN
    RAISE EXCEPTION 'Customer is not active or outside tenant';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_unit_code := NULLIF(v_item->>'unit_code','');
    v_qty := COALESCE((v_item->>'qty')::numeric, 0);
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'product_id is required'; END IF;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'qty must be greater than zero'; END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_product_id AND pharmacy_id = v_pharmacy_id FOR UPDATE;
    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Product not found or outside tenant: %', v_product_id; END IF;
    IF v_product.drug_class NOT IN ('Bebas','Bebas Terbatas') AND v_prescription_id IS NULL THEN
      RAISE EXCEPTION 'Product % requires prescription validation', v_product.name;
    END IF;

    SELECT * INTO v_unit
    FROM public.product_uoms
    WHERE pharmacy_id = v_pharmacy_id
      AND product_id = v_product_id
      AND (v_unit_code IS NULL OR code = v_unit_code)
    ORDER BY CASE WHEN code = v_unit_code THEN 0 WHEN is_base THEN 1 ELSE 2 END, sort_order
    LIMIT 1;

    v_base_qty := v_qty * COALESCE(v_unit.factor_to_base, 1);
    v_price := COALESCE(v_unit.price, v_product.price, 0);
    v_cost := COALESCE(v_unit.cost, v_product.cost, 0);
    v_line_total := v_qty * v_price;

    SELECT COALESCE(sum(qty),0) INTO v_any_batch
    FROM public.product_batches
    WHERE pharmacy_id = v_pharmacy_id AND product_id = v_product_id AND qty > 0;

    SELECT COALESCE(sum(qty),0) INTO v_batch_available
    FROM public.product_batches
    WHERE pharmacy_id = v_pharmacy_id
      AND product_id = v_product_id
      AND qty > 0
      AND status = 'SELLABLE'
      AND (expired_at IS NULL OR expired_at >= current_date);

    IF v_any_batch > 0 AND v_batch_available < v_base_qty THEN
      RAISE EXCEPTION 'Insufficient SELLABLE FEFO batch stock for product %', v_product.name;
    ELSIF v_any_batch = 0 AND COALESCE(v_product.stock,0) < v_base_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_product.name;
    END IF;

    v_subtotal := v_subtotal + v_line_total;
    v_hpp := v_hpp + (v_base_qty * v_cost);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'product_name', v_product.name,
      'unit_code', COALESCE(v_unit.code, v_unit_code, v_product.sale_unit, v_product.base_unit),
      'qty', v_qty,
      'base_qty', v_base_qty,
      'price', v_price,
      'line_total', v_line_total,
      'cost_base', v_cost,
      'drug_class', v_product.drug_class
    ));
  END LOOP;

  v_tax := round(v_subtotal * 0.11);
  v_total := v_subtotal + v_tax;
  v_tx_code := 'TRX-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(v_tx_id::text,'-',''),1,8));

  INSERT INTO public.transactions (id, pharmacy_id, branch_id, customer_id, code, subtotal, tax, total, payment_method, status, happened_at, prescription_id, idempotency_key, created_by, updated_by)
  VALUES (v_tx_id, v_pharmacy_id, v_branch_id, v_customer_id, v_tx_code, v_subtotal, v_tax, v_total, v_payment_method, 'Selesai', now(), v_prescription_id, v_idempotency_key, v_user_id, v_user_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.transaction_items (id, pharmacy_id, transaction_id, product_id, product_name, unit_code, qty, price, base_qty, cost_base, original_price, discount_amount, drug_class, created_by, updated_by)
    VALUES (gen_random_uuid(), v_pharmacy_id, v_tx_id, (v_item->>'product_id')::uuid, v_item->>'product_name', v_item->>'unit_code', (v_item->>'qty')::numeric, (v_item->>'price')::numeric, (v_item->>'base_qty')::numeric, (v_item->>'cost_base')::numeric, (v_item->>'price')::numeric, 0, v_item->>'drug_class', v_user_id, v_user_id);

    v_remaining := (v_item->>'base_qty')::numeric;
    FOR v_batch IN
      SELECT * FROM public.product_batches
      WHERE pharmacy_id = v_pharmacy_id
        AND product_id = (v_item->>'product_id')::uuid
        AND qty > 0
        AND status = 'SELLABLE'
        AND (expired_at IS NULL OR expired_at >= current_date)
      ORDER BY expired_at ASC NULLS LAST, received_at ASC NULLS LAST, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_batch.qty, v_remaining);
      UPDATE public.product_batches SET qty = qty - v_take, updated_at = now(), updated_by = v_user_id WHERE id = v_batch.id;
      INSERT INTO public.stock_movements (pharmacy_id, branch_id, product_id, batch_id, movement_type, qty_in, qty_out, balance_after, reference_type, reference_id, note, created_by)
      VALUES (v_pharmacy_id, v_branch_id, (v_item->>'product_id')::uuid, v_batch.id, 'SALE', 0, v_take, v_batch.qty - v_take, 'transaction', v_tx_id, 'Checkout FEFO SELLABLE allocation', v_user_id);
      v_remaining := v_remaining - v_take;
    END LOOP;

    IF v_remaining > 0 THEN
      INSERT INTO public.stock_movements (pharmacy_id, branch_id, product_id, batch_id, movement_type, qty_in, qty_out, balance_after, reference_type, reference_id, note, created_by)
      VALUES (v_pharmacy_id, v_branch_id, (v_item->>'product_id')::uuid, NULL, 'SALE', 0, v_remaining, NULL, 'transaction', v_tx_id, 'Checkout fallback without batch row', v_user_id);
    END IF;

    UPDATE public.products SET stock = stock - (v_item->>'base_qty')::numeric, updated_at = now(), updated_by = v_user_id WHERE id = (v_item->>'product_id')::uuid AND pharmacy_id = v_pharmacy_id;
  END LOOP;

  IF v_customer_id IS NOT NULL THEN
    v_points_added := floor(v_total / 10000)::integer;
    UPDATE public.customers SET points = points + v_points_added, updated_at = now(), updated_by = v_user_id WHERE id = v_customer_id AND pharmacy_id = v_pharmacy_id;
  END IF;

  v_debit_account := CASE WHEN v_payment_method = 'Kredit' THEN '1200' WHEN v_payment_method IN ('QRIS','Debit') THEN '1100' ELSE '1000' END;
  INSERT INTO public.journal_entries (id, pharmacy_id, source_type, source_id, note, posted_at, created_by, updated_by)
  VALUES (v_journal_id, v_pharmacy_id, 'transaction', v_tx_id::text, 'Auto journal checkout ' || v_tx_code, now(), v_user_id, v_user_id);
  INSERT INTO public.journal_entry_lines (pharmacy_id, journal_entry_id, account_code, debit, credit, created_by, updated_by)
  VALUES
    (v_pharmacy_id, v_journal_id, v_debit_account, v_total, 0, v_user_id, v_user_id),
    (v_pharmacy_id, v_journal_id, '4000', 0, v_subtotal, v_user_id, v_user_id),
    (v_pharmacy_id, v_journal_id, '2100', 0, v_tax, v_user_id, v_user_id),
    (v_pharmacy_id, v_journal_id, '5000', v_hpp, 0, v_user_id, v_user_id),
    (v_pharmacy_id, v_journal_id, '1300', 0, v_hpp, v_user_id, v_user_id);

  PERFORM private.write_audit_log(v_pharmacy_id, v_branch_id, 'cashier', 'checkout', 'transactions', v_tx_id, NULL, jsonb_build_object('transaction_id', v_tx_id, 'code', v_tx_code, 'subtotal', v_subtotal, 'tax', v_tax, 'total', v_total, 'hpp', v_hpp, 'idempotency_key', v_idempotency_key, 'payment_method', v_payment_method, 'points_added', v_points_added), v_idempotency_key, 'web');

  RETURN jsonb_build_object('transaction_id', v_tx_id, 'code', v_tx_code, 'branch_id', v_branch_id, 'branch_name', v_branch.name, 'customer_id', v_customer_id, 'payment_method', v_payment_method, 'subtotal', v_subtotal, 'tax', v_tax, 'total', v_total, 'hpp', v_hpp, 'points_added', v_points_added, 'journal_entry_id', v_journal_id, 'idempotency_key', v_idempotency_key, 'idempotent_replay', false, 'items', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_transaction(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_transaction(jsonb) TO authenticated;

COMMIT;
