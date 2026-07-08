-- Phase P1.5.2 — Explicitly deny direct client writes on RPC-only document tables.
-- This makes the lockdown visible in pg_policies instead of relying only on absence of write policies.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions','transaction_items',
    'journal_entries','journal_entry_lines',
    'accounts_payable','accounts_payable_payments',
    'accounts_receivable','accounts_receivable_payments',
    'purchase_orders','purchase_order_items',
    'sales_returns','sales_return_items',
    'purchase_returns','purchase_return_items',
    'stock_opnames','stock_opname_items'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS p15_rpc_only_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS p15_rpc_only_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS p15_rpc_only_delete ON public.%I', t);

    EXECUTE format('CREATE POLICY p15_rpc_only_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY p15_rpc_only_update ON public.%I FOR UPDATE TO authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY p15_rpc_only_delete ON public.%I FOR DELETE TO authenticated USING (false)', t);
  END LOOP;
END $$;

COMMIT;
