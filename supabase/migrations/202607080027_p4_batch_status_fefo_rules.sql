-- Phase P4.2-P4.4 — Movement type, FEFO rule, and stock/batch status separation.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- NOTE: checkout_transaction and complete_return were also replaced live to align with FEFO SELLABLE and standardized movement types.

BEGIN;

ALTER TABLE public.product_batches ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'SELLABLE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_batches_status_check'
      AND conrelid = 'public.product_batches'::regclass
  ) THEN
    ALTER TABLE public.product_batches
      ADD CONSTRAINT product_batches_status_check
      CHECK (status IN ('SELLABLE','QUARANTINE','DAMAGED','EXPIRED','RETURN_TO_VENDOR'));
  END IF;
END $$;

UPDATE public.product_batches
SET status = 'EXPIRED', updated_at = now()
WHERE expired_at IS NOT NULL
  AND expired_at < current_date
  AND status = 'SELLABLE';

UPDATE public.stock_movements
SET movement_type = CASE movement_type
  WHEN 'SALES_RETURN_KARANTINA' THEN 'SALES_RETURN_QUARANTINE'
  WHEN 'SALES_RETURN_RUSAK' THEN 'WRITE_OFF_DAMAGED'
  WHEN 'SALES_RETURN_EXPIRED' THEN 'WRITE_OFF_EXPIRED'
  WHEN 'SALES_RETURN_TUKAR_BARANG' THEN 'SALES_RETURN_QUARANTINE'
  WHEN 'EXPIRE' THEN 'WRITE_OFF_EXPIRED'
  ELSE movement_type
END
WHERE movement_type IN ('SALES_RETURN_KARANTINA','SALES_RETURN_RUSAK','SALES_RETURN_EXPIRED','SALES_RETURN_TUKAR_BARANG','EXPIRE');

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'PURCHASE_RECEIPT',
    'SALE',
    'SALES_RETURN_SELLABLE',
    'SALES_RETURN_QUARANTINE',
    'PURCHASE_RETURN',
    'STOCK_OPNAME_GAIN',
    'STOCK_OPNAME_LOSS',
    'WRITE_OFF_DAMAGED',
    'WRITE_OFF_EXPIRED',
    'TRANSFER_OUT',
    'TRANSFER_IN'
  ));

CREATE INDEX IF NOT EXISTS product_batches_fefo_idx
  ON public.product_batches (pharmacy_id, product_id, status, expired_at ASC NULLS LAST, received_at ASC NULLS LAST, id)
  WHERE qty > 0;

DROP VIEW IF EXISTS public.fefo_available_batches_view;
CREATE VIEW public.fefo_available_batches_view AS
SELECT
  pb.id,
  pb.pharmacy_id,
  pb.product_id,
  p.name AS product_name,
  pb.batch_no,
  pb.received_at,
  pb.expired_at,
  pb.qty,
  pb.location,
  pb.status,
  row_number() OVER (
    PARTITION BY pb.pharmacy_id, pb.product_id
    ORDER BY pb.expired_at ASC NULLS LAST, pb.received_at ASC NULLS LAST, pb.id
  ) AS fefo_rank
FROM public.product_batches pb
JOIN public.products p ON p.id = pb.product_id
WHERE pb.qty > 0
  AND pb.status = 'SELLABLE'
  AND (pb.expired_at IS NULL OR pb.expired_at >= current_date);

DROP VIEW IF EXISTS public.stock_ledger_view;
CREATE VIEW public.stock_ledger_view AS
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
  pb.status AS batch_status,
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

GRANT SELECT ON public.fefo_available_batches_view TO authenticated;
GRANT SELECT ON public.stock_ledger_view TO authenticated;

COMMIT;
