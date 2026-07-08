-- Phase P4.1 — stock_movements ledger hardening.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

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

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_movements_select ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_insert_denied ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_update_denied ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_delete_denied ON public.stock_movements;
DROP POLICY IF EXISTS p4_stock_movements_select ON public.stock_movements;
DROP POLICY IF EXISTS p4_stock_movements_insert_deny ON public.stock_movements;
DROP POLICY IF EXISTS p4_stock_movements_update_deny ON public.stock_movements;
DROP POLICY IF EXISTS p4_stock_movements_delete_deny ON public.stock_movements;

CREATE POLICY p4_stock_movements_select ON public.stock_movements
FOR SELECT
USING (private.is_pharmacy_member(pharmacy_id));

CREATE POLICY p4_stock_movements_insert_deny ON public.stock_movements
FOR INSERT
WITH CHECK (false);

CREATE POLICY p4_stock_movements_update_deny ON public.stock_movements
FOR UPDATE
USING (false)
WITH CHECK (false);

CREATE POLICY p4_stock_movements_delete_deny ON public.stock_movements
FOR DELETE
USING (false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_movements_movement_type_check'
      AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_movement_type_check
      CHECK (movement_type IN (
        'SALE',
        'PURCHASE_RECEIPT',
        'BATCH_RECEIPT',
        'SALES_RETURN_SELLABLE',
        'SALES_RETURN_KARANTINA',
        'SALES_RETURN_RUSAK',
        'SALES_RETURN_EXPIRED',
        'SALES_RETURN_TUKAR_BARANG',
        'PURCHASE_RETURN',
        'STOCK_OPNAME_GAIN',
        'STOCK_OPNAME_LOSS',
        'ADJUSTMENT_IN',
        'ADJUSTMENT_OUT',
        'WRITE_OFF',
        'EXPIRE',
        'TRANSFER_IN',
        'TRANSFER_OUT'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stock_movements_pharmacy_created_idx ON public.stock_movements (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_product_created_idx ON public.stock_movements (pharmacy_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_batch_created_idx ON public.stock_movements (pharmacy_id, batch_id, created_at DESC) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_reference_idx ON public.stock_movements (pharmacy_id, reference_type, reference_id);
CREATE INDEX IF NOT EXISTS stock_movements_type_created_idx ON public.stock_movements (pharmacy_id, movement_type, created_at DESC);

CREATE OR REPLACE VIEW public.stock_ledger_view AS
SELECT
  sm.id,
  sm.pharmacy_id,
  sm.branch_id,
  b.name AS branch_name,
  sm.product_id,
  p.name AS product_name,
  p.base_unit,
  sm.batch_id,
  pb.batch_no,
  pb.expired_at,
  sm.movement_type,
  sm.qty_in,
  sm.qty_out,
  (sm.qty_in - sm.qty_out) AS qty_net,
  sm.balance_after,
  sm.reference_type,
  sm.reference_id,
  sm.note,
  sm.created_by,
  sm.created_at
FROM public.stock_movements sm
JOIN public.products p ON p.id = sm.product_id
LEFT JOIN public.branches b ON b.id = sm.branch_id
LEFT JOIN public.product_batches pb ON pb.id = sm.batch_id;

GRANT SELECT ON public.stock_ledger_view TO authenticated;

COMMIT;
