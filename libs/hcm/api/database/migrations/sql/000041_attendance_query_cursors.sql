-- Attendance owns disposable list continuation. The random handle itself is never
-- stored, and no cursor is an authorization credential. Runtime cannot rewrite it.
CREATE TABLE hcm.attendance_query_cursor (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  token_digest text NOT NULL CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  actor_account_id text NOT NULL,
  app_code text NOT NULL CHECK (app_code IN ('WORK_SCHEDULE_TEMPLATES','WORK_SCHEDULES')),
  binding_digest text NOT NULL CHECK (binding_digest ~ '^[a-f0-9]{64}$'),
  last_sort_value text NOT NULL CHECK (length(last_sort_value) BETWEEN 1 AND 200),
  last_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id,token_digest),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,last_id) REFERENCES hcm.work_schedule(tenant_id,id),
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '15 minutes')
);
CREATE INDEX attendance_query_cursor_expiry ON hcm.attendance_query_cursor(tenant_id,expires_at,token_digest);
ALTER TABLE hcm.attendance_query_cursor ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.attendance_query_cursor FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.attendance_query_cursor TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT,DELETE ON hcm.attendance_query_cursor TO hcm_runtime;
