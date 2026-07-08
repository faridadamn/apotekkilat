-- Lock P1 workflow RPCs to authenticated users only.
REVOKE EXECUTE ON FUNCTION public.create_purchase_order(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.checkout_transaction(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_return(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_stock_opname(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_purchase_order(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_transaction(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_return(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_stock_opname(uuid) TO authenticated;
