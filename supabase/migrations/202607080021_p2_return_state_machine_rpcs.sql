-- Phase P2.3 — Return state-machine RPCs.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Live Supabase implementation includes:
-- - submitted_by / approved_by / rejected_by actor fields on sales_returns and purchase_returns
-- - inspection_result / inspection_note on sales_return_items
-- - inspection_result CHECK: layak_jual, karantina, rusak, expired, tukar_barang
-- - submit_return(jsonb): create/update Draft or submit to Menunggu Approval
-- - approve_return(jsonb): approve Menunggu Approval to Disetujui, reject Draft/Menunggu Approval to Ditolak
-- - complete_return(text, uuid): complete only Disetujui returns, no double apply
-- - role split:
--   sales submit: Kasir/Supervisor/Owner
--   purchase submit: Purchasing/Supervisor/Owner
--   approve/reject: Supervisor/Owner
--   sales complete: Supervisor/Owner
--   purchase complete: Purchasing/Supervisor/Owner
-- - sales return completion only adds stock when inspection_result = layak_jual
-- - non-sellable inspection results create stock movement notes but do not return stock to sellable inventory
-- - audit log on submit/approve/reject/complete

BEGIN;

-- NOTE: Full function bodies are deployed in Supabase live as p2_return_state_machine_rpcs.
-- Expand this migration before clean replay from zero.

COMMIT;
