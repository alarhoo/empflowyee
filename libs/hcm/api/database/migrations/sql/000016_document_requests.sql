-- Documents owns the bounded manual request lifecycle and immutable employee submissions.
CREATE TABLE hcm.document_request (
 tenant_id text NOT NULL,id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),worker_id text NOT NULL,type_id text NOT NULL,
 requested_by_account_id text NOT NULL,instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=1000),due_date date,
 status text NOT NULL CHECK(status IN ('Open','Submitted','Completed','Cancelled')),revision integer NOT NULL CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),accepted_version_id text,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,worker_id) REFERENCES hcm.worker(tenant_id,id),
 FOREIGN KEY(tenant_id,type_id) REFERENCES hcm.document_type(tenant_id,id),
 FOREIGN KEY(tenant_id,requested_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
 CHECK((status='Completed')=(accepted_version_id IS NOT NULL))
);
CREATE TABLE hcm.document_request_submission (
 tenant_id text NOT NULL,id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),request_id text NOT NULL,
 version_number integer NOT NULL CHECK(version_number>0),blob_id uuid NOT NULL,submitted_by_account_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,request_id,id),
 UNIQUE(tenant_id,request_id,version_number),UNIQUE(tenant_id,blob_id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES hcm.document_request(tenant_id,id),
 FOREIGN KEY(tenant_id,blob_id) REFERENCES hcm.document_blob(tenant_id,id),
 FOREIGN KEY(tenant_id,submitted_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
ALTER TABLE hcm.document_request ADD CONSTRAINT request_accepted_submission FOREIGN KEY(tenant_id,id,accepted_version_id)
 REFERENCES hcm.document_request_submission(tenant_id,request_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX document_request_worker_list ON hcm.document_request(tenant_id,worker_id,created_at,id);
CREATE INDEX document_request_tenant_list ON hcm.document_request(tenant_id,created_at,id);
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['document_request','document_request_submission'] LOOP
  EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
  EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
 END LOOP;
END
$policies$;
GRANT UPDATE(status,revision,updated_at,accepted_version_id) ON hcm.document_request TO hcm_runtime;
CREATE CONSTRAINT TRIGGER request_ready_blob AFTER INSERT ON hcm.document_request_submission
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_template_ready_blob();

-- Persisted reservation revisions identify the current submission cycle without exposing extra DTO fields.
CREATE FUNCTION hcm.require_document_request_consistency() RETURNS trigger LANGUAGE plpgsql AS $consistency$
DECLARE target text; request_row hcm.document_request%ROWTYPE; latest hcm.document_request_submission%ROWTYPE; expected integer;
BEGIN
 IF TG_TABLE_NAME='document_request' THEN target:=NEW.id; ELSE target:=NEW.request_id; END IF;
 SELECT * INTO request_row FROM hcm.document_request WHERE tenant_id=NEW.tenant_id AND id=target;
 IF request_row.status IN ('Submitted','Completed') THEN
  SELECT * INTO latest FROM hcm.document_request_submission WHERE tenant_id=NEW.tenant_id AND request_id=target ORDER BY version_number DESC LIMIT 1;
  IF latest.id IS NULL OR (request_row.status='Completed' AND request_row.accepted_version_id<>latest.id) THEN
   RAISE EXCEPTION 'Request requires its current submission' USING ERRCODE='23514';
  END IF;
  expected:=request_row.revision-CASE WHEN request_row.status='Submitted' THEN 1 ELSE 2 END;
  IF NOT EXISTS(SELECT 1 FROM hcm.document_upload_attempt WHERE tenant_id=NEW.tenant_id AND aggregate_id=target AND blob_id=latest.blob_id AND operation='request-submit' AND expected_revision=expected AND state='Ready') THEN
   RAISE EXCEPTION 'Request submission does not match current cycle' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END
$consistency$;
CREATE CONSTRAINT TRIGGER request_consistency AFTER INSERT OR UPDATE ON hcm.document_request DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_document_request_consistency();
CREATE CONSTRAINT TRIGGER submission_consistency AFTER INSERT ON hcm.document_request_submission DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_document_request_consistency();
