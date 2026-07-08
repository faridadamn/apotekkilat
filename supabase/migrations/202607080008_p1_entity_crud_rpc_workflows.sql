-- Phase P1.4.2: per-entity CRUD RPCs for transactional workflows.
-- These functions are intended RPC endpoints for authenticated users only.
-- They do not perform tenant-wide delete/replace operations.

CREATE OR REPLACE FUNCTION public.create_purchase_order(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_po_id uuid := COALESCE((p_payload->>'id')::uuid, gen_random_uuid());
  v_item jsonb;
  v_value numeric := 0;
BEGIN
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Purchasing']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to create purchase order';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_value := v_value + COALESCE((v_item->>'qty')::numeric,0) * COALESCE((v_item->>'cost')::numeric,0);
  END LOOP;

  INSERT INTO public.purchase_orders (id, pharmacy_id, supplier_id, code, supplier_name, note, value, status, ordered_at)
  VALUES (v_po_id, v_pharmacy_id, NULLIF(p_payload->>'supplier_id','')::uuid, COALESCE(NULLIF(p_payload->>'code',''), 'PO-' || to_char(now(),'YYMMDDHH24MISS')), NULLIF(p_payload->>'supplier_name',''), NULLIF(p_payload->>'note',''), v_value, COALESCE(NULLIF(p_payload->>'status',''), 'Draft'), COALESCE((p_payload->>'ordered_at')::timestamptz, now()))
  ON CONFLICT (id) DO UPDATE SET supplier_id = excluded.supplier_id, supplier_name = excluded.supplier_name, note = excluded.note, value = excluded.value, status = excluded.status, updated_at = now();

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    INSERT INTO public.purchase_order_items (id, pharmacy_id, purchase_order_id, product_id, qty, display_qty, unit_code, unit_label, cost, expired_at)
    VALUES (COALESCE((v_item->>'id')::uuid, gen_random_uuid()), v_pharmacy_id, v_po_id, NULLIF(v_item->>'product_id','')::uuid, COALESCE((v_item->>'qty')::numeric,0), NULLIF(v_item->>'display_qty','')::numeric, NULLIF(v_item->>'unit_code',''), NULLIF(v_item->>'unit_label',''), COALESCE((v_item->>'cost')::numeric,0), NULLIF(v_item->>'expired_at','')::date)
    ON CONFLICT (id) DO UPDATE SET product_id = excluded.product_id, qty = excluded.qty, display_qty = excluded.display_qty, unit_code = excluded.unit_code, unit_label = excluded.unit_label, cost = excluded.cost, expired_at = excluded.expired_at;
  END LOOP;

  RETURN v_po_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.checkout_transaction(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_tx_id uuid := COALESCE((p_payload->>'id')::uuid, gen_random_uuid());
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_current_stock numeric;
BEGIN
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Kasir']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to checkout transaction';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric,0);
    SELECT stock INTO v_current_stock FROM public.products WHERE id = v_product_id AND pharmacy_id = v_pharmacy_id FOR UPDATE;
    IF v_current_stock IS NULL THEN RAISE EXCEPTION 'Product not found: %', v_product_id; END IF;
    IF v_current_stock < v_qty THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product_id; END IF;
  END LOOP;

  INSERT INTO public.transactions (id, pharmacy_id, branch_id, customer_id, code, subtotal, tax, total, payment_method, status, happened_at, prescription_id, price_list_ids)
  VALUES (v_tx_id, v_pharmacy_id, NULLIF(p_payload->>'branch_id','')::uuid, NULLIF(p_payload->>'customer_id','')::uuid, COALESCE(NULLIF(p_payload->>'code',''), 'TRX-' || to_char(now(),'YYMMDDHH24MISS')), COALESCE((p_payload->>'subtotal')::numeric,0), COALESCE((p_payload->>'tax')::numeric,0), COALESCE((p_payload->>'total')::numeric,0), COALESCE(NULLIF(p_payload->>'payment_method',''), 'Tunai'), COALESCE(NULLIF(p_payload->>'status',''), 'Selesai'), COALESCE((p_payload->>'happened_at')::timestamptz, now()), NULLIF(p_payload->>'prescription_id','')::uuid, ARRAY[]::uuid[]);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'items','[]'::jsonb)) LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::uuid;
    v_qty := COALESCE((v_item->>'qty')::numeric,0);
    INSERT INTO public.transaction_items (id, pharmacy_id, transaction_id, product_id, product_name, unit_code, qty, base_qty, price, cost_base, original_price, discount_amount, price_list_id, price_list_name, drug_class)
    VALUES (COALESCE((v_item->>'id')::uuid, gen_random_uuid()), v_pharmacy_id, v_tx_id, v_product_id, COALESCE(NULLIF(v_item->>'product_name',''), 'Produk'), NULLIF(v_item->>'unit_code',''), v_qty, NULLIF(v_item->>'base_qty','')::numeric, COALESCE((v_item->>'price')::numeric,0), NULLIF(v_item->>'cost_base','')::numeric, NULLIF(v_item->>'original_price','')::numeric, COALESCE((v_item->>'discount_amount')::numeric,0), NULLIF(v_item->>'price_list_id','')::uuid, NULLIF(v_item->>'price_list_name',''), NULLIF(v_item->>'drug_class',''));
    UPDATE public.products SET stock = stock - v_qty, updated_at = now() WHERE id = v_product_id AND pharmacy_id = v_pharmacy_id;
  END LOOP;

  IF NULLIF(p_payload->>'customer_id','') IS NOT NULL THEN
    UPDATE public.customers SET points = points + floor(COALESCE((p_payload->>'total')::numeric,0) / 10000)::int, updated_at = now()
    WHERE id = NULLIF(p_payload->>'customer_id','')::uuid AND pharmacy_id = v_pharmacy_id;
  END IF;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_return(p_return_kind text, p_return_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pharmacy_id uuid;
  v_item record;
BEGIN
  IF p_return_kind = 'sales' THEN
    SELECT pharmacy_id INTO v_pharmacy_id FROM public.sales_returns WHERE id = p_return_id;
    IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Sales return not found'; END IF;
    IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor']::text[]) THEN RAISE EXCEPTION 'Not allowed to complete sales return'; END IF;
    FOR v_item IN SELECT product_id, qty FROM public.sales_return_items WHERE sales_return_id = p_return_id LOOP
      UPDATE public.products SET stock = stock + COALESCE(v_item.qty,0), updated_at = now() WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
    END LOOP;
    UPDATE public.sales_returns SET status = 'Selesai', completed_at = now(), updated_at = now() WHERE id = p_return_id;
  ELSIF p_return_kind = 'purchase' THEN
    SELECT pharmacy_id INTO v_pharmacy_id FROM public.purchase_returns WHERE id = p_return_id;
    IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Purchase return not found'; END IF;
    IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor']::text[]) THEN RAISE EXCEPTION 'Not allowed to complete purchase return'; END IF;
    FOR v_item IN SELECT product_id, qty FROM public.purchase_return_items WHERE purchase_return_id = p_return_id LOOP
      UPDATE public.products SET stock = GREATEST(stock - COALESCE(v_item.qty,0), 0), updated_at = now() WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
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
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pharmacy_id uuid;
  v_item record;
BEGIN
  SELECT pharmacy_id INTO v_pharmacy_id FROM public.stock_opnames WHERE id = p_stock_opname_id;
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Stock opname not found'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN RAISE EXCEPTION 'Not allowed to post stock opname'; END IF;
  FOR v_item IN SELECT product_id, physical_qty FROM public.stock_opname_items WHERE stock_opname_id = p_stock_opname_id LOOP
    UPDATE public.products SET stock = COALESCE(v_item.physical_qty, stock), updated_at = now() WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
  END LOOP;
  UPDATE public.stock_opnames SET status = 'Posted', updated_at = now() WHERE id = p_stock_opname_id;
  RETURN p_stock_opname_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.checkout_transaction(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_return(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.post_stock_opname(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_transaction(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_return(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_opname(uuid) TO authenticated;
