# Backup and Restore Procedure — ApotekKilat

Last updated: 2026-07-08

## Purpose

Ensure the ApotekKilat Supabase database can be backed up, restored, and validated without losing financial, inventory, tenant, and audit data.

## Scope

This procedure covers:

- PostgreSQL schema and data backup.
- Restore into a non-production validation project first.
- Integrity checks after restore.
- Final production restore only after validation.

## Backup policy

Recommended baseline:

- Daily automated Supabase backup for production.
- Manual backup before every migration batch or merge to `main`.
- Retain at least 7 daily backups and 4 weekly backups.
- Export migration files from the repository together with database backup metadata.

## Manual backup checklist

1. Confirm no active migration is running.
2. Record current Git commit SHA and Supabase migration version.
3. Export database backup using Supabase dashboard or CLI.
4. Store backup file/metadata in approved secure storage.
5. Record backup time, operator, project ref, and commit SHA.

## Restore validation procedure

1. Create a new Supabase development/restore project.
2. Restore the database backup into the restore project.
3. Apply pending migrations from repository if needed.
4. Run integrity checks:

```sql
select public.run_integrity_checks('<pharmacy_id>'::uuid);
select * from public.open_integrity_alerts_view;
select * from public.unbalanced_journals_view;
select * from public.transactions_without_journal_view;
select * from public.expired_sellable_batches_view;
select * from public.stock_reconciliation_view where reconciliation_status = 'DIFF';
```

5. Validate critical workflows on test data:

- Checkout creates transaction, stock movement, journal, audit log.
- PO receipt creates batch, branch inventory, AP, journal, audit log.
- Return completion creates stock movement and audit log.
- Stock opname posting creates adjustment and journal when needed.
- Branch transfer creates `TRANSFER_OUT` and `TRANSFER_IN` with the same reference document.

6. Confirm RLS behavior:

- Owner can see all branches.
- Branch-limited cashier can see only their branch transactions, stock movements, and inventory.
- Client cannot insert/update/delete RPC-only tables directly.

## Production restore procedure

Only perform after restore validation passes.

1. Announce maintenance window.
2. Disable app writes or put the app in maintenance mode.
3. Take a fresh final backup.
4. Restore selected backup to production.
5. Run all integrity checks.
6. Run smoke tests for authentication, checkout, PO receipt, returns, stock opname, and branch transfer.
7. Re-enable app writes.
8. Monitor `integrity_alerts`, `system_event_logs`, and `sync_failures` for at least 24 hours.

## Rollback criteria

Rollback or keep maintenance mode if any of these occur:

- Open critical integrity alerts remain unresolved.
- Journal debit/credit is not balanced.
- Completed transaction has no journal.
- Branch inventory becomes negative.
- Expired batch remains SELLABLE with quantity > 0.
- RLS allows branch-limited users to see another branch.

## Evidence to keep

For every tested backup/restore event, keep:

- Backup timestamp.
- Restore target project.
- Git commit SHA.
- Migration version.
- Integrity check output.
- Smoke test result.
- Operator name.
- Final decision: passed / failed / rollback.
