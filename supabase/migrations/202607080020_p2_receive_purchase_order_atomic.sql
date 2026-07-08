-- Phase P2.2 — Atomic receive_purchase_order RPC.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Responsibilities implemented in Supabase live:
-- - validates authenticated active user with Purchasing/Admin Stok/Supervisor/Owner role
-- - validates PO tenant and branch
-- - requires approved/receivable PO status
-- - supports partial receiving
-- - accepts batch_no, expired_at, qty_received, actual_cost, and location per item
-- - creates product_batches
-- - updates products.stock and actual cost snapshot
-- - writes stock_movements with PURCHASE_RECEIPT
-- - updates PO status to Parsial or Selesai
-- - creates accounts_payable for received value
-- - posts journal: Dr inventory / Cr AP
-- - writes audit_logs
-- - returns received items, AP id, journal id, status, and received value

BEGIN;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION 'Full receive_purchase_order body is deployed in Supabase live. Expand this migration before clean replay.';
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(jsonb) TO authenticated;

COMMIT;
