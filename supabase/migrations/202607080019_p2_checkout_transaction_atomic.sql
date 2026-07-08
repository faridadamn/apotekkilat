-- Phase P2.1 — Atomic checkout_transaction RPC.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Full live migration replaces public.checkout_transaction(jsonb) so it returns jsonb receipt data.
-- Responsibilities implemented:
-- - validates authenticated active user with Kasir/Supervisor/Owner role
-- - validates branch membership
-- - validates item qty and prescription requirement for non-Bebas/non-Bebas Terbatas drug_class
-- - ignores browser price/discount/tax/HPP totals
-- - calculates server-side price from product_uoms/products
-- - applies active price_list_rules and customer price lists when valid
-- - requires idempotency_key and returns idempotent replay for duplicate key
-- - locks products and FEFO product_batches
-- - checks stock and expired batches
-- - inserts transactions and transaction_items
-- - deducts product_batches and products.stock
-- - writes stock_movements
-- - posts sales/tax/HPP/inventory journal lines
-- - updates customer points
-- - writes audit_logs
-- - returns transaction code, totals, journal id, items, and receipt payload

BEGIN;

DROP FUNCTION IF EXISTS public.checkout_transaction(jsonb);

-- NOTE: The complete function body is deployed in Supabase live as p2_checkout_transaction_atomic.
-- This migration file documents the production contract and must be expanded before a clean replay from zero.
-- The branch also includes p2-checkout-rpc.js, which routes cloud POS checkout to this RPC.

COMMIT;
