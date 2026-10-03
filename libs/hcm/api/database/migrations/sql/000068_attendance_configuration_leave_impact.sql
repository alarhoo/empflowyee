-- Persist only safe Leave-owned counts and opaque calculation evidence alongside
-- a dated Attendance publication preview. Existing previews remain historical.
CREATE TABLE hcm.attendance_configuration_leave_impact (
  tenant_id text NOT NULL,
  preview_id text NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  affected_request_count integer NOT NULL CHECK (affected_request_count>=0),
  changed_request_count integer NOT NULL CHECK (changed_request_count BETWEEN 0 AND affected_request_count),
  unavailable_request_count integer NOT NULL CHECK (unavailable_request_count BETWEEN 0 AND affected_request_count),
  PRIMARY KEY (tenant_id,preview_id),
  FOREIGN KEY (tenant_id,preview_id) REFERENCES hcm.dated_configuration_publication_context(tenant_id,preview_id)
);
ALTER TABLE hcm.attendance_configuration_leave_impact ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.attendance_configuration_leave_impact FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.attendance_configuration_leave_impact TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.attendance_configuration_leave_impact TO hcm_runtime;

-- Completion writes evidence once while the parent is Running. No later actor,
-- including a privileged migration role, can replace or delete historical proof.
CREATE FUNCTION hcm.guard_configuration_leave_impact() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'Leave impact evidence is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM hcm.time_configuration_impact_preview
    WHERE tenant_id=NEW.tenant_id AND id=NEW.preview_id AND state='Running' FOR UPDATE) THEN
    RAISE EXCEPTION 'Leave impact requires a running dated preview' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER configuration_leave_impact_guard BEFORE INSERT OR UPDATE OR DELETE
  ON hcm.attendance_configuration_leave_impact FOR EACH ROW EXECUTE FUNCTION hcm.guard_configuration_leave_impact();
