-- Phase P4.5 companion — trusted workflow cache mutation flags.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Live changes:
-- - receive_purchase_order() sets app.apotekkilat_allow_stock_mutation before products.stock update
-- - complete_return() sets app.apotekkilat_allow_stock_mutation before products.stock update
-- - both functions keep stock_movements as ledger source and products.stock as cached balance
-- NOTE: Full function bodies were deployed live and should be expanded before clean replay from zero.

BEGIN;

-- Placeholder documentation migration. Full function definitions are live in Supabase.

COMMIT;
