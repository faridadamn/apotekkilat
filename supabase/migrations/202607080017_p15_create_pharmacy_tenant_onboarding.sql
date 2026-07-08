-- Phase P1.5.5 — Secure first-tenant onboarding.
-- Browser uses authenticated user token only; no service role key is required in client.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION public.create_pharmacy_tenant(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_pharmacy_id uuid := gen_random_uuid();
  v_branch_id uuid := gen_random_uuid();
  v_pharmacy_name text := NULLIF(trim(COALESCE(p_payload->>'pharmacy_name', p_payload->>'name', '')), '');
  v_address text := NULLIF(trim(COALESCE(p_payload->>'address', '')), '');
  v_whatsapp text := NULLIF(trim(COALESCE(p_payload->>'whatsapp', '')), '');
  v_branch_name text := NULLIF(trim(COALESCE(p_payload->>'branch_name', '')), '');
  v_owner_name text := NULLIF(trim(COALESCE(p_payload->>'owner_name', p_payload->>'full_name', '')), '');
  v_seed_coa boolean := COALESCE((p_payload->>'seed_chart_of_accounts')::boolean, true);
  v_membership_exists boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_pharmacy_name IS NULL OR length(v_pharmacy_name) < 3 THEN
    RAISE EXCEPTION 'pharmacy_name is required and must be at least 3 characters';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_users
    WHERE user_id = v_user_id
      AND status = 'Aktif'
  ) INTO v_membership_exists;

  IF v_membership_exists THEN
    RAISE EXCEPTION 'User already has an active pharmacy membership';
  END IF;

  v_branch_name := COALESCE(v_branch_name, v_pharmacy_name || ' Pusat');
  v_owner_name := COALESCE(v_owner_name, 'Owner');

  INSERT INTO public.pharmacies (id, name, address, whatsapp, owner_user_id, created_by, updated_by)
  VALUES (v_pharmacy_id, v_pharmacy_name, v_address, v_whatsapp, v_user_id, v_user_id, v_user_id);

  INSERT INTO public.branches (id, pharmacy_id, name, address, is_main, created_by, updated_by)
  VALUES (v_branch_id, v_pharmacy_id, v_branch_name, v_address, true, v_user_id, v_user_id);

  INSERT INTO public.pharmacy_settings (
    pharmacy_id, notif_low_stock, notif_expiry, notif_daily_summary, knowledge_snapshot, created_by, updated_by
  ) VALUES (
    v_pharmacy_id,
    COALESCE((p_payload->>'notif_low_stock')::boolean, true),
    COALESCE((p_payload->>'notif_expiry')::boolean, true),
    COALESCE((p_payload->>'notif_daily_summary')::boolean, false),
    jsonb_build_object(
      'version', 1,
      'created_by', 'create_pharmacy_tenant',
      'pharmacy_name', v_pharmacy_name,
      'default_policy', 'AI draft must be reviewed by admin before sending or executing sensitive actions'
    ),
    v_user_id,
    v_user_id
  );

  INSERT INTO public.pharmacy_users (
    pharmacy_id, user_id, branch_id, full_name, role, status, created_by, updated_by
  ) VALUES (
    v_pharmacy_id, v_user_id, v_branch_id, v_owner_name, 'Owner', 'Aktif', v_user_id, v_user_id
  );

  IF v_seed_coa THEN
    INSERT INTO public.chart_of_accounts (pharmacy_id, code, name, class, created_by, updated_by)
    VALUES
      (v_pharmacy_id, '1000', 'Kas', 'Asset', v_user_id, v_user_id),
      (v_pharmacy_id, '1100', 'Bank', 'Asset', v_user_id, v_user_id),
      (v_pharmacy_id, '1200', 'Piutang Usaha', 'Asset', v_user_id, v_user_id),
      (v_pharmacy_id, '1300', 'Persediaan Obat', 'Asset', v_user_id, v_user_id),
      (v_pharmacy_id, '2000', 'Utang Usaha', 'Liability', v_user_id, v_user_id),
      (v_pharmacy_id, '3000', 'Modal Pemilik', 'Equity', v_user_id, v_user_id),
      (v_pharmacy_id, '4000', 'Penjualan Obat', 'Revenue', v_user_id, v_user_id),
      (v_pharmacy_id, '5000', 'Harga Pokok Penjualan', 'Expense', v_user_id, v_user_id),
      (v_pharmacy_id, '6000', 'Beban Operasional', 'Expense', v_user_id, v_user_id);
  END IF;

  PERFORM private.write_audit_log(
    v_pharmacy_id,
    v_branch_id,
    'tenant_onboarding',
    'create_pharmacy_tenant',
    'pharmacies',
    v_pharmacy_id,
    NULL,
    jsonb_build_object(
      'pharmacy_id', v_pharmacy_id,
      'branch_id', v_branch_id,
      'owner_user_id', v_user_id,
      'seed_chart_of_accounts', v_seed_coa
    ),
    v_pharmacy_id,
    'web'
  );

  RETURN jsonb_build_object(
    'pharmacy_id', v_pharmacy_id,
    'branch_id', v_branch_id,
    'role', 'Owner',
    'status', 'Aktif'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_pharmacy_tenant(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pharmacy_tenant(jsonb) TO authenticated;

COMMIT;
