-- Document classifications are owned by documents; no file storage or retention policy is inferred.
CREATE TABLE hcm.document_type (
 tenant_id text NOT NULL REFERENCES hcm.tenant(id),
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
 code text NOT NULL CHECK(code ~ '^[A-Z0-9_]{1,50}$'),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 100),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=500),
 enabled boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code),
 FOREIGN KEY(tenant_id,created_by) REFERENCES hcm.user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX document_type_list ON hcm.document_type(tenant_id,label COLLATE "C",id);
CREATE TABLE hcm.document_command_receipt (
 tenant_id text NOT NULL,actor_account_id text NOT NULL,operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 100),
 idempotency_key uuid NOT NULL,request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),response jsonb NOT NULL CHECK(jsonb_typeof(response)='object'),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,actor_account_id,operation,idempotency_key),FOREIGN KEY(tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['document_type','document_command_receipt'] LOOP
  EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
  EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
 END LOOP;
END
$policies$;
GRANT UPDATE(label,description,enabled,revision,updated_by,updated_at) ON hcm.document_type TO hcm_runtime;
