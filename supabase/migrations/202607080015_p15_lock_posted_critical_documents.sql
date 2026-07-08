-- Phase P1.5.3 — Lock posted/critical documents.
-- Critical documents must be changed through void/reversal/credit note/adjustment flows, not update/delete.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.critical_mutation_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(current_setting('app.apotekkilat_allow_critical_mutation', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION private.block_immutable_critical_documents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_status text;
BEGIN
  IF private.critical_mutation_allowed() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Always immutable after creation.
  IF TG_TABLE_NAME IN (
    'transactions',
    'transaction_items',
    'journal_entries',
    'journal_entry_lines',
    'accounts_payable_payments',
    'accounts_receivable_payments'
  ) THEN
    RAISE EXCEPTION '% is immutable. Use void, reversal, credit note, or adjustment document instead of %.', TG_TABLE_NAME, TG_OP;
  END IF;

  -- PO: draft can still be edited by RPC. Posted/non-draft PO cannot be updated/deleted.
  IF TG_TABLE_NAME IN ('purchase_orders', 'purchase_order_items') THEN
    IF TG_TABLE_NAME = 'purchase_orders' THEN
      v_status := COALESCE(OLD.status, '');
    ELSE
      SELECT COALESCE(po.status, '') INTO v_status
      FROM public.purchase_orders po
      WHERE po.id = OLD.purchase_order_id;
    END IF;

    IF v_status <> 'Draft' THEN
      RAISE EXCEPTION 'Posted purchase order is immutable. Use reversal or adjustment document instead of %.', TG_OP;
    END IF;
  END IF;

  -- Completed returns cannot be changed.
  IF TG_TABLE_NAME IN ('sales_returns', 'sales_return_items') THEN
    IF TG_TABLE_NAME = 'sales_returns' THEN
      v_status := COALESCE(OLD.status, '');
    ELSE
      SELECT COALESCE(sr.status, '') INTO v_status
      FROM public.sales_returns sr
      WHERE sr.id = OLD.sales_return_id;
    END IF;

    IF v_status = 'Selesai' THEN
      RAISE EXCEPTION 'Completed sales return is immutable. Use reversal or credit note instead of %.', TG_OP;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('purchase_returns', 'purchase_return_items') THEN
    IF TG_TABLE_NAME = 'purchase_returns' THEN
      v_status := COALESCE(OLD.status, '');
    ELSE
      SELECT COALESCE(pr.status, '') INTO v_status
      FROM public.purchase_returns pr
      WHERE pr.id = OLD.purchase_return_id;
    END IF;

    IF v_status = 'Selesai' THEN
      RAISE EXCEPTION 'Completed purchase return is immutable. Use reversal or adjustment document instead of %.', TG_OP;
    END IF;
  END IF;

  -- Posted/completed stock opname cannot be changed.
  IF TG_TABLE_NAME IN ('stock_opnames', 'stock_opname_items') THEN
    IF TG_TABLE_NAME = 'stock_opnames' THEN
      v_status := COALESCE(OLD.status, '');
    ELSE
      SELECT COALESCE(so.status, '') INTO v_status
      FROM public.stock_opnames so
      WHERE so.id = OLD.stock_opname_id;
    END IF;

    IF v_status IN ('Selesai', 'Posted') THEN
      RAISE EXCEPTION 'Posted stock opname is immutable. Use adjustment document instead of %.', TG_OP;
    END IF;
  END IF;

  -- AP/AR principal documents can be closed/paid by RPC before P2/P3 final, but cannot be deleted once created.
  IF TG_TABLE_NAME IN ('accounts_payable', 'accounts_receivable') AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% cannot be deleted. Use payment, reversal, or adjustment document instead.', TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

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
    EXECUTE format('DROP TRIGGER IF EXISTS trg_p15_block_immutable_critical_documents ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_p15_block_immutable_critical_documents BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.block_immutable_critical_documents()',
      t
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION private.critical_mutation_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.block_immutable_critical_documents() FROM PUBLIC, anon, authenticated;

COMMIT;
