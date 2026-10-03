-- Attendance owns immutable context for real schedule/shift publication review.
-- These are proposed-source validation inputs, not published assignments/workdays.
CREATE TABLE hcm.dated_configuration_publication_context (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  preview_id text NOT NULL,
  employment_id text NOT NULL,
  family text NOT NULL CHECK (family IN ('Schedule','Shift')),
  PRIMARY KEY (tenant_id,preview_id),
  FOREIGN KEY (tenant_id,preview_id) REFERENCES hcm.time_configuration_impact_preview(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id)
);
ALTER TABLE hcm.dated_configuration_publication_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.dated_configuration_publication_context FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.dated_configuration_publication_context TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.dated_configuration_publication_context TO hcm_runtime;

-- Context must match exactly one newly admitted typed source and cannot be retargeted.
CREATE FUNCTION hcm.guard_dated_configuration_context() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,hcm AS $body$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Dated context is immutable' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM hcm.time_configuration_impact_preview p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.preview_id AND p.state='Running'
    AND ((NEW.family='Schedule' AND p.work_schedule_version_id IS NOT NULL) OR (NEW.family='Shift' AND p.shift_version_id IS NOT NULL)))
  THEN RAISE EXCEPTION 'Dated preview source unavailable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER dated_configuration_context_guard BEFORE INSERT OR UPDATE OR DELETE ON hcm.dated_configuration_publication_context
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_dated_configuration_context();
