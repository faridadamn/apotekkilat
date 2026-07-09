-- Minor audit fixes
-- 3.2 Performance Advisor: avoid re-evaluating auth.uid() per row in selected RLS policies.
-- 3.3 Defense-in-depth: ensure create_purchase_order upsert updates only same-pharmacy rows.

-- 3.2: Recreate pharmacy_users owner policies with (select auth.uid()).
-- The DO block is defensive because policy definitions may differ between environments.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pharmacy_users'
      and policyname = 'pharmacy_users_owner_select'
  ) then
    drop policy if exists pharmacy_users_owner_select on public.pharmacy_users;
    create policy pharmacy_users_owner_select
      on public.pharmacy_users
      for select
      using (
        user_id = (select auth.uid())
        or exists (
          select 1
          from public.pharmacy_users owner_membership
          where owner_membership.pharmacy_id = pharmacy_users.pharmacy_id
            and owner_membership.user_id = (select auth.uid())
            and owner_membership.role = 'Owner'
            and owner_membership.status = 'Aktif'
        )
      );
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pharmacy_users'
      and policyname = 'pharmacy_users_owner_insert'
  ) then
    drop policy if exists pharmacy_users_owner_insert on public.pharmacy_users;
    create policy pharmacy_users_owner_insert
      on public.pharmacy_users
      for insert
      with check (
        exists (
          select 1
          from public.pharmacy_users owner_membership
          where owner_membership.pharmacy_id = pharmacy_users.pharmacy_id
            and owner_membership.user_id = (select auth.uid())
            and owner_membership.role = 'Owner'
            and owner_membership.status = 'Aktif'
        )
      );
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'pharmacy_users'
      and policyname = 'pharmacy_users_owner_update'
  ) then
    drop policy if exists pharmacy_users_owner_update on public.pharmacy_users;
    create policy pharmacy_users_owner_update
      on public.pharmacy_users
      for update
      using (
        exists (
          select 1
          from public.pharmacy_users owner_membership
          where owner_membership.pharmacy_id = pharmacy_users.pharmacy_id
            and owner_membership.user_id = (select auth.uid())
            and owner_membership.role = 'Owner'
            and owner_membership.status = 'Aktif'
        )
      )
      with check (
        exists (
          select 1
          from public.pharmacy_users owner_membership
          where owner_membership.pharmacy_id = pharmacy_users.pharmacy_id
            and owner_membership.user_id = (select auth.uid())
            and owner_membership.role = 'Owner'
            and owner_membership.status = 'Aktif'
        )
      );
  end if;
end $$;

-- 3.3: Patch create_purchase_order() only if the function exists with the expected jsonb signature.
-- This body intentionally preserves the expected RPC contract used by the browser:
--   create_purchase_order({ p_payload: jsonb })
-- and adds the defense-in-depth WHERE clause on the ON CONFLICT update path.
do $$
declare
  fn_exists boolean;
begin
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_purchase_order'
      and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb'
  ) into fn_exists;

  if fn_exists then
    execute $fn$
    create or replace function public.create_purchase_order(p_payload jsonb)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      v_user_id uuid := auth.uid();
      v_pharmacy_id uuid;
      v_po_id uuid;
      v_supplier_id uuid;
      v_code text;
      v_status text;
      v_value numeric := 0;
      v_item jsonb;
      v_item_id uuid;
      v_qty numeric;
      v_cost numeric;
    begin
      if v_user_id is null then
        raise exception 'Authentication required';
      end if;

      v_po_id := coalesce(nullif(p_payload->>'id', '')::uuid, gen_random_uuid());
      v_supplier_id := nullif(p_payload->>'supplier_id', '')::uuid;
      v_code := coalesce(nullif(p_payload->>'code', ''), 'PO-' || to_char(now(), 'YYYYMMDDHH24MISS'));
      v_status := coalesce(nullif(p_payload->>'status', ''), 'Draft');

      select pu.pharmacy_id
      into v_pharmacy_id
      from public.pharmacy_users pu
      where pu.user_id = v_user_id
        and pu.status = 'Aktif'
      limit 1;

      if v_pharmacy_id is null then
        raise exception 'Active pharmacy membership is required';
      end if;

      for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
        v_qty := coalesce(nullif(v_item->>'qty', '')::numeric, 0);
        v_cost := coalesce(nullif(v_item->>'cost', '')::numeric, 0);
        v_value := v_value + (v_qty * v_cost);
      end loop;

      if (p_payload ? 'value') then
        v_value := coalesce(nullif(p_payload->>'value', '')::numeric, v_value);
      end if;

      insert into public.purchase_orders (
        id,
        pharmacy_id,
        supplier_id,
        supplier_name,
        code,
        note,
        value,
        status,
        ordered_at,
        updated_at
      ) values (
        v_po_id,
        v_pharmacy_id,
        v_supplier_id,
        nullif(p_payload->>'supplier_name', ''),
        v_code,
        nullif(p_payload->>'note', ''),
        v_value,
        v_status,
        coalesce(nullif(p_payload->>'ordered_at', '')::timestamptz, now()),
        now()
      )
      on conflict (id) do update
      set supplier_id = excluded.supplier_id,
          supplier_name = excluded.supplier_name,
          code = excluded.code,
          note = excluded.note,
          value = excluded.value,
          status = excluded.status,
          ordered_at = excluded.ordered_at,
          updated_at = now()
      where purchase_orders.pharmacy_id = excluded.pharmacy_id;

      delete from public.purchase_order_items
      where purchase_order_id = v_po_id
        and pharmacy_id = v_pharmacy_id;

      for v_item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
        v_item_id := coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid());
        insert into public.purchase_order_items (
          id,
          pharmacy_id,
          purchase_order_id,
          product_id,
          qty,
          display_qty,
          unit_code,
          unit_label,
          cost,
          expired_at
        ) values (
          v_item_id,
          v_pharmacy_id,
          v_po_id,
          nullif(v_item->>'product_id', '')::uuid,
          coalesce(nullif(v_item->>'qty', '')::numeric, 0),
          coalesce(nullif(v_item->>'display_qty', '')::numeric, nullif(v_item->>'qty', '')::numeric, 0),
          nullif(v_item->>'unit_code', ''),
          nullif(v_item->>'unit_label', ''),
          coalesce(nullif(v_item->>'cost', '')::numeric, 0),
          nullif(v_item->>'expired_at', '')::date
        );
      end loop;

      return jsonb_build_object(
        'id', v_po_id,
        'pharmacy_id', v_pharmacy_id,
        'code', v_code,
        'value', v_value,
        'status', v_status
      );
    end;
    $body$
    $fn$;
  end if;
end $$;

comment on function public.create_purchase_order(jsonb) is
  'Creates or updates a purchase order for the active pharmacy. ON CONFLICT update path includes purchase_orders.pharmacy_id = excluded.pharmacy_id defense-in-depth guard.';
