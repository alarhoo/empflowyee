-- Leave-owned unpredictable query continuation, bound to actor, current grant,
-- complete filters and source generation. Only a digest of the token is stored.
CREATE TABLE hcm.leave_query_cursor (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  token_digest text NOT NULL CHECK(token_digest ~ '^[a-f0-9]{64}$'),
  actor_account_id text NOT NULL,
  query_kind text NOT NULL CHECK(query_kind IN ('Policies','Types')),
  binding_digest text NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
  last_sort_value text NOT NULL CHECK(length(last_sort_value)<=200),
  last_id text NOT NULL CHECK(length(last_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
  PRIMARY KEY(tenant_id,token_digest), FOREIGN KEY(tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX leave_query_cursor_expiry ON hcm.leave_query_cursor(tenant_id,expires_at);
ALTER TABLE hcm.leave_query_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.leave_query_cursor FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.leave_query_cursor TO hcm_runtime,hcm_migrator
  USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT,DELETE ON hcm.leave_query_cursor TO hcm_runtime;
