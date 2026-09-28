-- Attendance-owned outcomes bind exact workday publication to a real durable
-- resolution intent. Explicit migration only; neither worker nor API runs DDL.
CREATE TABLE hcm.attendance_workday_resolution_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  outbox_id text NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  lease_fence bigint NOT NULL CHECK (lease_fence BETWEEN 1 AND 9007199254740991),
  workload_run_id uuid NOT NULL,
  result_schema smallint NOT NULL DEFAULT 1 CHECK (result_schema=1),
  state text NOT NULL CHECK (state IN ('Available','Unavailable')),
  workday_id text,
  result_code text NOT NULL CHECK (result_code ~ '^[A-Za-z][A-Za-z0-9-]{0,79}$'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=1048576),
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,outbox_id),
  FOREIGN KEY (tenant_id,outbox_id) REFERENCES hcm.attendance_outbox(tenant_id,id),
  FOREIGN KEY (tenant_id,workday_id) REFERENCES hcm.published_workday(tenant_id,id),
  CHECK ((state='Available' AND workday_id IS NOT NULL AND result_code='Resolved')
    OR (state='Unavailable' AND workday_id IS NULL AND result_code<>'Resolved'))
);
CREATE INDEX attendance_resolution_workday ON hcm.attendance_workday_resolution_receipt(tenant_id,workday_id)
  WHERE workday_id IS NOT NULL;

-- Insertion requires the currently held live lease and exact immutable intent.
CREATE FUNCTION hcm.guard_attendance_resolution_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,hcm AS $body$
DECLARE intent hcm.attendance_outbox%ROWTYPE;
DECLARE workday hcm.published_workday%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'Resolution outcomes are immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO intent FROM hcm.attendance_outbox
    WHERE tenant_id=NEW.tenant_id AND id=NEW.outbox_id;
  IF NOT FOUND OR intent.workload<>'AttendanceResolve' OR intent.kind<>'attendance.workday.resolve'
    OR intent.schema_version<>1 OR intent.digest<>NEW.request_digest
    OR intent.state<>'Leased' OR intent.fence<>NEW.lease_fence
    OR intent.lease_owner IS DISTINCT FROM NEW.workload_run_id
    OR intent.lease_until<=clock_timestamp() THEN
    RAISE EXCEPTION 'Resolution lease unavailable' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Available' THEN
    SELECT * INTO workday FROM hcm.published_workday WHERE tenant_id=NEW.tenant_id AND id=NEW.workday_id;
    IF NOT FOUND OR workday.employment_id IS DISTINCT FROM (intent.payload->>'employmentId')
      OR to_char(workday.work_date,'YYYY-MM-DD') IS DISTINCT FROM (intent.payload->>'workDate')
      OR workday.input_digest IS DISTINCT FROM (intent.payload->>'inputDigest') THEN
      RAISE EXCEPTION 'Resolution workday basis mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_resolution_guard BEFORE INSERT OR UPDATE OR DELETE
  ON hcm.attendance_workday_resolution_receipt FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_resolution_receipt();

-- A receipt cannot commit without its same-fence outbox completion. Runtime's
-- completion statement independently checks lease expiry and writes audit.
CREATE FUNCTION hcm.require_attendance_resolution_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,hcm AS $body$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM hcm.attendance_outbox WHERE tenant_id=NEW.tenant_id AND id=NEW.outbox_id
    AND state='Completed' AND digest=NEW.request_digest AND fence=NEW.lease_fence) THEN
    RAISE EXCEPTION 'Resolution outcome requires atomic completion' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END
$body$;
CREATE CONSTRAINT TRIGGER attendance_resolution_completion AFTER INSERT ON hcm.attendance_workday_resolution_receipt
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_attendance_resolution_completion();

ALTER TABLE hcm.attendance_workday_resolution_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.attendance_workday_resolution_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.attendance_workday_resolution_receipt TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.attendance_workday_resolution_receipt TO hcm_runtime;
