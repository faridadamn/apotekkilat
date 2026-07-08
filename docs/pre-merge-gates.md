# Pre-merge Gates — ApotekKilat P1.5–P5

Last updated: 2026-07-08

## Current status

Live Supabase project has P1.5 through P5 changes applied.

Branch:

- `phase-1-5-lock-direct-mutation`

## Gate 1 — Sync live SQL function bodies

Some migration files are still summary/placeholder migrations and must be expanded before a clean replay from zero.

Known files requiring full live function body sync:

- `supabase/migrations/202607080019_p2_checkout_transaction_atomic.sql`
- `supabase/migrations/202607080020_p2_receive_purchase_order_atomic.sql`
- `supabase/migrations/202607080021_p2_return_state_machine_rpcs.sql`
- `supabase/migrations/202607080022_p2_post_stock_opname_atomic.sql`
- `supabase/migrations/202607080029_p4_stock_workflow_cache_flags.sql`
- `supabase/migrations/202607080031_p5_branch_transfer_workflow.sql`
- `supabase/migrations/202607080033_p5_observability_integrity_alerts.sql`

Recommended export command:

```sql
select n.nspname as schema,
       p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private')
  and p.proname in (
    'checkout_transaction','receive_purchase_order','submit_return','approve_return','complete_return','post_stock_opname',
    'create_branch_transfer','dispatch_branch_transfer','receive_branch_transfer',
    'log_system_event','log_sync_failure','run_integrity_checks','raise_integrity_alert'
  )
order by n.nspname, p.proname;
```

## Gate 2 — `supabase-data.js` review

Observed diff: `+8/-78`.

Review result:

- No syntax break was visible in the inspected file.
- The large deletion is mainly because full cloud snapshot saving was intentionally disabled and replaced with RPC/incremental workflow behavior.
- The file correctly keeps users without `pharmacy_users` membership in local/demo mode.
- Follow-up recommended: add P4/P5 read models to the client mapping if the UI needs branch inventory, stock movements, alerts, and transfer documents.

## Gate 3 — Restore validation

Attempted Supabase branch creation for restore validation failed with:

```text
Branching is supported only on the Pro plan or above
```

Current project branch list only shows `main`.

Restore validation still needs to be executed manually using either:

- Supabase Pro branching, or
- a separate restore/test project.

## Gate 4 — Integrity baseline

Live integrity baseline query executed against current DB:

```sql
select 'open_integrity_alerts' as check_name, count(*)::int as count from public.open_integrity_alerts_view
union all select 'unbalanced_journals', count(*)::int from public.unbalanced_journals_view
union all select 'transactions_without_journal', count(*)::int from public.transactions_without_journal_view
union all select 'expired_sellable_batches', count(*)::int from public.expired_sellable_batches_view
union all select 'stock_reconciliation_diff', count(*)::int from public.stock_reconciliation_view where reconciliation_status='DIFF';
```

Result:

| Check | Count |
|---|---:|
| open_integrity_alerts | 0 |
| unbalanced_journals | 0 |
| transactions_without_journal | 0 |
| expired_sellable_batches | 0 |
| stock_reconciliation_diff | 0 |

Note: no tenant rows exist yet in `public.pharmacies`, so `run_integrity_checks(p_pharmacy_id)` could not be executed for a specific tenant.

## Merge decision

Do not merge to `main` until:

1. Placeholder migrations are expanded with full live SQL function bodies.
2. `supabase-data.js` is either accepted as intentionally RPC-only or patched with P4/P5 read models.
3. Restore validation is executed on a branch/test project.
4. Integrity checks pass after restore.
