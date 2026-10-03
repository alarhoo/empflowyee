-- Leave policy command receipts retain actor-bound retry identity and encrypted
-- narrative. They commit with the draft, typed rules and safe audit event.
CREATE TABLE hcm.leave_command_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
  actor_account_id text NOT NULL,
  operation text NOT NULL CHECK(operation IN ('Policy.create','Policy.update','Policy.version')),
  idempotency_key uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  policy_version_id text NOT NULL, source_revision integer NOT NULL CHECK(source_revision>0),
  response jsonb NOT NULL CHECK(jsonb_typeof(response)='object' AND octet_length(response::text)<=1048576),
  encrypted_reason bytea, reason_key_version integer CHECK(reason_key_version>0),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,actor_account_id,operation,idempotency_key),
  FOREIGN KEY(tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY(tenant_id,policy_version_id) REFERENCES hcm.leave_policy_version(tenant_id,id),
  CHECK((encrypted_reason IS NULL)=(reason_key_version IS NULL)),
  CHECK(encrypted_reason IS NULL OR octet_length(encrypted_reason) BETWEEN 30 AND 10000),
  CHECK(operation<>'Policy.version' OR encrypted_reason IS NOT NULL)
);
ALTER TABLE hcm.leave_command_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.leave_command_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.leave_command_receipt TO hcm_runtime,hcm_migrator
  USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.leave_command_receipt TO hcm_runtime;
