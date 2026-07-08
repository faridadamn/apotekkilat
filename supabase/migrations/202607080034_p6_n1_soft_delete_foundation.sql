-- P6 N1 — Soft-delete foundation for records removed from UI.
-- Purpose: avoid cloud resurrection of locally deleted rows across devices.
-- Strategy: never hard-delete business/master rows; mark deleted_at/deleted_by.

alter table if exists public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table if exists public.customers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table if exists public.suppliers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table if exists public.branches
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table if exists public.purchase_orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table if exists public.price_lists
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table if exists public.conversations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

create index if not exists idx_products_not_deleted on public.products(pharmacy_id, deleted_at);
create index if not exists idx_customers_not_deleted on public.customers(pharmacy_id, deleted_at);
create index if not exists idx_suppliers_not_deleted on public.suppliers(pharmacy_id, deleted_at);
create index if not exists idx_branches_not_deleted on public.branches(pharmacy_id, deleted_at);
create index if not exists idx_purchase_orders_not_deleted on public.purchase_orders(pharmacy_id, deleted_at);
create index if not exists idx_price_lists_not_deleted on public.price_lists(pharmacy_id, deleted_at);
create index if not exists idx_conversations_not_deleted on public.conversations(pharmacy_id, deleted_at);
