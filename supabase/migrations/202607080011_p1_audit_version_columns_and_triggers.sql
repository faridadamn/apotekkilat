-- Phase P1.4.3: audit columns and optimistic concurrency versioning.
-- Adds/normalizes: created_at, created_by, updated_at, updated_by, version.
-- The trigger increments version after every successful UPDATE.

CREATE OR REPLACE FUNCTION private.set_audit_version_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
    IF NEW.updated_at IS NULL THEN NEW.updated_at := now(); END IF;
    IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
    IF NEW.updated_by IS NULL THEN NEW.updated_by := auth.uid(); END IF;
    IF NEW.version IS NULL OR NEW.version < 1 THEN NEW.version := 1; END IF;
    RETURN NEW;
  END IF;

  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  NEW.version := COALESCE(OLD.version, 1) + 1;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pharmacies','pharmacy_settings','branches','pharmacy_users','suppliers','products','product_uoms','product_batches','customers',
    'transactions','transaction_items','prescriptions','prescription_items','purchase_orders','purchase_order_items','conversations','conversation_messages',
    'stock_opnames','stock_opname_items','purchase_returns','purchase_return_items','sales_returns','sales_return_items','accounts_payable','accounts_payable_payments',
    'accounts_receivable','accounts_receivable_payments','chart_of_accounts','journal_entries','journal_entry_lines','price_lists','price_list_customers','price_list_rules'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1', t);
    EXECUTE format('UPDATE public.%I SET version = 1 WHERE version IS NULL OR version < 1', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_audit_version ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_audit_version BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_audit_version_fields()', t, t);
  END LOOP;
END $$;
