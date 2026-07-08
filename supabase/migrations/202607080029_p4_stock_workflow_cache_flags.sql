-- Phase P4.5 companion — trusted workflow cache mutation flags.
-- Full replayable companion migration.
-- receive_purchase_order() full body is synced in 202607080020_p2_receive_purchase_order_atomic.sql.
-- complete_return() full body is synced in 202607080021_p2_return_state_machine_rpcs.sql.
-- This migration keeps only grants/guard expectations and intentionally does not redefine duplicate functions.

BEGIN;

-- Guard functions are defined in 202607080028_p4_stock_as_cached_derived_balance.sql.
-- Workflow RPCs that mutate products.stock must either:
-- 1) write stock_movements before products.stock update, or
-- 2) set app.apotekkilat_allow_stock_mutation = on in the local transaction.

REVOKE ALL ON FUNCTION private.stock_mutation_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.block_direct_product_stock_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.receive_purchase_order(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_return(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_return(text, uuid) TO authenticated;

COMMIT;
