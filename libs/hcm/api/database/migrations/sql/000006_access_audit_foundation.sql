-- Ownership: access-control. Additive HCM-1 policy metadata; historical grants remain intact.
ALTER TABLE hcm.access_role
  ADD COLUMN system_role boolean NOT NULL DEFAULT false,
  ADD COLUMN protected_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT access_role_label_length CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  ADD CONSTRAINT access_role_protected_system CHECK (NOT protected_admin OR system_role);
CREATE UNIQUE INDEX access_role_label ON hcm.access_role(tenant_id,lower(label));
ALTER TABLE hcm.access_permission DROP CONSTRAINT access_permission_kind_check;
ALTER TABLE hcm.access_permission ADD CONSTRAINT access_permission_kind_check
  CHECK (kind IN ('catalogue-discovery','business-operation'));
ALTER TABLE hcm.account_role
  ADD COLUMN grant_id text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN granted_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN granted_by_account_id text,
  ADD CONSTRAINT account_role_grant_id UNIQUE (tenant_id,grant_id),
  ADD CONSTRAINT account_role_grant_actor FOREIGN KEY (tenant_id,granted_by_account_id)
    REFERENCES hcm.user_account(tenant_id,id);

CREATE TABLE hcm.access_command_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  actor_account_id text NOT NULL,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 100),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response)='object' AND octet_length(response::text)<=65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,actor_account_id,operation,idempotency_key),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- Ownership: audit. No runtime update, deletion or truncation capability.
CREATE TABLE hcm.audit_event (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), actor_account_id text NOT NULL,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  target_type text NOT NULL CHECK (length(target_type) BETWEEN 1 AND 100),
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 200),
  outcome text NOT NULL CHECK (outcome IN ('Succeeded','Authorized','Completed','Failed')),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 100),
  category text NOT NULL CHECK (category IN ('business','sensitive-access','export')),
  safe_summary jsonb NOT NULL CHECK (jsonb_typeof(safe_summary)='object' AND octet_length(safe_summary::text)<=4096),
  related_event_id text,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,related_event_id) REFERENCES hcm.audit_event(tenant_id,id)
);
CREATE INDEX audit_event_time ON hcm.audit_event(tenant_id,occurred_at,id);
CREATE INDEX audit_event_actor_time ON hcm.audit_event(tenant_id,actor_account_id,occurred_at,id);
CREATE INDEX audit_event_category_time ON hcm.audit_event(tenant_id,category,occurred_at,id);
DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['access_command_receipt','audit_event'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
-- Explicit columns prevent runtime promotion of a custom role to a protected system role.
GRANT INSERT (tenant_id,id,label,revision,created_at,updated_at),
  UPDATE (label,revision,updated_at), DELETE ON hcm.access_role TO hcm_runtime;
GRANT INSERT,DELETE ON hcm.role_permission TO hcm_runtime;
GRANT INSERT,DELETE ON hcm.account_role TO hcm_runtime;
