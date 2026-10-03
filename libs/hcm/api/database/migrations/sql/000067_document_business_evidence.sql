-- Documents owns purpose-limited private evidence. Business sources own authorization
-- and source identity; a stored subject/classification cannot be rebound or downgraded.
ALTER TABLE hcm.document_blob DROP CONSTRAINT document_blob_purpose;
ALTER TABLE hcm.document_blob ADD CONSTRAINT document_blob_purpose CHECK
 (purpose IN ('document','import-source','service-attachment','AttendanceEvidence','LeaveEvidence'));
ALTER TABLE hcm.document_blob DROP CONSTRAINT document_blob_media_type;
ALTER TABLE hcm.document_blob ADD CONSTRAINT document_blob_media_type CHECK (
 (purpose IN ('document','service-attachment','AttendanceEvidence','LeaveEvidence') AND media_type IN ('application/pdf','image/png','image/jpeg'))
 OR (purpose='import-source' AND media_type IN ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') AND byte_length<=5242880));
CREATE TABLE hcm.document_business_evidence (
 tenant_id text NOT NULL, id uuid NOT NULL, blob_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('AttendanceEvidence','LeaveEvidence')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 512),
 classification text NOT NULL CHECK(classification IN ('General','Confidential','Restricted')),
 uploader_account_id text NOT NULL, command_key uuid NOT NULL,
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 validation text NOT NULL CHECK(validation IN ('Pending','Clean','Blocked')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,blob_id), UNIQUE(tenant_id,uploader_account_id,command_key),
 FOREIGN KEY(tenant_id,blob_id) REFERENCES hcm.document_blob(tenant_id,id),
 FOREIGN KEY(tenant_id,uploader_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.document_evidence_attachment (
 tenant_id text NOT NULL, evidence_id uuid NOT NULL, source_id text NOT NULL CHECK(length(source_id) BETWEEN 1 AND 200),
 attached_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,evidence_id),
 FOREIGN KEY(tenant_id,evidence_id) REFERENCES hcm.document_business_evidence(tenant_id,id)
);
-- Clean means existing bounded format/signature and integrity checks passed. It is
-- not an antivirus attestation. Pending/Blocked rows cannot back a business source.
CREATE FUNCTION hcm.guard_business_evidence() RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Evidence is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='document_business_evidence' THEN
  IF NOT EXISTS(SELECT 1 FROM hcm.document_blob b WHERE b.tenant_id=NEW.tenant_id AND b.id=NEW.blob_id AND b.purpose=NEW.purpose AND b.created_by_account_id=NEW.uploader_account_id AND (NEW.validation<>'Clean' OR b.state='Ready')) THEN
   RAISE EXCEPTION 'Evidence requires matching owned bytes' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM hcm.document_business_evidence e JOIN hcm.document_blob b ON b.tenant_id=e.tenant_id AND b.id=e.blob_id WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.evidence_id AND e.validation='Clean' AND b.state='Ready') THEN
   RAISE EXCEPTION 'Attachment requires clean evidence' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END
$guard$;
DO $policies$
DECLARE relation text;
BEGIN
 FOREACH relation IN ARRAY ARRAY['document_business_evidence','document_evidence_attachment'] LOOP
  EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id())',relation);
  EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  EXECUTE format('CREATE TRIGGER business_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON hcm.%I FOR EACH ROW EXECUTE FUNCTION hcm.guard_business_evidence()',relation);
 END LOOP;
END
$policies$;
