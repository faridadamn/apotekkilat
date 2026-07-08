-- Phase P5.1 — Branch inventory foundation.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Adds per-branch/product/batch cached inventory derived from stock_movements.

BEGIN;

CREATE TABLE IF NOT EXISTS public.branch_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.product_batches(id),
  sellable_qty numeric NOT NULL DEFAULT 0,
  quarantine_qty numeric NOT NULL DEFAULT 0,
  reorder_point numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK (sellable_qty >= 0),
  CHECK (quarantine_qty >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS branch_inventory_unique_idx
  ON public.branch_inventory (pharmacy_id, branch_id, product_id, batch_id) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS branch_inventory_branch_product_idx ON public.branch_inventory (pharmacy_id, branch_id, product_id);
CREATE INDEX IF NOT EXISTS branch_inventory_batch_idx ON public.branch_inventory (pharmacy_id, batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p5_branch_inventory_select ON public.branch_inventory;
DROP POLICY IF EXISTS p5_branch_inventory_insert_deny ON public.branch_inventory;
DROP POLICY IF EXISTS p5_branch_inventory_update_deny ON public.branch_inventory;
DROP POLICY IF EXISTS p5_branch_inventory_delete_deny ON public.branch_inventory;

CREATE POLICY p5_branch_inventory_select ON public.branch_inventory FOR SELECT USING (private.is_pharmacy_member(pharmacy_id));
CREATE POLICY p5_branch_inventory_insert_deny ON public.branch_inventory FOR INSERT WITH CHECK (false);
CREATE POLICY p5_branch_inventory_update_deny ON public.branch_inventory FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_branch_inventory_delete_deny ON public.branch_inventory FOR DELETE USING (false);

CREATE OR REPLACE FUNCTION private.resolve_stock_movement_branch(p_pharmacy_id uuid, p_branch_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    p_branch_id,
    (SELECT b.id FROM public.branches b WHERE b.pharmacy_id = p_pharmacy_id AND b.is_main = true ORDER BY b.created_at ASC LIMIT 1),
    (SELECT b.id FROM public.branches b WHERE b.pharmacy_id = p_pharmacy_id ORDER BY b.created_at ASC LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION private.apply_stock_movement_to_branch_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_branch_id uuid;
  v_sellable_delta numeric := 0;
  v_quarantine_delta numeric := 0;
BEGIN
  v_branch_id := private.resolve_stock_movement_branch(NEW.pharmacy_id, NEW.branch_id);
  IF v_branch_id IS NULL THEN RAISE EXCEPTION 'Cannot resolve branch for stock movement %', NEW.id; END IF;

  IF NEW.movement_type IN ('PURCHASE_RECEIPT','SALES_RETURN_SELLABLE','STOCK_OPNAME_GAIN','TRANSFER_IN') THEN
    v_sellable_delta := COALESCE(NEW.qty_in,0) - COALESCE(NEW.qty_out,0);
  ELSIF NEW.movement_type IN ('SALE','PURCHASE_RETURN','STOCK_OPNAME_LOSS','WRITE_OFF_DAMAGED','WRITE_OFF_EXPIRED','TRANSFER_OUT') THEN
    v_sellable_delta := COALESCE(NEW.qty_in,0) - COALESCE(NEW.qty_out,0);
  ELSIF NEW.movement_type = 'SALES_RETURN_QUARANTINE' THEN
    v_quarantine_delta := COALESCE(NEW.qty_in,0) - COALESCE(NEW.qty_out,0);
  END IF;

  IF v_sellable_delta = 0 AND v_quarantine_delta = 0 THEN RETURN NEW; END IF;

  INSERT INTO public.branch_inventory (pharmacy_id, branch_id, product_id, batch_id, sellable_qty, quarantine_qty, created_by, updated_by)
  VALUES (NEW.pharmacy_id, v_branch_id, NEW.product_id, NEW.batch_id, GREATEST(v_sellable_delta, 0), GREATEST(v_quarantine_delta, 0), NEW.created_by, NEW.created_by)
  ON CONFLICT (pharmacy_id, branch_id, product_id, batch_id) DO UPDATE SET
    sellable_qty = public.branch_inventory.sellable_qty + v_sellable_delta,
    quarantine_qty = public.branch_inventory.quarantine_qty + v_quarantine_delta,
    updated_at = now(),
    updated_by = NEW.created_by,
    version = public.branch_inventory.version + 1;

  IF EXISTS (
    SELECT 1 FROM public.branch_inventory bi
    WHERE bi.pharmacy_id = NEW.pharmacy_id
      AND bi.branch_id = v_branch_id
      AND bi.product_id = NEW.product_id
      AND bi.batch_id IS NOT DISTINCT FROM NEW.batch_id
      AND (bi.sellable_qty < 0 OR bi.quarantine_qty < 0)
  ) THEN
    RAISE EXCEPTION 'Branch inventory cannot become negative for product % batch % branch %', NEW.product_id, NEW.batch_id, v_branch_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p5_apply_stock_movement_to_branch_inventory ON public.stock_movements;
CREATE TRIGGER trg_p5_apply_stock_movement_to_branch_inventory
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION private.apply_stock_movement_to_branch_inventory();

CREATE OR REPLACE VIEW public.branch_inventory_view AS
SELECT
  bi.id,
  bi.pharmacy_id,
  bi.branch_id,
  b.name AS branch_name,
  bi.product_id,
  p.name AS product_name,
  p.base_unit,
  bi.batch_id,
  pb.batch_no,
  pb.expired_at,
  pb.status AS batch_status,
  bi.sellable_qty,
  bi.quarantine_qty,
  bi.reorder_point,
  CASE WHEN bi.reorder_point IS NOT NULL AND bi.sellable_qty <= bi.reorder_point THEN true ELSE false END AS below_reorder_point,
  bi.updated_at
FROM public.branch_inventory bi
JOIN public.branches b ON b.id = bi.branch_id
JOIN public.products p ON p.id = bi.product_id
LEFT JOIN public.product_batches pb ON pb.id = bi.batch_id;

CREATE OR REPLACE VIEW public.branch_stock_summary_view AS
SELECT
  bi.pharmacy_id,
  bi.branch_id,
  b.name AS branch_name,
  bi.product_id,
  p.name AS product_name,
  p.base_unit,
  SUM(bi.sellable_qty) AS sellable_qty,
  SUM(bi.quarantine_qty) AS quarantine_qty,
  SUM(COALESCE(bi.sellable_qty,0) + COALESCE(bi.quarantine_qty,0)) AS total_branch_qty,
  MIN(bi.reorder_point) FILTER (WHERE bi.reorder_point IS NOT NULL) AS reorder_point
FROM public.branch_inventory bi
JOIN public.branches b ON b.id = bi.branch_id
JOIN public.products p ON p.id = bi.product_id
GROUP BY bi.pharmacy_id, bi.branch_id, b.name, bi.product_id, p.name, p.base_unit;

GRANT SELECT ON public.branch_inventory_view TO authenticated;
GRANT SELECT ON public.branch_stock_summary_view TO authenticated;

REVOKE ALL ON FUNCTION private.resolve_stock_movement_branch(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.apply_stock_movement_to_branch_inventory() FROM PUBLIC, anon, authenticated;

COMMIT;
