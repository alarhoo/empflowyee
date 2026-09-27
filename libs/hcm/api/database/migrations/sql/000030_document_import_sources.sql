-- Ownership: documents. Purpose-limited import source files (documents IMPORT-SOURCE-FILES#DATA),
-- delivered before the employee import migration. An import source is a CSV or XLSX file of at
-- most 5 MiB that only Employee Import stages and reads; it never becomes an employee document,
-- template or request submission, and no documents route lists or downloads it.
ALTER TABLE hcm.document_blob
  ADD COLUMN purpose text NOT NULL DEFAULT 'document' CHECK (purpose IN ('document','import-source'));
ALTER TABLE hcm.document_blob DROP CONSTRAINT document_blob_media_type_check;
ALTER TABLE hcm.document_blob
  ADD CONSTRAINT document_blob_media_type CHECK (
    (purpose = 'document' AND media_type IN ('application/pdf','image/png','image/jpeg'))
    OR (purpose = 'import-source' AND media_type IN ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        AND byte_length <= 5242880));

-- Documents, templates and request submissions accept only document-purpose files.
CREATE FUNCTION hcm.require_document_purpose_blob() RETURNS trigger LANGUAGE plpgsql AS $purpose$
BEGIN
  -- A missing or foreign blob is left to the foreign key; only another purpose is refused here.
  IF EXISTS (SELECT 1 FROM hcm.document_blob WHERE tenant_id=NEW.tenant_id AND id=NEW.blob_id AND purpose<>'document') THEN
    RAISE EXCEPTION 'Only document files can back documents' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$purpose$;
CREATE TRIGGER document_template_version_purpose BEFORE INSERT ON hcm.document_template_version
  FOR EACH ROW EXECUTE FUNCTION hcm.require_document_purpose_blob();
CREATE TRIGGER employee_document_version_purpose BEFORE INSERT ON hcm.employee_document_version
  FOR EACH ROW EXECUTE FUNCTION hcm.require_document_purpose_blob();
CREATE TRIGGER document_request_submission_purpose BEFORE INSERT ON hcm.document_request_submission
  FOR EACH ROW EXECUTE FUNCTION hcm.require_document_purpose_blob();
CREATE TRIGGER document_upload_attempt_purpose BEFORE INSERT ON hcm.document_upload_attempt
  FOR EACH ROW EXECUTE FUNCTION hcm.require_document_purpose_blob();
