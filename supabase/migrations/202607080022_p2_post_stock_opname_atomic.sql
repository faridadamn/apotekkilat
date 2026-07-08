-- Phase P2.4 — Atomic post_stock_opname RPC.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Live Supabase implementation includes:
-- - replaces post_stock_opname(uuid) return type from uuid to jsonb
-- - validates authenticated Admin Stok/Supervisor/Owner
-- - locks stock_opnames row FOR UPDATE
-- - refuses invalid statuses and returns idempotent replay for Posted/Selesai
-- - requires all non-zero diff rows to have reason
-- - locks products row FOR UPDATE
-- - writes STOCK_OPNAME_GAIN / STOCK_OPNAME_LOSS stock_movements
-- - updates products.stock to physical_qty server-side
-- - creates journal adjustment when gain/loss value exists
-- - sets stock_opnames.status = Posted, posted_at, posted_by
-- - writes audit_logs
-- - relies on immutable document trigger to block later edit/delete of Posted document

BEGIN;

-- NOTE: Full function body is deployed in Supabase live as p2_post_stock_opname_atomic.
-- Expand this migration before clean replay from zero.

COMMIT;
