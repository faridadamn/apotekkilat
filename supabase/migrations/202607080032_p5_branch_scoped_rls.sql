-- Phase P5.3 — Branch-scoped RLS.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Owner/Supervisor see all tenant branches. Branch-limited users see only their branch-scoped data.

BEGIN;

CREATE OR REPLACE FUNCTION private.can_access_branch(p_pharmacy_id uuid, p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pharmacy_users pu
    WHERE pu.pharmacy_id = p_pharmacy_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'Aktif'
      AND (
        pu.role IN ('Owner','Supervisor')
        OR pu.branch_id IS NULL
        OR p_branch_id IS NULL
        OR pu.branch_id = p_branch_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_access_branch_pair(p_pharmacy_id uuid, p_from_branch_id uuid, p_to_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pharmacy_users pu
    WHERE pu.pharmacy_id = p_pharmacy_id
      AND pu.user_id = auth.uid()
      AND pu.status = 'Aktif'
      AND (
        pu.role IN ('Owner','Supervisor')
        OR pu.branch_id IS NULL
        OR pu.branch_id = p_from_branch_id
        OR pu.branch_id = p_to_branch_id
      )
  );
$$;

DROP POLICY IF EXISTS p5_branch_inventory_select ON public.branch_inventory;
CREATE POLICY p5_branch_inventory_select ON public.branch_inventory
FOR SELECT
USING (private.can_access_branch(pharmacy_id, branch_id));

DROP POLICY IF EXISTS p4_stock_movements_select ON public.stock_movements;
DROP POLICY IF EXISTS p5_stock_movements_select_branch_scoped ON public.stock_movements;
CREATE POLICY p5_stock_movements_select_branch_scoped ON public.stock_movements
FOR SELECT
USING (private.can_access_branch(pharmacy_id, branch_id));

DROP POLICY IF EXISTS phm_select ON public.transactions;
DROP POLICY IF EXISTS p5_transactions_select_branch_scoped ON public.transactions;
CREATE POLICY p5_transactions_select_branch_scoped ON public.transactions
FOR SELECT
USING (private.can_access_branch(pharmacy_id, branch_id));

DROP POLICY IF EXISTS p5_branch_transfers_select ON public.branch_transfers;
CREATE POLICY p5_branch_transfers_select ON public.branch_transfers
FOR SELECT
USING (private.can_access_branch_pair(pharmacy_id, from_branch_id, to_branch_id));

DROP POLICY IF EXISTS p5_branch_transfer_items_select ON public.branch_transfer_items;
CREATE POLICY p5_branch_transfer_items_select ON public.branch_transfer_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.branch_transfers bt
    WHERE bt.id = branch_transfer_items.branch_transfer_id
      AND bt.pharmacy_id = branch_transfer_items.pharmacy_id
      AND private.can_access_branch_pair(bt.pharmacy_id, bt.from_branch_id, bt.to_branch_id)
  )
);

CREATE OR REPLACE VIEW public.my_branch_scope_view AS
SELECT
  pu.pharmacy_id,
  pu.branch_id,
  b.name AS branch_name,
  pu.role,
  CASE WHEN pu.role IN ('Owner','Supervisor') OR pu.branch_id IS NULL THEN true ELSE false END AS can_access_all_branches
FROM public.pharmacy_users pu
LEFT JOIN public.branches b ON b.id = pu.branch_id
WHERE pu.user_id = auth.uid()
  AND pu.status = 'Aktif';

GRANT SELECT ON public.my_branch_scope_view TO authenticated;

REVOKE ALL ON FUNCTION private.can_access_branch(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_access_branch_pair(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
