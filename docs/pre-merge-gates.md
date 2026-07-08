# Pre-merge Gates — ApotekKilat P1.5–P5

Last updated: 2026-07-08

## Current status

Live Supabase project has P1.5 through P5 changes applied.

Branch:

- `phase-1-5-lock-direct-mutation`

## Gate 1 — Migration placeholder replacement

Status: mostly completed for P2/P4/P5 files that previously contained placeholder/summary notes.

Updated files:

- `supabase/migrations/202607080019_p2_checkout_transaction_atomic.sql`
- `supabase/migrations/202607080020_p2_receive_purchase_order_atomic.sql`
- `supabase/migrations/202607080021_p2_return_state_machine_rpcs.sql`
- `supabase/migrations/202607080022_p2_post_stock_opname_atomic.sql`
- `supabase/migrations/202607080029_p4_stock_workflow_cache_flags.sql`
- `supabase/migrations/202607080031_p5_branch_transfer_workflow.sql`
- `supabase/migrations/202607080033_p5_observability_integrity_alerts.sql`

Repository search result after replacement:

- `placeholder`: no result.
- `Expand before clean replay`: no result.

Important caveat:

- `checkout_transaction` in repo is replayable and implements the core P2/P4/P5 rules, but it is a compact replayable body rather than a byte-for-byte copy of the long live function export.
- For final production-grade migration hygiene, run a clean database replay in a test project and compare `pg_get_functiondef` against live for critical RPCs.

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

Restore validation remains intentionally held until either:

- Supabase Pro branching is enabled, or
- a separate restore/test project is created manually.

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

1. Clean replay is tested on a separate project/branch.
2. Integrity checks pass after replay/restore.
3. `supabase-data.js` P4/P5 read-model needs are either explicitly accepted as future work or patched.
4. Critical RPC function definitions are compared between replay DB and live DB.
