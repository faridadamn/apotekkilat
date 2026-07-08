-- Align stock opname RPC status with current UI terminology.
CREATE OR REPLACE FUNCTION public.post_stock_opname(p_stock_opname_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pharmacy_id uuid;
  v_item record;
BEGIN
  SELECT pharmacy_id INTO v_pharmacy_id FROM public.stock_opnames WHERE id = p_stock_opname_id;
  IF v_pharmacy_id IS NULL THEN RAISE EXCEPTION 'Stock opname not found'; END IF;
  IF NOT private.has_pharmacy_role(v_pharmacy_id, ARRAY['Owner','Supervisor','Admin Stok']::text[]) THEN
    RAISE EXCEPTION 'Not allowed to post stock opname';
  END IF;

  FOR v_item IN SELECT product_id, physical_qty FROM public.stock_opname_items WHERE stock_opname_id = p_stock_opname_id LOOP
    UPDATE public.products
    SET stock = COALESCE(v_item.physical_qty, stock), updated_at = now()
    WHERE id = v_item.product_id AND pharmacy_id = v_pharmacy_id;
  END LOOP;

  UPDATE public.stock_opnames
  SET status = 'Selesai', updated_at = now()
  WHERE id = p_stock_opname_id;

  RETURN p_stock_opname_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.post_stock_opname(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_stock_opname(uuid) TO authenticated;
