-- Phase P3.2 — Required audit actions.
-- Applied manually to Supabase project gene / kipcvugwlghonpgvitjk on 2026-07-08.
-- Adds audit taxonomy and automatic audit triggers for master/admin changes.
-- Critical workflows are audited through RPCs from P2/P3.

BEGIN;

CREATE TABLE IF NOT EXISTS private.required_audit_actions (
  module text NOT NULL,
  action text NOT NULL,
  description text,
  PRIMARY KEY (module, action)
);

INSERT INTO private.required_audit_actions(module, action, description) VALUES
  ('product','create','Create product master'),
  ('product','update','Update product master'),
  ('product','deactivate','Deactivate product'),
  ('product','price_change','Change product price or cost'),
  ('batch','receive','Receive batch into stock'),
  ('batch','move','Move batch location'),
  ('batch','adjust','Adjust batch quantity'),
  ('batch','expire','Mark batch expired'),
  ('batch','write_off','Write off batch'),
  ('cashier','checkout','Checkout transaction'),
  ('cashier','void','Void transaction'),
  ('cashier','refund','Refund transaction'),
  ('po','create','Create purchase order'),
  ('po','submit','Submit purchase order'),
  ('po','approve','Approve purchase order'),
  ('po','reject','Reject purchase order'),
  ('po','receive','Receive purchase order'),
  ('return','create','Create return draft'),
  ('return','submit','Submit return'),
  ('return','approve','Approve return'),
  ('return','reject','Reject return'),
  ('return','complete','Complete return'),
  ('stock_opname','create','Create stock opname'),
  ('stock_opname','count','Count stock opname'),
  ('stock_opname','approve','Approve stock opname'),
  ('stock_opname','post','Post stock opname'),
  ('finance','payment_create','Create AP/AR payment'),
  ('finance','reversal','Reverse AP/AR payment or journal'),
  ('user','invite','Invite user'),
  ('user','role_change','Change user role'),
  ('user','deactivate','Deactivate user'),
  ('setting','knowledge_snapshot_update','Update AI knowledge snapshot'),
  ('setting','profile_update','Update pharmacy profile')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

CREATE OR REPLACE FUNCTION private.audit_master_data_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_pharmacy_id uuid;
  v_branch_id uuid;
  v_module text;
  v_action text;
  v_entity_type text := TG_TABLE_NAME;
  v_entity_id uuid;
BEGIN
  v_pharmacy_id := COALESCE(NEW.pharmacy_id, OLD.pharmacy_id);
  v_branch_id := COALESCE(NEW.branch_id, OLD.branch_id);
  v_entity_id := COALESCE(NEW.id, OLD.id);

  IF TG_TABLE_NAME = 'products' THEN
    v_module := 'product';
    IF TG_OP = 'INSERT' THEN v_action := 'create';
    ELSIF TG_OP = 'UPDATE' AND (COALESCE(OLD.price,0) IS DISTINCT FROM COALESCE(NEW.price,0) OR COALESCE(OLD.cost,0) IS DISTINCT FROM COALESCE(NEW.cost,0)) THEN v_action := 'price_change';
    ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'Aktif') IS DISTINCT FROM COALESCE(NEW.status,'Aktif') AND COALESCE(NEW.status,'') <> 'Aktif' THEN v_action := 'deactivate';
    ELSE v_action := lower(TG_OP); END IF;
  ELSIF TG_TABLE_NAME = 'product_batches' THEN
    v_module := 'batch';
    IF TG_OP = 'INSERT' THEN v_action := 'receive';
    ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.location,'') IS DISTINCT FROM COALESCE(NEW.location,'') THEN v_action := 'move';
    ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.qty,0) IS DISTINCT FROM COALESCE(NEW.qty,0) THEN v_action := CASE WHEN COALESCE(NEW.qty,0)=0 THEN 'write_off' ELSE 'adjust' END;
    ELSIF TG_OP = 'UPDATE' AND OLD.expired_at IS DISTINCT FROM NEW.expired_at THEN v_action := 'expire';
    ELSE v_action := lower(TG_OP); END IF;
  ELSIF TG_TABLE_NAME = 'pharmacy_users' THEN
    v_module := 'user';
    IF TG_OP = 'INSERT' THEN v_action := 'invite';
    ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN v_action := 'role_change';
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status <> 'Aktif' THEN v_action := 'deactivate';
    ELSE v_action := lower(TG_OP); END IF;
  ELSIF TG_TABLE_NAME = 'pharmacy_settings' THEN
    v_module := 'setting';
    v_entity_id := COALESCE(NEW.pharmacy_id, OLD.pharmacy_id);
    IF TG_OP = 'UPDATE' AND OLD.knowledge_snapshot IS DISTINCT FROM NEW.knowledge_snapshot THEN v_action := 'knowledge_snapshot_update';
    ELSE v_action := 'profile_update'; END IF;
  ELSIF TG_TABLE_NAME = 'pharmacies' THEN
    v_module := 'setting';
    v_entity_id := COALESCE(NEW.id, OLD.id);
    v_action := 'profile_update';
  ELSE
    v_module := TG_TABLE_NAME;
    v_action := lower(TG_OP);
  END IF;

  PERFORM private.write_audit_log(
    v_pharmacy_id,
    v_branch_id,
    v_module,
    v_action,
    v_entity_type,
    v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    gen_random_uuid(),
    'db_trigger'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_p3_audit_products ON public.products;
CREATE TRIGGER trg_p3_audit_products AFTER INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.audit_master_data_changes();

DROP TRIGGER IF EXISTS trg_p3_audit_product_batches ON public.product_batches;
CREATE TRIGGER trg_p3_audit_product_batches AFTER INSERT OR UPDATE ON public.product_batches FOR EACH ROW EXECUTE FUNCTION private.audit_master_data_changes();

DROP TRIGGER IF EXISTS trg_p3_audit_pharmacy_users ON public.pharmacy_users;
CREATE TRIGGER trg_p3_audit_pharmacy_users AFTER INSERT OR UPDATE ON public.pharmacy_users FOR EACH ROW EXECUTE FUNCTION private.audit_master_data_changes();

DROP TRIGGER IF EXISTS trg_p3_audit_pharmacy_settings ON public.pharmacy_settings;
CREATE TRIGGER trg_p3_audit_pharmacy_settings AFTER UPDATE ON public.pharmacy_settings FOR EACH ROW EXECUTE FUNCTION private.audit_master_data_changes();

DROP TRIGGER IF EXISTS trg_p3_audit_pharmacies ON public.pharmacies;
CREATE TRIGGER trg_p3_audit_pharmacies AFTER UPDATE ON public.pharmacies FOR EACH ROW EXECUTE FUNCTION private.audit_master_data_changes();

REVOKE ALL ON FUNCTION private.audit_master_data_changes() FROM PUBLIC, anon, authenticated;

COMMIT;
