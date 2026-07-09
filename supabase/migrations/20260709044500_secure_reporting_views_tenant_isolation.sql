-- Security blocker: tenant-isolate reporting views and force SECURITY INVOKER.
-- Reporting views in public schema must not bypass table RLS or leak cross-tenant rows via PostgREST.

create schema if not exists private;

create or replace function private.current_pharmacy_id()
returns uuid
language sql
stable
security definer
set search_path = public, private
as $$
  select pu.pharmacy_id
  from public.pharmacy_users pu
  where pu.user_id = (select auth.uid())
    and pu.status = 'Aktif'
  order by case when pu.role = 'Owner' then 0 else 1 end, pu.created_at nulls last
  limit 1
$$;

revoke all on function private.current_pharmacy_id() from public;
grant usage on schema private to authenticated;
grant execute on function private.current_pharmacy_id() to authenticated;

create or replace view public.branch_inventory_view
with (security_invoker = true)
as
select
  bi.id,
  bi.pharmacy_id,
  bi.branch_id,
  b.name as branch_name,
  bi.product_id,
  p.name as product_name,
  p.base_unit,
  bi.batch_id,
  pb.batch_no,
  pb.expired_at,
  pb.status as batch_status,
  bi.sellable_qty,
  bi.quarantine_qty,
  bi.reorder_point,
  case when bi.reorder_point is not null and bi.sellable_qty <= bi.reorder_point then true else false end as below_reorder_point,
  bi.updated_at
from public.branch_inventory bi
join public.branches b on b.id = bi.branch_id and b.pharmacy_id = bi.pharmacy_id
join public.products p on p.id = bi.product_id and p.pharmacy_id = bi.pharmacy_id
left join public.product_batches pb on pb.id = bi.batch_id and pb.pharmacy_id = bi.pharmacy_id
where bi.pharmacy_id = private.current_pharmacy_id();

create or replace view public.branch_stock_summary_view
with (security_invoker = true)
as
select
  bi.pharmacy_id,
  bi.branch_id,
  b.name as branch_name,
  bi.product_id,
  p.name as product_name,
  p.base_unit,
  sum(bi.sellable_qty) as sellable_qty,
  sum(bi.quarantine_qty) as quarantine_qty,
  sum(coalesce(bi.sellable_qty, 0) + coalesce(bi.quarantine_qty, 0)) as total_branch_qty,
  min(bi.reorder_point) filter (where bi.reorder_point is not null) as reorder_point
from public.branch_inventory bi
join public.branches b on b.id = bi.branch_id and b.pharmacy_id = bi.pharmacy_id
join public.products p on p.id = bi.product_id and p.pharmacy_id = bi.pharmacy_id
where bi.pharmacy_id = private.current_pharmacy_id()
group by bi.pharmacy_id, bi.branch_id, b.name, bi.product_id, p.name, p.base_unit;

create or replace view public.expired_sellable_batches_view
with (security_invoker = true)
as
select
  id,
  pharmacy_id,
  product_id,
  batch_no,
  received_at,
  expired_at,
  qty,
  location,
  created_at,
  updated_at,
  created_by,
  updated_by,
  version,
  status
from public.product_batches
where pharmacy_id = private.current_pharmacy_id()
  and status = 'SELLABLE'
  and expired_at is not null
  and expired_at < current_date
  and qty > 0;

create or replace view public.expiring_batches_report_view
with (security_invoker = true)
as
select
  pb.id as batch_id,
  pb.pharmacy_id,
  pb.product_id,
  p.name as product_name,
  pb.batch_no,
  pb.qty,
  pb.status,
  pb.location,
  pb.received_at,
  pb.expired_at,
  case when pb.expired_at is null then null::integer else pb.expired_at - current_date end as days_to_expiry
from public.product_batches pb
join public.products p on p.id = pb.product_id and p.pharmacy_id = pb.pharmacy_id
where pb.pharmacy_id = private.current_pharmacy_id()
  and pb.qty > 0
  and pb.status = any (array['SELLABLE'::text, 'QUARANTINE'::text])
  and pb.expired_at is not null
order by pb.expired_at, pb.received_at, pb.id;

create or replace view public.fefo_available_batches_view
with (security_invoker = true)
as
select
  pb.id,
  pb.pharmacy_id,
  pb.product_id,
  p.name as product_name,
  pb.batch_no,
  pb.received_at,
  pb.expired_at,
  pb.qty,
  pb.location,
  pb.status,
  row_number() over (partition by pb.pharmacy_id, pb.product_id order by pb.expired_at asc nulls last, pb.received_at, pb.id) as fefo_rank
from public.product_batches pb
join public.products p on p.id = pb.product_id and p.pharmacy_id = pb.pharmacy_id
where pb.pharmacy_id = private.current_pharmacy_id()
  and pb.qty > 0
  and pb.status = 'SELLABLE'
  and (pb.expired_at is null or pb.expired_at >= current_date);

create or replace view public.my_branch_scope_view
with (security_invoker = true)
as
select
  pu.pharmacy_id,
  pu.branch_id,
  b.name as branch_name,
  pu.role,
  case when pu.role = any (array['Owner'::text, 'Supervisor'::text]) or pu.branch_id is null then true else false end as can_access_all_branches
from public.pharmacy_users pu
left join public.branches b on b.id = pu.branch_id and b.pharmacy_id = pu.pharmacy_id
where pu.user_id = (select auth.uid())
  and pu.status = 'Aktif';

create or replace view public.open_integrity_alerts_view
with (security_invoker = true)
as
select
  id,
  pharmacy_id,
  branch_id,
  alert_type,
  severity,
  entity_type,
  entity_id,
  message,
  details,
  status,
  first_seen_at,
  last_seen_at,
  resolved_at,
  created_by
from public.integrity_alerts
where pharmacy_id = private.current_pharmacy_id()
  and status = 'Open'
order by severity desc, last_seen_at desc;

create or replace view public.product_stock_summary_view
with (security_invoker = true)
as
select
  p.id as product_id,
  p.pharmacy_id,
  p.name as product_name,
  p.base_unit,
  coalesce(sum(pb.qty) filter (where pb.status = 'SELLABLE' and (pb.expired_at is null or pb.expired_at >= current_date)), 0) as stock_available,
  coalesce(sum(pb.qty) filter (where pb.status = 'QUARANTINE'), 0) as stock_quarantine,
  coalesce(sum(pb.qty) filter (where pb.status = 'DAMAGED'), 0) as stock_damaged,
  coalesce(sum(pb.qty) filter (where pb.status = 'EXPIRED' or (pb.expired_at is not null and pb.expired_at < current_date)), 0) as stock_expired,
  coalesce(sum(pb.qty) filter (where pb.status = 'RETURN_TO_VENDOR'), 0) as stock_return_to_vendor,
  coalesce(sum(pb.qty), 0) as stock_total_batch,
  p.stock as stock_cached,
  coalesce(sum(pb.qty) filter (where pb.status = 'SELLABLE' and (pb.expired_at is null or pb.expired_at >= current_date)), 0) - coalesce(p.stock, 0) as stock_cache_diff
from public.products p
left join public.product_batches pb on pb.product_id = p.id and pb.pharmacy_id = p.pharmacy_id
where p.pharmacy_id = private.current_pharmacy_id()
group by p.id, p.pharmacy_id, p.name, p.base_unit, p.stock;

create or replace view public.stock_ledger_view
with (security_invoker = true)
as
select
  sm.id,
  sm.pharmacy_id,
  sm.branch_id,
  b.name as branch_name,
  sm.product_id,
  p.name as product_name,
  p.base_unit,
  sm.batch_id,
  pb.batch_no,
  pb.expired_at,
  pb.status as batch_status,
  sm.movement_type,
  sm.qty_in,
  sm.qty_out,
  sm.qty_in - sm.qty_out as qty_net,
  sm.balance_after,
  sm.reference_type,
  sm.reference_id,
  sm.note,
  sm.created_by,
  sm.created_at
from public.stock_movements sm
join public.products p on p.id = sm.product_id and p.pharmacy_id = sm.pharmacy_id
left join public.branches b on b.id = sm.branch_id and b.pharmacy_id = sm.pharmacy_id
left join public.product_batches pb on pb.id = sm.batch_id and pb.pharmacy_id = sm.pharmacy_id
where sm.pharmacy_id = private.current_pharmacy_id();

create or replace view public.stock_reconciliation_view
with (security_invoker = true)
as
select
  s.product_id,
  s.pharmacy_id,
  s.product_name,
  s.base_unit,
  s.stock_available,
  s.stock_quarantine,
  s.stock_damaged,
  s.stock_expired,
  s.stock_return_to_vendor,
  s.stock_total_batch,
  s.stock_cached,
  s.stock_cache_diff,
  case when s.stock_cache_diff = 0 then 'MATCH'::text else 'DIFF'::text end as reconciliation_status
from public.product_stock_summary_view s
where s.pharmacy_id = private.current_pharmacy_id();

create or replace view public.transactions_without_journal_view
with (security_invoker = true)
as
select
  t.id,
  t.pharmacy_id,
  t.branch_id,
  t.customer_id,
  t.code,
  t.subtotal,
  t.tax,
  t.total,
  t.payment_method,
  t.status,
  t.happened_at,
  t.created_at,
  t.updated_at,
  t.prescription_id,
  t.price_list_ids,
  t.created_by,
  t.updated_by,
  t.version,
  t.idempotency_key
from public.transactions t
left join public.journal_entries je on je.source_type = 'transaction' and je.source_id = t.id::text and je.pharmacy_id = t.pharmacy_id
where t.pharmacy_id = private.current_pharmacy_id()
  and t.status = 'Selesai'
  and je.id is null;

create or replace view public.unbalanced_journals_view
with (security_invoker = true)
as
select
  je.id as journal_entry_id,
  je.pharmacy_id,
  je.source_type,
  je.source_id,
  coalesce(sum(jel.debit), 0) as debit_total,
  coalesce(sum(jel.credit), 0) as credit_total,
  coalesce(sum(jel.debit), 0) - coalesce(sum(jel.credit), 0) as diff
from public.journal_entries je
left join public.journal_entry_lines jel on jel.journal_entry_id = je.id
group by je.id, je.pharmacy_id, je.source_type, je.source_id
having je.pharmacy_id = private.current_pharmacy_id()
   and coalesce(sum(jel.debit), 0) <> coalesce(sum(jel.credit), 0);

comment on function private.current_pharmacy_id() is 'Returns the active authenticated user pharmacy_id for tenant-scoped reporting views.';
comment on view public.stock_ledger_view is 'Tenant-isolated reporting view. Uses security_invoker and private.current_pharmacy_id() filter.';
comment on view public.fefo_available_batches_view is 'Tenant-isolated FEFO reporting view. Uses security_invoker and private.current_pharmacy_id() filter.';
