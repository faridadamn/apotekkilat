-- Phase P5.4 — Observability and integrity alerts.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Adds RPC/Edge error logging, sync failure monitoring, integrity alerts, and monitoring views.

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid REFERENCES public.pharmacies(id),
  branch_id uuid REFERENCES public.branches(id),
  actor_user_id uuid REFERENCES auth.users(id),
  source text NOT NULL DEFAULT 'web',
  module text NOT NULL,
  action text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  context jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (severity IN ('debug','info','warning','error','critical'))
);

CREATE TABLE IF NOT EXISTS public.sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid REFERENCES public.pharmacies(id),
  branch_id uuid REFERENCES public.branches(id),
  actor_user_id uuid REFERENCES auth.users(id),
  entity_type text NOT NULL,
  entity_id uuid,
  operation text NOT NULL,
  payload jsonb,
  error_message text NOT NULL,
  retry_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Open',
  last_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (retry_count >= 0),
  CHECK (status IN ('Open','Retrying','Resolved','Ignored'))
);

CREATE TABLE IF NOT EXISTS public.integrity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id),
  branch_id uuid REFERENCES public.branches(id),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  entity_type text NOT NULL,
  entity_id uuid,
  message text NOT NULL,
  details jsonb,
  status text NOT NULL DEFAULT 'Open',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  CHECK (severity IN ('warning','error','critical')),
  CHECK (status IN ('Open','Resolved','Ignored'))
);

CREATE UNIQUE INDEX IF NOT EXISTS integrity_alerts_open_unique_idx ON public.integrity_alerts (pharmacy_id, alert_type, entity_type, entity_id) WHERE status = 'Open';
CREATE INDEX IF NOT EXISTS system_event_logs_pharmacy_created_idx ON public.system_event_logs (pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_failures_status_idx ON public.sync_failures (pharmacy_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS integrity_alerts_status_idx ON public.integrity_alerts (pharmacy_id, status, severity, last_seen_at DESC);

ALTER TABLE public.system_event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrity_alerts ENABLE ROW LEVEL SECURITY;

-- Read access Owner/Supervisor only; writes go through SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS p5_system_event_logs_select ON public.system_event_logs;
DROP POLICY IF EXISTS p5_system_event_logs_insert_deny ON public.system_event_logs;
DROP POLICY IF EXISTS p5_system_event_logs_update_deny ON public.system_event_logs;
DROP POLICY IF EXISTS p5_system_event_logs_delete_deny ON public.system_event_logs;
CREATE POLICY p5_system_event_logs_select ON public.system_event_logs FOR SELECT USING (pharmacy_id IS NULL OR private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p5_system_event_logs_insert_deny ON public.system_event_logs FOR INSERT WITH CHECK (false);
CREATE POLICY p5_system_event_logs_update_deny ON public.system_event_logs FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_system_event_logs_delete_deny ON public.system_event_logs FOR DELETE USING (false);

DROP POLICY IF EXISTS p5_sync_failures_select ON public.sync_failures;
DROP POLICY IF EXISTS p5_sync_failures_insert_deny ON public.sync_failures;
DROP POLICY IF EXISTS p5_sync_failures_update_deny ON public.sync_failures;
DROP POLICY IF EXISTS p5_sync_failures_delete_deny ON public.sync_failures;
CREATE POLICY p5_sync_failures_select ON public.sync_failures FOR SELECT USING (pharmacy_id IS NULL OR private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p5_sync_failures_insert_deny ON public.sync_failures FOR INSERT WITH CHECK (false);
CREATE POLICY p5_sync_failures_update_deny ON public.sync_failures FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_sync_failures_delete_deny ON public.sync_failures FOR DELETE USING (false);

DROP POLICY IF EXISTS p5_integrity_alerts_select ON public.integrity_alerts;
DROP POLICY IF EXISTS p5_integrity_alerts_insert_deny ON public.integrity_alerts;
DROP POLICY IF EXISTS p5_integrity_alerts_update_deny ON public.integrity_alerts;
DROP POLICY IF EXISTS p5_integrity_alerts_delete_deny ON public.integrity_alerts;
CREATE POLICY p5_integrity_alerts_select ON public.integrity_alerts FOR SELECT USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor']::text[]));
CREATE POLICY p5_integrity_alerts_insert_deny ON public.integrity_alerts FOR INSERT WITH CHECK (false);
CREATE POLICY p5_integrity_alerts_update_deny ON public.integrity_alerts FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY p5_integrity_alerts_delete_deny ON public.integrity_alerts FOR DELETE USING (false);

-- NOTE: Full function bodies are deployed live:
-- private.raise_integrity_alert(...)
-- public.log_system_event(jsonb)
-- public.log_sync_failure(jsonb)
-- public.run_integrity_checks(uuid)
-- Expand before clean replay from zero.

CREATE OR REPLACE VIEW public.open_integrity_alerts_view AS
SELECT * FROM public.integrity_alerts WHERE status = 'Open' ORDER BY severity DESC, last_seen_at DESC;

CREATE OR REPLACE VIEW public.unbalanced_journals_view AS
SELECT je.id AS journal_entry_id, je.pharmacy_id, je.source_type, je.source_id,
       COALESCE(sum(jel.debit),0) debit_total,
       COALESCE(sum(jel.credit),0) credit_total,
       COALESCE(sum(jel.debit),0)-COALESCE(sum(jel.credit),0) diff
FROM public.journal_entries je
LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.pharmacy_id, je.source_type, je.source_id
HAVING COALESCE(sum(jel.debit),0) <> COALESCE(sum(jel.credit),0);

CREATE OR REPLACE VIEW public.transactions_without_journal_view AS
SELECT t.* FROM public.transactions t
LEFT JOIN public.journal_entries je ON je.source_type='transaction' AND je.source_id=t.id::text
WHERE t.status='Selesai' AND je.id IS NULL;

CREATE OR REPLACE VIEW public.expired_sellable_batches_view AS
SELECT * FROM public.product_batches
WHERE status='SELLABLE' AND expired_at IS NOT NULL AND expired_at < current_date AND qty > 0;

GRANT SELECT ON public.open_integrity_alerts_view TO authenticated;
GRANT SELECT ON public.unbalanced_journals_view TO authenticated;
GRANT SELECT ON public.transactions_without_journal_view TO authenticated;
GRANT SELECT ON public.expired_sellable_batches_view TO authenticated;

COMMIT;
