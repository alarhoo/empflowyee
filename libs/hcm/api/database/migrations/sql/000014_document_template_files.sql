-- Private immutable files use reservations; only the final transaction publishes a business version.
CREATE TABLE hcm.document_blob (
 tenant_id text NOT NULL REFERENCES hcm.tenant(id), id uuid NOT NULL,
 storage_key uuid NOT NULL UNIQUE, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 10485760),
 media_type text NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg')),
 safe_filename text NOT NULL CHECK(length(safe_filename) BETWEEN 1 AND 200),
 state text NOT NULL CHECK(state IN ('Staged','Ready','Failed')),
 created_by_account_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.document_template (
 tenant_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), type_id text NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 100), revision integer NOT NULL CHECK(revision>0),
 created_by_account_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,type_id) REFERENCES hcm.document_type(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.document_template_version (
 tenant_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), template_id text NOT NULL,
 version_number integer NOT NULL CHECK(version_number>0), blob_id uuid NOT NULL,
 created_by_account_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,template_id,version_number), UNIQUE(tenant_id,blob_id),
 FOREIGN KEY(tenant_id,template_id) REFERENCES hcm.document_template(tenant_id,id),
 FOREIGN KEY(tenant_id,blob_id) REFERENCES hcm.document_blob(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.document_upload_attempt (
 tenant_id text NOT NULL, id uuid NOT NULL, actor_account_id text NOT NULL,
 operation text NOT NULL CHECK(length(operation) BETWEEN 1 AND 100), idempotency_key uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'), blob_id uuid NOT NULL,
 aggregate_id text NOT NULL CHECK(length(aggregate_id) BETWEEN 1 AND 200), expected_revision integer CHECK(expected_revision>0),
 safe_intent jsonb NOT NULL CHECK(jsonb_typeof(safe_intent)='object' AND octet_length(safe_intent::text)<=8192),
 state text NOT NULL CHECK(state IN ('Staged','Ready','Failed')), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,actor_account_id,operation,idempotency_key), UNIQUE(tenant_id,blob_id),
 FOREIGN KEY(tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
 FOREIGN KEY(tenant_id,blob_id) REFERENCES hcm.document_blob(tenant_id,id)
);
CREATE INDEX document_template_list ON hcm.document_template(tenant_id,label COLLATE "C",id);
CREATE INDEX document_upload_recovery ON hcm.document_upload_attempt(tenant_id,state,created_at,id);
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['document_blob','document_template','document_template_version','document_upload_attempt'] LOOP
  EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
  EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
 END LOOP;
END
$policies$;
GRANT UPDATE(state) ON hcm.document_blob,hcm.document_upload_attempt TO hcm_runtime;
GRANT UPDATE(revision) ON hcm.document_template TO hcm_runtime;

-- A transaction cannot expose a version whose file is still reserved or failed.
CREATE FUNCTION hcm.require_template_ready_blob() RETURNS trigger LANGUAGE plpgsql AS $ready$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM hcm.document_blob WHERE tenant_id=NEW.tenant_id AND id=NEW.blob_id AND state='Ready') THEN
  RAISE EXCEPTION 'Document version requires a Ready blob' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$ready$;
CREATE CONSTRAINT TRIGGER template_ready_blob AFTER INSERT ON hcm.document_template_version
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_template_ready_blob();

-- Published bytes and evidence remain immutable even if runtime code attempts an invalid state transition.
CREATE FUNCTION hcm.require_document_file_transition() RETURNS trigger LANGUAGE plpgsql AS $state$
BEGIN
 IF OLD.state<>'Staged' OR NEW.state NOT IN ('Ready','Failed') THEN
  RAISE EXCEPTION 'Invalid document file transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$state$;
CREATE TRIGGER document_blob_state BEFORE UPDATE ON hcm.document_blob FOR EACH ROW EXECUTE FUNCTION hcm.require_document_file_transition();
CREATE TRIGGER document_attempt_state BEFORE UPDATE ON hcm.document_upload_attempt FOR EACH ROW EXECUTE FUNCTION hcm.require_document_file_transition();
