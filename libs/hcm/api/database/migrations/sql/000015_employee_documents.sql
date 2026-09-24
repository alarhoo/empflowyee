-- Documents owns immutable worker attachments and revisioned per-version sharing.
CREATE TABLE hcm.employee_document (
 tenant_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), worker_id text NOT NULL, type_id text NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 150), revision integer NOT NULL CHECK(revision>0),
 created_by_account_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,worker_id) REFERENCES hcm.worker(tenant_id,id),
 FOREIGN KEY(tenant_id,type_id) REFERENCES hcm.document_type(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.employee_document_version (
 tenant_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), document_id text NOT NULL,
 version_number integer NOT NULL CHECK(version_number>0), blob_id uuid NOT NULL,
 employee_visible boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by_account_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,document_id,version_number), UNIQUE(tenant_id,blob_id),
 FOREIGN KEY(tenant_id,document_id) REFERENCES hcm.employee_document(tenant_id,id),
 FOREIGN KEY(tenant_id,blob_id) REFERENCES hcm.document_blob(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX employee_document_worker_list ON hcm.employee_document(tenant_id,worker_id,label COLLATE "C",id);
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['employee_document','employee_document_version'] LOOP
  EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
  EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
 END LOOP;
END
$policies$;
GRANT UPDATE(revision) ON hcm.employee_document TO hcm_runtime;
GRANT UPDATE(employee_visible,revision) ON hcm.employee_document_version TO hcm_runtime;
-- The same Ready-file invariant applies to every immutable attachment version.
CREATE CONSTRAINT TRIGGER employee_document_ready_blob AFTER INSERT ON hcm.employee_document_version
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_template_ready_blob();
