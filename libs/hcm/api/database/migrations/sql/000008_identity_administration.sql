-- Ownership: identity-access. Add lifecycle attribution without rewriting seeded identities.
ALTER TABLE hcm.user_account
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN created_by_account_id text,
 ADD COLUMN updated_by_account_id text,
 ADD CONSTRAINT user_account_creator FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
 ADD CONSTRAINT user_account_updater FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id);
-- Runtime cannot edit names, email, person linkage or preferences, and cannot delete accounts.
GRANT INSERT (tenant_id,id,person_id,email,enabled,created_by_account_id,updated_by_account_id) ON hcm.user_account TO hcm_runtime;
GRANT UPDATE (enabled,revision,updated_at,updated_by_account_id) ON hcm.user_account TO hcm_runtime;
CREATE TABLE hcm.identity_command_receipt (
 tenant_id text NOT NULL REFERENCES hcm.tenant(id), actor_account_id text NOT NULL,
 operation text NOT NULL CHECK (operation IN ('accounts.create','accounts.enabled')),
 idempotency_key uuid NOT NULL,
 request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 response jsonb NOT NULL CHECK (jsonb_typeof(response)='object' AND octet_length(response::text)<=65536),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (tenant_id,actor_account_id,operation,idempotency_key),
 FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
ALTER TABLE hcm.identity_command_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.identity_command_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.identity_command_receipt TO hcm_runtime,hcm_migrator
 USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.identity_command_receipt TO hcm_runtime;
