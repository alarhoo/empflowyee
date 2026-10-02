-- Attendance owns immutable, explicit employment/timezone context for durable
-- holiday publication reviews. DEC-HCM3-024 forbids timezone inference.
CREATE TABLE hcm.holiday_publication_context (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  preview_id text NOT NULL,
  employment_id text NOT NULL,
  timezone text NOT NULL CHECK (length(timezone) BETWEEN 1 AND 200),
  PRIMARY KEY (tenant_id,preview_id),
  FOREIGN KEY (tenant_id,preview_id) REFERENCES hcm.time_configuration_impact_preview(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id)
);
ALTER TABLE hcm.holiday_publication_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.holiday_publication_context FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.holiday_publication_context TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.holiday_publication_context TO hcm_runtime;

-- Bind context only to a newly admitted Holiday preview. It cannot be retargeted
-- after worker validation or attached to another configuration family.
CREATE FUNCTION hcm.guard_holiday_publication_context() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,hcm AS $body$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Holiday context is immutable' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM hcm.time_configuration_impact_preview p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.preview_id AND p.holiday_calendar_version_id IS NOT NULL AND p.state='Running')
  THEN RAISE EXCEPTION 'Holiday preview context unavailable' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone)
  THEN RAISE EXCEPTION 'Timezone unavailable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER holiday_publication_context_guard BEFORE INSERT OR UPDATE OR DELETE ON hcm.holiday_publication_context
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_holiday_publication_context();
