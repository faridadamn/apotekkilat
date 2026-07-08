-- Phase P1.5.6 — AP/AR/GL cloud connection foundation.
-- Minimal read/write through Supabase/RPC; sensitive direct writes remain denied.
-- Payment and journal posting are routed to RPC foundations and will be fully expanded in P2/P3.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_accounts_payable(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_amount numeric := COALESCE((p_payload->>'amount')::numeric, 0);
BEGIN
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Purchasing']::text[]) THEN RAISE EXCEPTION 'Not allowed to create accounts payable'; END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'amount must be greater than zero'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounts_payable WHERE id = v_id AND pharmacy_id <> v_pharmacy_id) THEN RAISE EXCEPTION 'Tenant collision detected for accounts payable id'; END IF;

  INSERT INTO public.accounts_payable (id, pharmacy_id, supplier_id, purchase_order_id, amount, adjusted_amount, paid_amount, due_date, status, created_by, updated_by)
  VALUES (v_id, v_pharmacy_id, NULLIF(p_payload->>'supplier_id','')::uuid, NULLIF(p_payload->>'purchase_order_id','')::uuid, v_amount, COALESCE((p_payload->>'adjusted_amount')::numeric, 0), 0, NULLIF(p_payload->>'due_date','')::date, 'Open', auth.uid(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET supplier_id = excluded.supplier_id, purchase_order_id = excluded.purchase_order_id, amount = excluded.amount, adjusted_amount = excluded.adjusted_amount, due_date = excluded.due_date, updated_at = now(), updated_by = auth.uid()
  WHERE public.accounts_payable.pharmacy_id = v_pharmacy_id AND public.accounts_payable.status = 'Open' AND COALESCE(public.accounts_payable.paid_amount,0) = 0;
  PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'finance', 'upsert_accounts_payable', 'accounts_payable', v_id, NULL, p_payload, v_id, 'web');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_accounts_receivable(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_amount numeric := COALESCE((p_payload->>'amount')::numeric, 0);
BEGIN
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Kasir']::text[]) THEN RAISE EXCEPTION 'Not allowed to create accounts receivable'; END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'amount must be greater than zero'; END IF;
  IF EXISTS (SELECT 1 FROM public.accounts_receivable WHERE id = v_id AND pharmacy_id <> v_pharmacy_id) THEN RAISE EXCEPTION 'Tenant collision detected for accounts receivable id'; END IF;

  INSERT INTO public.accounts_receivable (id, pharmacy_id, customer_id, transaction_id, amount, paid_amount, due_date, status, created_by, updated_by)
  VALUES (v_id, v_pharmacy_id, NULLIF(p_payload->>'customer_id','')::uuid, NULLIF(p_payload->>'transaction_id','')::uuid, v_amount, 0, NULLIF(p_payload->>'due_date','')::date, 'Open', auth.uid(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET customer_id = excluded.customer_id, transaction_id = excluded.transaction_id, amount = excluded.amount, due_date = excluded.due_date, updated_at = now(), updated_by = auth.uid()
  WHERE public.accounts_receivable.pharmacy_id = v_pharmacy_id AND public.accounts_receivable.status = 'Open' AND COALESCE(public.accounts_receivable.paid_amount,0) = 0;
  PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'finance', 'upsert_accounts_receivable', 'accounts_receivable', v_id, NULL, p_payload, v_id, 'web');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payable_payment(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_payable_id uuid := NULLIF(p_payload->>'payable_id','')::uuid;
  v_payment_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_amount numeric := COALESCE((p_payload->>'amount')::numeric, 0);
  v_ap record;
  v_new_paid numeric;
  v_due numeric;
BEGIN
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor']::text[]) THEN RAISE EXCEPTION 'Not allowed to record payable payment'; END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'payment amount must be greater than zero'; END IF;
  SELECT * INTO v_ap FROM public.accounts_payable WHERE id = v_payable_id AND pharmacy_id = v_pharmacy_id FOR UPDATE;
  IF v_ap.id IS NULL THEN RAISE EXCEPTION 'accounts payable not found'; END IF;
  IF v_ap.status IN ('Paid','Void','Cancelled') THEN RAISE EXCEPTION 'accounts payable is not payable: %', v_ap.status; END IF;
  v_due := COALESCE(v_ap.adjusted_amount, v_ap.amount) - COALESCE(v_ap.paid_amount,0);
  IF v_amount > v_due THEN RAISE EXCEPTION 'payment exceeds payable balance'; END IF;
  v_new_paid := COALESCE(v_ap.paid_amount,0) + v_amount;
  INSERT INTO public.accounts_payable_payments (id, pharmacy_id, payable_id, paid_at, amount, method, created_by, updated_by)
  VALUES (v_payment_id, v_pharmacy_id, v_payable_id, COALESCE((p_payload->>'paid_at')::timestamptz, now()), v_amount, COALESCE(NULLIF(p_payload->>'method',''), 'Tunai'), auth.uid(), auth.uid());
  UPDATE public.accounts_payable SET paid_amount = v_new_paid, status = CASE WHEN v_new_paid >= COALESCE(adjusted_amount, amount) THEN 'Paid' ELSE 'Partial' END, updated_at = now(), updated_by = auth.uid() WHERE id = v_payable_id AND pharmacy_id = v_pharmacy_id;
  PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'finance', 'record_payable_payment', 'accounts_payable_payments', v_payment_id, to_jsonb(v_ap), p_payload, v_payment_id, 'web');
  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_receivable_payment(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_receivable_id uuid := NULLIF(p_payload->>'receivable_id','')::uuid;
  v_payment_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_amount numeric := COALESCE((p_payload->>'amount')::numeric, 0);
  v_ar record;
  v_new_paid numeric;
  v_due numeric;
BEGIN
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Kasir']::text[]) THEN RAISE EXCEPTION 'Not allowed to record receivable payment'; END IF;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'payment amount must be greater than zero'; END IF;
  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id = v_receivable_id AND pharmacy_id = v_pharmacy_id FOR UPDATE;
  IF v_ar.id IS NULL THEN RAISE EXCEPTION 'accounts receivable not found'; END IF;
  IF v_ar.status IN ('Paid','Void','Cancelled') THEN RAISE EXCEPTION 'accounts receivable is not payable: %', v_ar.status; END IF;
  v_due := COALESCE(v_ar.amount,0) - COALESCE(v_ar.paid_amount,0);
  IF v_amount > v_due THEN RAISE EXCEPTION 'payment exceeds receivable balance'; END IF;
  v_new_paid := COALESCE(v_ar.paid_amount,0) + v_amount;
  INSERT INTO public.accounts_receivable_payments (id, pharmacy_id, receivable_id, paid_at, amount, method, created_by, updated_by)
  VALUES (v_payment_id, v_pharmacy_id, v_receivable_id, COALESCE((p_payload->>'paid_at')::timestamptz, now()), v_amount, COALESCE(NULLIF(p_payload->>'method',''), 'Tunai'), auth.uid(), auth.uid());
  UPDATE public.accounts_receivable SET paid_amount = v_new_paid, status = CASE WHEN v_new_paid >= amount THEN 'Paid' ELSE 'Partial' END, updated_at = now(), updated_by = auth.uid() WHERE id = v_receivable_id AND pharmacy_id = v_pharmacy_id;
  PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'finance', 'record_receivable_payment', 'accounts_receivable_payments', v_payment_id, to_jsonb(v_ar), p_payload, v_payment_id, 'web');
  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_journal_entry(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid := (p_payload->>'pharmacy_id')::uuid;
  v_journal_id uuid := COALESCE(NULLIF(p_payload->>'id','')::uuid, gen_random_uuid());
  v_line jsonb;
  v_debit numeric := 0;
  v_credit numeric := 0;
BEGIN
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'pharmacy_id is required'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor']::text[]) THEN RAISE EXCEPTION 'Not allowed to post journal entry'; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE id = v_journal_id) THEN RAISE EXCEPTION 'journal entry is immutable or already exists'; END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'lines','[]'::jsonb)) LOOP
    v_debit := v_debit + COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := v_credit + COALESCE((v_line->>'credit')::numeric, 0);
  END LOOP;
  IF v_debit <= 0 OR v_debit <> v_credit THEN RAISE EXCEPTION 'journal entry must be balanced'; END IF;
  INSERT INTO public.journal_entries (id, pharmacy_id, source_type, source_id, note, posted_at, created_by, updated_by)
  VALUES (v_journal_id, v_pharmacy_id, NULLIF(p_payload->>'source_type',''), NULLIF(p_payload->>'source_id',''), NULLIF(p_payload->>'note',''), COALESCE((p_payload->>'posted_at')::timestamptz, now()), auth.uid(), auth.uid());
  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'lines','[]'::jsonb)) LOOP
    INSERT INTO public.journal_entry_lines (id, pharmacy_id, journal_entry_id, account_code, debit, credit, created_by, updated_by)
    VALUES (COALESCE(NULLIF(v_line->>'id','')::uuid, gen_random_uuid()), v_pharmacy_id, v_journal_id, NULLIF(v_line->>'account_code',''), COALESCE((v_line->>'debit')::numeric, 0), COALESCE((v_line->>'credit')::numeric, 0), auth.uid(), auth.uid());
  END LOOP;
  PERFORM private.write_audit_log(v_pharmacy_id, NULL, 'finance', 'post_journal_entry', 'journal_entries', v_journal_id, NULL, p_payload, v_journal_id, 'web');
  RETURN v_journal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_accounts_payable(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_accounts_receivable(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_payable_payment(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_receivable_payment(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_journal_entry(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_accounts_payable(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_accounts_receivable(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payable_payment(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_receivable_payment(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(jsonb) TO authenticated;

COMMIT;
