-- Phase P2.4 — Atomic post_stock_opname RPC.
-- Full replayable SQL synced from live Supabase on 2026-07-08.

BEGIN;

DROP FUNCTION IF EXISTS public.post_stock_opname(uuid);

CREATE OR REPLACE FUNCTION public.post_stock_opname(p_stock_opname_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_opname record;
  v_item record;
  v_product record;
  v_pharmacy_id uuid;
  v_total_gain_value numeric := 0;
  v_total_loss_value numeric := 0;
  v_diff_value numeric;
  v_movement_type text;
  v_journal_id uuid := NULL;
  v_posted_items jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_opname
  FROM public.stock_opnames
  WHERE id = p_stock_opname_id
  FOR UPDATE;

  IF v_opname.id IS NULL THEN
    RAISE EXCEPTION 'Stock opname not found';
  END IF;

  v_pharmacy_id := v_opname.pharmacy_id;

  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Admin Stok','Supervisor','Owner']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to post stock opname';
  END IF;

  IF v_opname.status IN ('Posted','Selesai') THEN
    RETURN jsonb_build_object(
      'stock_opname_id', p_stock_opname_id,
      'status', v_opname.status,
      'idempotent_replay', true
    );
  END IF;

  IF v_opname.status NOT IN ('Draft','Dihitung','Menunggu Approval','Disetujui') THEN
    RAISE EXCEPTION 'Stock opname status cannot be posted: %', v_opname.status;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stock_opname_items
    WHERE pharmacy_id = v_pharmacy_id
      AND stock_opname_id = p_stock_opname_id
  ) THEN
    RAISE EXCEPTION 'Stock opname must contain at least one item';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_opname_items
    WHERE pharmacy_id = v_pharmacy_id
      AND stock_opname_id = p_stock_opname_id
      AND COALESCE(diff_qty,0) <> 0
      AND NULLIF(trim(COALESCE(reason,'')), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'All stock opname differences must have a reason';
  END IF;

  FOR v_item IN
    SELECT *
    FROM public.stock_opname_items
    WHERE pharmacy_id = v_pharmacy_id
      AND stock_opname_id = p_stock_opname_id
    ORDER BY created_at, id
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
      AND pharmacy_id = v_pharmacy_id
    FOR UPDATE;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found for stock opname item %', v_item.id;
    END IF;

    IF COALESCE(v_item.diff_qty,0) <> 0 THEN
      v_movement_type := CASE WHEN v_item.diff_qty > 0 THEN 'STOCK_OPNAME_GAIN' ELSE 'STOCK_OPNAME_LOSS' END;
      v_diff_value := abs(v_item.diff_qty) * COALESCE(v_product.cost, 0);

      IF v_item.diff_qty > 0 THEN
        v_total_gain_value := v_total_gain_value + v_diff_value;
      ELSE
        v_total_loss_value := v_total_loss_value + v_diff_value;
      END IF;

      INSERT INTO public.stock_movements (
        pharmacy_id, branch_id, product_id, batch_id, movement_type,
        qty_in, qty_out, balance_after, reference_type, reference_id, note, created_by
      ) VALUES (
        v_pharmacy_id, NULL, v_product.id, NULL, v_movement_type,
        CASE WHEN v_item.diff_qty > 0 THEN abs(v_item.diff_qty) ELSE 0 END,
        CASE WHEN v_item.diff_qty < 0 THEN abs(v_item.diff_qty) ELSE 0 END,
        v_item.physical_qty,
        'stock_opname', p_stock_opname_id,
        v_item.reason,
        v_user_id
      );
    END IF;

    UPDATE public.products
    SET stock = v_item.physical_qty,
        updated_at = now(),
        updated_by = v_user_id
    WHERE id = v_product.id
      AND pharmacy_id = v_pharmacy_id;

    v_posted_items := v_posted_items || jsonb_build_array(jsonb_build_object(
      'stock_opname_item_id', v_item.id,
      'product_id', v_product.id,
      'product_name', v_product.name,
      'system_qty', v_item.system_qty,
      'physical_qty', v_item.physical_qty,
      'diff_qty', v_item.diff_qty,
      'reason', v_item.reason,
      'cost', v_product.cost,
      'diff_value', abs(v_item.diff_qty) * COALESCE(v_product.cost,0)
    ));
  END LOOP;

  IF v_total_gain_value > 0 OR v_total_loss_value > 0 THEN
    v_journal_id := gen_random_uuid();
    INSERT INTO public.journal_entries (id, pharmacy_id, source_type, source_id, note, posted_at, created_by, updated_by)
    VALUES (v_journal_id, v_pharmacy_id, 'stock_opname', p_stock_opname_id::text, 'Auto journal stock opname adjustment ' || v_opname.code, now(), v_user_id, v_user_id);

    IF v_total_gain_value > 0 THEN
      INSERT INTO public.journal_entry_lines (pharmacy_id, journal_entry_id, account_code, debit, credit, created_by, updated_by)
      VALUES
        (v_pharmacy_id, v_journal_id, '1300', v_total_gain_value, 0, v_user_id, v_user_id),
        (v_pharmacy_id, v_journal_id, '6000', 0, v_total_gain_value, v_user_id, v_user_id);
    END IF;

    IF v_total_loss_value > 0 THEN
      INSERT INTO public.journal_entry_lines (pharmacy_id, journal_entry_id, account_code, debit, credit, created_by, updated_by)
      VALUES
        (v_pharmacy_id, v_journal_id, '6000', v_total_loss_value, 0, v_user_id, v_user_id),
        (v_pharmacy_id, v_journal_id, '1300', 0, v_total_loss_value, v_user_id, v_user_id);
    END IF;
  END IF;

  UPDATE public.stock_opnames
  SET status = 'Posted',
      posted_at = now(),
      posted_by = v_user_id,
      updated_at = now(),
      updated_by = v_user_id
  WHERE id = p_stock_opname_id
    AND pharmacy_id = v_pharmacy_id;

  PERFORM private.write_audit_log(
    v_pharmacy_id,
    NULL,
    'stock_opname',
    'post_stock_opname',
    'stock_opnames',
    p_stock_opname_id,
    to_jsonb(v_opname),
    jsonb_build_object(
      'stock_opname_id', p_stock_opname_id,
      'status', 'Posted',
      'total_gain_value', v_total_gain_value,
      'total_loss_value', v_total_loss_value,
      'journal_entry_id', v_journal_id,
      'items', v_posted_items
    ),
    p_stock_opname_id,
    'web'
  );

  RETURN jsonb_build_object(
    'stock_opname_id', p_stock_opname_id,
    'status', 'Posted',
    'posted_by', v_user_id,
    'posted_at', now(),
    'journal_entry_id', v_journal_id,
    'total_gain_value', v_total_gain_value,
    'total_loss_value', v_total_loss_value,
    'idempotent_replay', false,
    'items', v_posted_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_stock_opname(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_stock_opname(uuid) TO authenticated;

COMMIT;
