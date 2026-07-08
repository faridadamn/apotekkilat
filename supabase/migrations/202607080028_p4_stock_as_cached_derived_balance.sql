-- Phase P4.5 — Treat products.stock as cached derived balance.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Source of truth is batch quantity by status. products.stock remains cached SELLABLE balance for performance.

BEGIN;

CREATE OR REPLACE VIEW public.product_stock_summary_view AS
SELECT
  p.id AS product_id,
  p.pharmacy_id,
  p.name AS product_name,
  p.base_unit,
  COALESCE(SUM(pb.qty) FILTER (WHERE pb.status = 'SELLABLE' AND (pb.expired_at IS NULL OR pb.expired_at >= current_date)), 0) AS stock_available,
  COALESCE(SUM(pb.qty) FILTER (WHERE pb.status = 'QUARANTINE'), 0) AS stock_quarantine,
  COALESCE(SUM(pb.qty) FILTER (WHERE pb.status = 'DAMAGED'), 0) AS stock_damaged,
  COALESCE(SUM(pb.qty) FILTER (WHERE pb.status = 'EXPIRED' OR (pb.expired_at IS NOT NULL AND pb.expired_at < current_date)), 0) AS stock_expired,
  COALESCE(SUM(pb.qty) FILTER (WHERE pb.status = 'RETURN_TO_VENDOR'), 0) AS stock_return_to_vendor,
  COALESCE(SUM(pb.qty), 0) AS stock_total_batch,
  p.stock AS stock_cached,
  COALESCE(SUM(pb.qty) FILTER (WHERE pb.status = 'SELLABLE' AND (pb.expired_at IS NULL OR pb.expired_at >= current_date)), 0) - COALESCE(p.stock,0) AS stock_cache_diff
FROM public.products p
LEFT JOIN public.product_batches pb ON pb.product_id = p.id AND pb.pharmacy_id = p.pharmacy_id
GROUP BY p.id, p.pharmacy_id, p.name, p.base_unit, p.stock;

CREATE OR REPLACE VIEW public.expiring_batches_report_view AS
SELECT
  pb.id AS batch_id,
  pb.pharmacy_id,
  pb.product_id,
  p.name AS product_name,
  pb.batch_no,
  pb.qty,
  pb.status,
  pb.location,
  pb.received_at,
  pb.expired_at,
  CASE WHEN pb.expired_at IS NULL THEN NULL ELSE (pb.expired_at - current_date) END AS days_to_expiry
FROM public.product_batches pb
JOIN public.products p ON p.id = pb.product_id
WHERE pb.qty > 0
  AND pb.status IN ('SELLABLE','QUARANTINE')
  AND pb.expired_at IS NOT NULL
ORDER BY pb.expired_at ASC, pb.received_at ASC NULLS LAST, pb.id;

CREATE OR REPLACE VIEW public.stock_reconciliation_view AS
SELECT s.*, CASE WHEN s.stock_cache_diff = 0 THEN 'MATCH' ELSE 'DIFF' END AS reconciliation_status
FROM public.product_stock_summary_view s;

CREATE OR REPLACE FUNCTION private.stock_mutation_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(current_setting('app.apotekkilat_allow_stock_mutation', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION private.block_direct_product_stock_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF COALESCE(OLD.stock,0) IS NOT DISTINCT FROM COALESCE(NEW.stock,0) THEN RETURN NEW; END IF;
  IF private.stock_mutation_allowed() THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.pharmacy_id = OLD.pharmacy_id
      AND sm.product_id = OLD.id
      AND sm.created_by = auth.uid()
      AND sm.created_at >= now() - interval '5 seconds'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'products.stock is a cached derived balance. Use inventory workflow RPC/reconciliation instead of direct update.';
END;
$$;

DROP TRIGGER IF EXISTS trg_p4_block_direct_product_stock_change ON public.products;
CREATE TRIGGER trg_p4_block_direct_product_stock_change
BEFORE UPDATE OF stock ON public.products
FOR EACH ROW EXECUTE FUNCTION private.block_direct_product_stock_change();

CREATE OR REPLACE FUNCTION public.reconcile_product_stock(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_product record;
  v_stock_available numeric;
  v_before numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_product.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT private.has_pharmacy_role(v_product.pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN RAISE EXCEPTION 'Not allowed to reconcile product stock'; END IF;

  SELECT COALESCE(SUM(qty),0) INTO v_stock_available
  FROM public.product_batches
  WHERE pharmacy_id = v_product.pharmacy_id
    AND product_id = v_product.id
    AND status = 'SELLABLE'
    AND (expired_at IS NULL OR expired_at >= current_date);

  v_before := COALESCE(v_product.stock,0);
  PERFORM set_config('app.apotekkilat_allow_stock_mutation', 'on', true);
  UPDATE public.products SET stock = v_stock_available, updated_at = now(), updated_by = v_user_id WHERE id = v_product.id;
  PERFORM private.write_audit_log(v_product.pharmacy_id, NULL, 'stock_reconciliation', 'reconcile_product_stock', 'products', v_product.id, jsonb_build_object('stock', v_before), jsonb_build_object('stock', v_stock_available), gen_random_uuid(), 'web');
  RETURN jsonb_build_object('product_id', v_product.id, 'stock_before', v_before, 'stock_after', v_stock_available, 'diff', v_stock_available - v_before);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_all_product_stock(p_pharmacy_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row record;
  v_count integer := 0;
  v_diff_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT private.has_pharmacy_role(p_pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN RAISE EXCEPTION 'Not allowed to reconcile tenant stock'; END IF;

  PERFORM set_config('app.apotekkilat_allow_stock_mutation', 'on', true);
  FOR v_row IN SELECT product_id, stock_available, stock_cached, stock_cache_diff FROM public.product_stock_summary_view WHERE pharmacy_id = p_pharmacy_id LOOP
    v_count := v_count + 1;
    IF COALESCE(v_row.stock_cache_diff,0) <> 0 THEN
      v_diff_count := v_diff_count + 1;
      UPDATE public.products SET stock = v_row.stock_available, updated_at = now(), updated_by = v_user_id WHERE id = v_row.product_id AND pharmacy_id = p_pharmacy_id;
    END IF;
  END LOOP;

  PERFORM private.write_audit_log(p_pharmacy_id, NULL, 'stock_reconciliation', 'reconcile_all_product_stock', 'products', NULL, NULL, jsonb_build_object('checked_products', v_count, 'corrected_products', v_diff_count), gen_random_uuid(), 'web');
  RETURN jsonb_build_object('checked_products', v_count, 'corrected_products', v_diff_count);
END;
$$;

CREATE INDEX IF NOT EXISTS product_batches_status_expiry_idx ON public.product_batches (pharmacy_id, status, expired_at ASC NULLS LAST) WHERE qty > 0;

GRANT SELECT ON public.product_stock_summary_view TO authenticated;
GRANT SELECT ON public.expiring_batches_report_view TO authenticated;
GRANT SELECT ON public.stock_reconciliation_view TO authenticated;

REVOKE ALL ON FUNCTION private.stock_mutation_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.block_direct_product_stock_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_product_stock(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_all_product_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_product_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_all_product_stock(uuid) TO authenticated;

COMMIT;
