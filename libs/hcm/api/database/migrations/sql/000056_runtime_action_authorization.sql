-- Runtime captures verified human expiry and immutable action bindings for
-- same-boundary Workflow dispatch. References are internal, never login tokens.
CREATE TABLE hcm.runtime_action_authorization (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  actor_account_id text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  permission text NOT NULL CHECK (permission ~ '^[a-z][a-z0-9.-]{0,199}$'),
  scope_reference text NOT NULL CHECK (scope_reference ~ '^[a-f0-9]{64}$'),
  intent_digest text NOT NULL CHECK (intent_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,actor_account_id,intent_digest),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (expires_at>issued_at)
);
ALTER TABLE hcm.runtime_action_authorization ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.runtime_action_authorization FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.runtime_action_authorization TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
-- No renewal or replacement of an admitted actor's expiry is possible at runtime.
GRANT SELECT,INSERT ON hcm.runtime_action_authorization TO hcm_runtime;
