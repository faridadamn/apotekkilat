-- Phase P1.4.4: sync outbox for non-critical deferred master-data changes.
-- Checkout and stock-posting workflows remain RPC-only and must not be processed offline.

CREATE TABLE IF NOT EXISTS public.sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  status text NOT NULL DEFAULT 'queued',
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT sync_outbox_status_check CHECK (status IN ('queued','processing','done','failed','cancelled')),
  CONSTRAINT sync_outbox_action_type_check CHECK (action_type IN (
    'product.insert','product.update','customer.insert','customer.update','batch.insert'
  ))
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_pharmacy_status_created
ON public.sync_outbox (pharmacy_id, status, created_at);

DROP TRIGGER IF EXISTS trg_sync_outbox_audit_version ON public.sync_outbox;
CREATE TRIGGER trg_sync_outbox_audit_version
BEFORE INSERT OR UPDATE ON public.sync_outbox
FOR EACH ROW EXECUTE FUNCTION private.set_audit_version_fields();

ALTER TABLE public.sync_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_outbox_select ON public.sync_outbox;
DROP POLICY IF EXISTS sync_outbox_insert ON public.sync_outbox;
DROP POLICY IF EXISTS sync_outbox_update ON public.sync_outbox;

CREATE POLICY sync_outbox_select
ON public.sync_outbox
FOR SELECT
TO authenticated
USING (private.is_pharmacy_member(pharmacy_id));

CREATE POLICY sync_outbox_insert
ON public.sync_outbox
FOR INSERT
TO authenticated
WITH CHECK (
  private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[])
  AND status IN ('queued','failed')
);

CREATE POLICY sync_outbox_update
ON public.sync_outbox
FOR UPDATE
TO authenticated
USING (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]))
WITH CHECK (private.has_pharmacy_role(pharmacy_id, ARRAY['Owner','Supervisor','Apoteker','Admin Stok']::text[]));
