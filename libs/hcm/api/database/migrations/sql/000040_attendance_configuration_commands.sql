-- Attendance owns command receipts and configuration impact evidence. Runtime
-- changes are explicit; neither API nor worker startup applies this migration.
CREATE TABLE hcm.attendance_command_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL DEFAULT gen_random_uuid()::text CHECK (length(id) BETWEEN 1 AND 200),
  actor_kind text NOT NULL DEFAULT 'Human' CHECK (actor_kind IN ('Human','Workload')),
  actor_account_id text,
  workload_code text CHECK (workload_code IN ('AttendanceResolve','AttendanceCalculate','AttendanceReconcile')),
  workload_run_id uuid,
  actor_key text GENERATED ALWAYS AS (CASE WHEN actor_kind='Human' THEN 'Human:'||actor_account_id ELSE 'Workload:'||workload_code END) STORED,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 100),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  result_schema smallint NOT NULL DEFAULT 1 CHECK (result_schema=1),
  response jsonb NOT NULL CHECK (jsonb_typeof(response)='object' AND octet_length(response::text)<=65536),
  source_revision integer CHECK (source_revision>0),
  work_schedule_version_id text,
  shift_version_id text,
  attendance_policy_version_id text,
  holiday_calendar_version_id text,
  encrypted_reason bytea,
  reason_key_version integer CHECK (reason_key_version>0),
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,actor_key,operation,idempotency_key),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,work_schedule_version_id) REFERENCES hcm.work_schedule_version(tenant_id,id),
  FOREIGN KEY (tenant_id,shift_version_id) REFERENCES hcm.shift_version(tenant_id,id),
  FOREIGN KEY (tenant_id,attendance_policy_version_id) REFERENCES hcm.attendance_policy_version(tenant_id,id),
  FOREIGN KEY (tenant_id,holiday_calendar_version_id) REFERENCES hcm.holiday_calendar_version(tenant_id,id),
  CHECK ((actor_kind='Human' AND actor_account_id IS NOT NULL AND workload_code IS NULL AND workload_run_id IS NULL)
    OR (actor_kind='Workload' AND actor_account_id IS NULL AND workload_code IS NOT NULL AND workload_run_id IS NOT NULL)),
  CHECK (num_nonnulls(work_schedule_version_id,shift_version_id,attendance_policy_version_id,holiday_calendar_version_id)<=1),
  CHECK (num_nonnulls(work_schedule_version_id,shift_version_id,attendance_policy_version_id,holiday_calendar_version_id)=0 OR source_revision IS NOT NULL),
  CHECK ((encrypted_reason IS NULL)=(reason_key_version IS NULL)),
  CHECK (encrypted_reason IS NULL OR octet_length(encrypted_reason) BETWEEN 30 AND 10000)
);

CREATE TABLE hcm.time_configuration_impact_preview (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  actor_account_id text NOT NULL,
  work_schedule_version_id text,
  shift_version_id text,
  attendance_policy_version_id text,
  holiday_calendar_version_id text,
  source_revision integer NOT NULL CHECK (source_revision>0),
  input_schema smallint NOT NULL DEFAULT 1 CHECK (input_schema=1),
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  from_date date NOT NULL,
  to_date date NOT NULL,
  state text NOT NULL CHECK (state IN ('Running','Ready','Failed','Expired','Consumed')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  input_revisions jsonb NOT NULL CHECK (jsonb_typeof(input_revisions)='array' AND octet_length(input_revisions::text)<=65536),
  result_digest text CHECK (result_digest ~ '^[a-f0-9]{64}$'),
  affected_employment_count integer CHECK (affected_employment_count>=0),
  affected_workday_count integer CHECK (affected_workday_count>=0),
  conflict_count integer CHECK (conflict_count>=0),
  locked_impact boolean,
  safe_failure_code text CHECK (safe_failure_code ~ '^[A-Za-z][A-Za-z0-9-]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,work_schedule_version_id) REFERENCES hcm.work_schedule_version(tenant_id,id),
  FOREIGN KEY (tenant_id,shift_version_id) REFERENCES hcm.shift_version(tenant_id,id),
  FOREIGN KEY (tenant_id,attendance_policy_version_id) REFERENCES hcm.attendance_policy_version(tenant_id,id),
  FOREIGN KEY (tenant_id,holiday_calendar_version_id) REFERENCES hcm.holiday_calendar_version(tenant_id,id),
  CHECK (num_nonnulls(work_schedule_version_id,shift_version_id,attendance_policy_version_id,holiday_calendar_version_id)=1),
  CHECK (to_date>=from_date AND to_date-from_date<=365),
  CHECK (expires_at>created_at),
  CHECK ((state='Consumed')=(consumed_at IS NOT NULL)),
  CHECK (state NOT IN ('Ready','Consumed') OR
    (result_digest IS NOT NULL AND affected_employment_count IS NOT NULL AND affected_workday_count IS NOT NULL AND conflict_count IS NOT NULL AND locked_impact IS NOT NULL)),
  CHECK (state<>'Failed' OR safe_failure_code IS NOT NULL)
);
CREATE INDEX attendance_impact_actor_state ON hcm.time_configuration_impact_preview(tenant_id,actor_account_id,state,expires_at,id);

-- Preview inputs cannot be retargeted. Only bounded result completion and explicit
-- lifecycle transitions are mutable; consumed/failed/expired evidence is final.
CREATE FUNCTION hcm.guard_attendance_impact_preview() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE source_table text;
DECLARE source_id text;
DECLARE current_revision integer;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state NOT IN ('Running','Ready') THEN RAISE EXCEPTION 'Invalid initial preview state' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1
    OR (to_jsonb(NEW)-ARRAY['state','revision','result_digest','affected_employment_count','affected_workday_count','conflict_count','locked_impact','safe_failure_code','consumed_at'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','result_digest','affected_employment_count','affected_workday_count','conflict_count','locked_impact','safe_failure_code','consumed_at']) THEN
    RAISE EXCEPTION 'Preview input evidence is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state='Running' AND NEW.state IN ('Ready','Failed','Expired') THEN RETURN NEW; END IF;
  IF OLD.state='Ready' AND NEW.state IN ('Consumed','Expired') THEN
    IF (to_jsonb(NEW)-ARRAY['state','revision','consumed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','consumed_at']) THEN
      RAISE EXCEPTION 'Ready preview result is immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.state='Consumed' AND (clock_timestamp()>=OLD.expires_at OR OLD.conflict_count<>0 OR OLD.locked_impact) THEN
      RAISE EXCEPTION 'Preview cannot be consumed' USING ERRCODE='23514';
    END IF;
    IF NEW.state='Consumed' THEN
      source_table:=CASE WHEN OLD.work_schedule_version_id IS NOT NULL THEN 'work_schedule_version'
        WHEN OLD.shift_version_id IS NOT NULL THEN 'shift_version'
        WHEN OLD.attendance_policy_version_id IS NOT NULL THEN 'attendance_policy_version' ELSE 'holiday_calendar_version' END;
      source_id:=coalesce(OLD.work_schedule_version_id,OLD.shift_version_id,OLD.attendance_policy_version_id,OLD.holiday_calendar_version_id);
      EXECUTE format('SELECT revision FROM hcm.%I WHERE tenant_id=$1 AND id=$2 FOR UPDATE',source_table)
        INTO current_revision USING OLD.tenant_id,source_id;
      IF current_revision IS DISTINCT FROM OLD.source_revision THEN
        RAISE EXCEPTION 'Preview source revision changed' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid preview transition' USING ERRCODE='23514';
END
$body$;
CREATE TRIGGER attendance_impact_lifecycle BEFORE INSERT OR UPDATE ON hcm.time_configuration_impact_preview
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_impact_preview();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['attendance_command_receipt','time_configuration_impact_preview'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
GRANT UPDATE(state,revision,result_digest,affected_employment_count,affected_workday_count,conflict_count,locked_impact,safe_failure_code,consumed_at)
  ON hcm.time_configuration_impact_preview TO hcm_runtime;
