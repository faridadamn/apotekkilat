-- Phase P1.5 — Lock Direct Client Mutation dan Jalur RPC Wajib
-- Repo: faridadamn/apotekkilat
-- Supabase project: gene / kipcvugwlghonpgvitjk
-- Applied manually to Supabase on 2026-07-08.

BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_pharmacy_idempotency_key_uidx
  ON public.transactions (pharmacy_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','product_uoms','product_batches','customers','suppliers',
    'transactions','transaction_items',
    'purchase_orders','purchase_order_items',
    'sales_returns','sales_return_items','purchase_returns','purchase_return_items',
    'stock_opnames','stock_opname_items',
    'journal_entries','journal_entry_lines',
    'accounts_payable','accounts_payable_payments','accounts_receivable','accounts_receivable_payments',
    'branches','pharmacy_settings','chart_of_accounts',
    'prescriptions','prescription_items',
    'price_lists','price_list_rules','price_list_customers',
    'conversations','conversation_messages'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS phm_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS phm_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS phm_delete ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS p15_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS p15_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS p15_delete ON public.%I', t);
  END LOOP;
END $$;

-- Master non-kritis: write role-scoped; delete ditutup.
CREATE POLICY p15_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]));
CREATE POLICY p15_update ON public.products
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]));

CREATE POLICY p15_insert ON public.product_uoms
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]));
CREATE POLICY p15_update ON public.product_uoms
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]));

CREATE POLICY p15_insert ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]));
CREATE POLICY p15_update ON public.customers
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]));

CREATE POLICY p15_insert ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Purchasing']::text[]));
CREATE POLICY p15_update ON public.suppliers
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Purchasing']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Purchasing']::text[]));

CREATE POLICY p15_insert ON public.product_batches
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]));
CREATE POLICY p15_update ON public.product_batches
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]));

-- Governance.
CREATE POLICY p15_insert ON public.branches
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[]));
CREATE POLICY p15_update ON public.branches
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[]));

CREATE POLICY p15_insert ON public.pharmacy_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner']::text[]));
CREATE POLICY p15_update ON public.pharmacy_settings
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));

CREATE POLICY p15_insert ON public.chart_of_accounts
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p15_update ON public.chart_of_accounts
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));

-- Prescription draft data.
CREATE POLICY p15_insert ON public.prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker']::text[]));
CREATE POLICY p15_update ON public.prescriptions
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker']::text[]));
CREATE POLICY p15_insert ON public.prescription_items
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker']::text[]));
CREATE POLICY p15_update ON public.prescription_items
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker']::text[]));

-- Pricing affects checkout integrity.
CREATE POLICY p15_insert ON public.price_lists
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p15_update ON public.price_lists
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p15_insert ON public.price_list_rules
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p15_update ON public.price_list_rules
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p15_insert ON public.price_list_customers
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p15_update ON public.price_list_customers
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));

-- Chat/conversation data: role-scoped, not open to every tenant member.
CREATE POLICY p15_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]));
CREATE POLICY p15_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]));
CREATE POLICY p15_insert ON public.conversation_messages
  FOR INSERT TO authenticated
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]));
CREATE POLICY p15_update ON public.conversation_messages
  FOR UPDATE TO authenticated
  USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]))
  WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]));

-- Tabel transaksi, finance, PO/retur/opname tidak dibuatkan INSERT/UPDATE/DELETE policy.
-- Artinya direct mutation dari client ditolak RLS dan mutasi harus lewat RPC SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.checkout_transaction(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_branch_id uuid := NULLIF(p_payload->>'branch_id','')::uuid;
  v_customer_id uuid := NULLIF(p_payload->>'customer_id','')::uuid;
  v_tx_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_idempotency_key uuid := COALESCE(NULLIF(p_payload->>'idempotency_key','')::uuid, v_tx_id);
  v_existing_tx_id uuid;
  v_item jsonb;
  v_product record;
  v_product_id uuid;
  v_qty numeric;
  v_base_qty numeric;
  v_unit_code text;
  v_unit record;
  v_price numeric;
  v_cost_base numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_item_rows jsonb := '[]'::jsonb;
  v_line jsonb;
BEGIN
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to checkout transaction';
  END IF;

  SELECT id INTO v_existing_tx_id
  FROM public.transactions
  WHERE pharmacy_id = v_pharmacy_id AND idempotency_key = v_idempotency_key;
  IF v_existing_tx_id IS NOT NULL THEN RETURN v_existing_tx_id; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric,0);
    v_unit_code := NULLIF(v_item->>'unit_code','');

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND pharmacy_id = v_pharmacy_id
    FOR UPDATE;

    IF v_product.id IS NULL THEN RAISE EXCEPTION 'Product not found: %', v_product_id; END IF;
    IF v_qty <= 0 THEN RAISE EXCEPTION 'Invalid quantity for product %', v_product_id; END IF;

    SELECT * INTO v_unit
    FROM public.product_uoms
    WHERE pharmacy_id = v_pharmacy_id AND product_id = v_product_id
      AND (v_unit_code IS NULL OR code = v_unit_code)
    ORDER BY CASE WHEN code = v_unit_code THEN 0 WHEN is_base THEN 1 ELSE 2 END, sort_order
    LIMIT 1;

    v_base_qty := v_qty * COALESCE(v_unit.factor_to_base, 1);
    v_price := COALESCE(v_unit.price, v_product.price);
    v_cost_base := COALESCE(v_unit.cost, v_product.cost);

    IF v_product.stock < v_base_qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
    END IF;

    v_subtotal := v_subtotal + (v_qty * v_price);
    v_line := jsonb_build_object(
      'id', COALESCE(NULLIF(v_item->>'id','')::uuid, gen_random_uuid()),
      'product_id', v_product_id,
      'product_name', v_product.name,
      'unit_code', COALESCE(v_unit.code, v_unit_code),
      'qty', v_qty,
      'base_qty', v_base_qty,
      'price', v_price,
      'cost_base', v_cost_base,
      'original_price', v_price,
      'discount_amount', 0,
      'drug_class', v_product.drug_class
    );
    v_item_rows := v_item_rows || jsonb_build_array(v_line);
  END LOOP;

  IF jsonb_array_length(v_item_rows) = 0 THEN RAISE EXCEPTION 'Checkout items are required'; END IF;

  v_tax := round(v_subtotal * 0.11);
  v_total := v_subtotal + v_tax;

  INSERT INTO public.transactions (
    id, pharmacy_id, branch_id, customer_id, code, subtotal, tax, total,
    payment_method, status, happened_at, prescription_id, price_list_ids, idempotency_key
  ) VALUES (
    v_tx_id, v_pharmacy_id, v_branch_id, v_customer_id,
    COALESCE(NULLIF(p_payload->>'code',''), 'TRX-' || to_char(now(),'YYMMDDHH24MISS')),
    v_subtotal, v_tax, v_total,
    COALESCE(NULLIF(p_payload->>'payment_method',''), 'Tunai'),
    'Selesai', now(), NULLIF(p_payload->>'prescription_id','')::uuid, ARRAY[]::uuid[], v_idempotency_key
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_item_rows) LOOP
    INSERT INTO public.transaction_items (
      id, pharmacy_id, transaction_id, product_id, product_name, unit_code,
      qty, base_qty, price, cost_base, original_price, discount_amount,
      price_list_id, price_list_name, drug_class
    ) VALUES (
      (v_line->>'id')::uuid, v_pharmacy_id, v_tx_id, (v_line->>'product_id')::uuid,
      v_line->>'product_name', NULLIF(v_line->>'unit_code',''),
      (v_line->>'qty')::numeric, (v_line->>'base_qty')::numeric,
      (v_line->>'price')::numeric, NULLIF(v_line->>'cost_base','')::numeric,
      NULLIF(v_line->>'original_price','')::numeric, COALESCE((v_line->>'discount_amount')::numeric,0),
      NULL, NULL, NULLIF(v_line->>'drug_class','')
    );

    UPDATE public.products
    SET stock = stock - (v_line->>'base_qty')::numeric, updated_at = now()
    WHERE id = (v_line->>'product_id')::uuid AND pharmacy_id = v_pharmacy_id;
  END LOOP;

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET points = points + floor(v_total / 10000)::int, updated_at = now()
    WHERE id = v_customer_id AND pharmacy_id = v_pharmacy_id;
  END IF;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_order(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_po_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_item jsonb;
  v_value numeric := 0;
  v_current_status text;
BEGIN
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Purchasing']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to create purchase order';
  END IF;

  SELECT status INTO v_current_status
  FROM public.purchase_orders
  WHERE id = v_po_id AND pharmacy_id = v_pharmacy_id
  FOR UPDATE;
  IF v_current_status IS NOT NULL AND v_current_status <> 'Draft' THEN
    RAISE EXCEPTION 'Purchase order is no longer editable';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_value := v_value + COALESCE((v_item->>'qty')::numeric,0) * COALESCE((v_item->>'cost')::numeric,0);
  END LOOP;

  INSERT INTO public.purchase_orders (id, pharmacy_id, supplier_id, code, supplier_name, note, value, status, ordered_at)
  VALUES (
    v_po_id, v_pharmacy_id, NULLIF(p_payload->>'supplier_id','')::uuid,
    COALESCE(NULLIF(p_payload->>'code',''), 'PO-' || to_char(now(),'YYMMDDHH24MISS')),
    NULLIF(p_payload->>'supplier_name',''), NULLIF(p_payload->>'note',''), v_value, 'Draft',
    COALESCE((p_payload->>'ordered_at')::timestamptz, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    supplier_id = excluded.supplier_id,
    supplier_name = excluded.supplier_name,
    note = excluded.note,
    value = excluded.value,
    updated_at = now();

  DELETE FROM public.purchase_order_items
  WHERE pharmacy_id = v_pharmacy_id AND purchase_order_id = v_po_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    INSERT INTO public.purchase_order_items (id, pharmacy_id, purchase_order_id, product_id, qty, display_qty, unit_code, unit_label, cost, expired_at)
    VALUES (
      COALESCE(NULLIF(v_item->>'id','')::uuid, gen_random_uuid()), v_pharmacy_id, v_po_id,
      NULLIF(v_item->>'product_id','')::uuid, COALESCE((v_item->>'qty')::numeric,0),
      NULLIF(v_item->>'display_qty','')::numeric, NULLIF(v_item->>'unit_code',''),
      NULLIF(v_item->>'unit_label',''), COALESCE((v_item->>'cost')::numeric,0),
      NULLIF(v_item->>'expired_at','')::date
    );
  END LOOP;

  RETURN v_po_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_return(p_return_kind text, p_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid;
  v_status text;
  v_item record;
BEGIN
  IF p_return_kind = 'sales' THEN
    SELECT pharmacy_id, status INTO v_pharmacy_id, v_status FROM public.sales_returns WHERE id = p_return_id FOR UPDATE;
    IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Sales return not found'; END IF;
    IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor']::text[]) THEN RAISE EXCEPTION 'Not allowed to complete sales return'; END IF;
    IF v_status = 'Selesai' THEN RETURN p_return_id; END IF;
    FOR v_item IN SELECT product_id, qty FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
      UPDATE public.products SET stock = stock + COALESCE(v_item.qty,0), updated_at = now()
      WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
    END LOOP;
    UPDATE public.sales_returns SET status = 'Selesai', completed_at = now(), updated_at = now() WHERE id = p_return_id;
  ELSIF p_return_kind = 'purchase' THEN
    SELECT pharmacy_id, status INTO v_pharmacy_id, v_status FROM public.purchase_returns WHERE id = p_return_id FOR UPDATE;
    IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Purchase return not found'; END IF;
    IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor']::text[]) THEN RAISE EXCEPTION 'Not allowed to complete purchase return'; END IF;
    IF v_status = 'Selesai' THEN RETURN p_return_id; END IF;
    FOR v_item IN SELECT product_id, qty FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
      UPDATE public.products SET stock = GREATEST(stock - COALESCE(v_item.qty,0), 0), updated_at = now()
      WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
    END LOOP;
    UPDATE public.purchase_returns SET status = 'Selesai', completed_at = now(), updated_at = now() WHERE id = p_return_id;
  ELSE
    RAISE EXCEPTION 'Unsupported return kind: %', p_return_kind;
  END IF;
  RETURN p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_stock_opname(p_stock_opname_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid;
  v_status text;
  v_item record;
BEGIN
  SELECT pharmacy_id, status INTO v_pharmacy_id, v_status FROM public.stock_opnames WHERE id = p_stock_opname_id FOR UPDATE;
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Stock opname not found'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to post stock opname';
  END IF;
  IF v_status = 'Selesai' THEN RETURN p_stock_opname_id; END IF;
  FOR v_item IN SELECT product_id, physical_qty FROM public.stock_opname_items WHERE stock_opname_id = p_stock_opname_id LOOP
    UPDATE public.products SET stock = COALESCE(v_item.physical_qty, stock), updated_at = now()
    WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
  END LOOP;
  UPDATE public.stock_opnames SET status = 'Selesai', updated_at = now() WHERE id = p_stock_opname_id;
  RETURN p_stock_opname_id;
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_transaction(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_purchase_order(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_return(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_stock_opname(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_transaction(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_return(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_opname(uuid) TO authenticated;

COMMIT;
