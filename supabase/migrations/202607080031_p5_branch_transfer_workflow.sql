-- Phase P5.2 — Branch transfer workflow.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- State machine: Draft -> Dikirim -> Diterima/Selesai.
-- Dispatch creates TRANSFER_OUT from source branch. Receive creates TRANSFER_IN to destination branch.

BEGIN;

CREATE TABLE IF NOT EXISTS public.branch_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  code text NOT NULL,
  from_branch_id uuid NOT NULL REFERENCES public.branches(id),
  to_branch_id uuid NOT NULL REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'Draft',
  note text,
  submitted_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  dispatched_by uuid REFERENCES auth.users(id),
  received_by uuid REFERENCES auth.users(id),
  completed_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK (status IN ('Draft','Dikirim','Diterima','Selesai','Dibatalkan')),
  CHECK (from_branch_id <> to_branch_id)
);

CREATE TABLE IF NOT EXISTS public.branch_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  branch_transfer_id uuid NOT NULL REFERENCES public.branch_transfers(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  batch_id uuid REFERENCES public.product_batches(id),
  qty numeric NOT NULL,
  received_qty numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  CHECK (qty > 0),
  CHECK (received_qty >= 0),
  CHECK (received_qty <= qty)
);

CREATE UNIQUE INDEX IF NOT EXISTS branch_transfers_pharmacy_code_unique ON public.branch_transfers (pharmacy_id, code);
CREATE INDEX IF NOT EXISTS branch_transfers_branch_status_idx ON public.branch_transfers (pharmacy_id, from_branch_id, to_branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS branch_transfer_items_transfer_idx ON public.branch_transfer_items (pharmacy_id, branch_transfer_id);
CREATE INDEX IF NOT EXISTS branch_transfer_items_batch_idx ON public.branch_transfer_items (pharmacy_id, batch_id) WHERE batch_id IS NOT NULL;

ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p5_branch_transfers_select ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfers_insert_deny ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfers_update_deny ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfers_delete_deny ON public.branch_transfers;
DROP POLICY IF EXISTS p5_branch_transfer_items_select ON public.branch_transfer_items;
DROP POLICY IF EXISTS p5_branch_transfer_items_insert_deny ON public.branch_transfer_items;
DROP POLICY IF EXISTS p5_branch_transfer_items_update_deny ON public.branch_transfer_items;
DROP POLICY IF EXISTS p5_branch_transfer_items_delete_deny ON public.branch_transfer_items;

CREATE POLICY p5_branch_transfers_select ON public.branch_transfers FOR SELECT USING (private.is_pharmacy_member(pharmacy_id));
CREATE POLICY p5_branch_transfers_insert_deny ON public.branch_transfers FOR INSERT WITH CHECK (false);
CREATE POLICY p5_branch_transfers_update_deny ON public.branch_transfers FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_branch_transfers_delete_deny ON public.branch_transfers FOR DELETE USING (false);

CREATE POLICY p5_branch_transfer_items_select ON public.branch_transfer_items FOR SELECT USING (private.is_pharmacy_member(pharmacy_id));
CREATE POLICY p5_branch_transfer_items_insert_deny ON public.branch_transfer_items FOR INSERT WITH CHECK (false);
CREATE POLICY p5_branch_transfer_items_update_deny ON public.branch_transfer_items FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_branch_transfer_items_delete_deny ON public.branch_transfer_items FOR DELETE USING (false);

-- NOTE: Full RPC function bodies for create_branch_transfer(jsonb), dispatch_branch_transfer(uuid), and receive_branch_transfer(uuid)
-- are deployed live in Supabase as p5_branch_transfer_workflow. Expand this migration before clean replay from zero.

COMMIT;
