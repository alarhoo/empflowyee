-- Leave owns request drafts and their immutable calculated-day evidence. This
-- migration admits creation/read only; submission, reservation and approval
-- transitions acquire their own guarded commands, never a generic status update.
ALTER TABLE hcm.leave_enrollment ADD CONSTRAINT leave_enrollment_request_identity
  UNIQUE(tenant_id,id,employment_id,policy_version_id,period_id,tracking_mode,unit);
-- Attendance retains ownership; its immutable composite reference proves that a
-- Leave row cannot mix an ID, revision, zone and digest from different workdays.
ALTER TABLE hcm.published_workday ADD CONSTRAINT published_workday_leave_identity
  UNIQUE(tenant_id,employment_id,work_date,id,revision,resolution_digest,zone);
CREATE TABLE hcm.leave_request (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
  enrollment_id text NOT NULL, employment_id text NOT NULL, policy_version_id text NOT NULL,
  period_id text NOT NULL, tracking_mode text NOT NULL, unit text NOT NULL,
  state text NOT NULL DEFAULT 'Draft' CHECK(state='Draft'), revision integer NOT NULL DEFAULT 1 CHECK(revision=1),
  start_date date NOT NULL, end_date date NOT NULL CHECK(end_date>=start_date AND end_date-start_date<=365),
  total_units hcm.leave_units NOT NULL CHECK(total_units>=0),
  calculation_digest text NOT NULL CHECK(calculation_digest ~ '^[a-f0-9]{64}$'),
  encrypted_reason bytea NOT NULL CHECK(octet_length(encrypted_reason)>0), reason_key_version integer NOT NULL CHECK(reason_key_version>0),
  encrypted_basis bytea NOT NULL CHECK(octet_length(encrypted_basis)>0), basis_key_version integer NOT NULL CHECK(basis_key_version>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by_account_id text NOT NULL,
  creation_transaction xid8 NOT NULL DEFAULT pg_current_xact_id(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,id,employment_id),
  FOREIGN KEY(tenant_id,enrollment_id,employment_id,policy_version_id,period_id,tracking_mode,unit)
    REFERENCES hcm.leave_enrollment(tenant_id,id,employment_id,policy_version_id,period_id,tracking_mode,unit),
  FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX leave_request_employment_date ON hcm.leave_request(tenant_id,employment_id,start_date,id);
CREATE INDEX leave_request_policy_date ON hcm.leave_request(tenant_id,policy_version_id,start_date,id);

CREATE TABLE hcm.leave_request_day (
  tenant_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), request_id text NOT NULL,
  employment_id text NOT NULL, work_date date NOT NULL, portion text NOT NULL CHECK(portion IN ('Full','FirstHalf','SecondHalf','Hourly')),
  workday_id text NOT NULL, workday_revision integer NOT NULL CHECK(workday_revision>0),
  workday_digest text NOT NULL CHECK(workday_digest ~ '^[a-f0-9]{64}$'),
  zone text NOT NULL CHECK(length(zone) BETWEEN 1 AND 100),
  start_time time(3), end_time time(3), start_day_offset smallint, end_day_offset smallint,
  start_offset_seconds integer CHECK(abs(start_offset_seconds)<86400), end_offset_seconds integer CHECK(abs(end_offset_seconds)<86400),
  requested_start_at timestamptz, requested_end_at timestamptz,
  scheduled_milliseconds bigint NOT NULL CHECK(scheduled_milliseconds>=0),
  requested_milliseconds bigint NOT NULL CHECK(requested_milliseconds BETWEEN 0 AND scheduled_milliseconds),
  units hcm.leave_units NOT NULL CHECK(units>=0),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,request_id,work_date), UNIQUE(tenant_id,id,request_id),
  FOREIGN KEY(tenant_id,request_id,employment_id) REFERENCES hcm.leave_request(tenant_id,id,employment_id),
  FOREIGN KEY(tenant_id,employment_id,work_date,workday_id,workday_revision,workday_digest,zone)
    REFERENCES hcm.published_workday(tenant_id,employment_id,work_date,id,revision,resolution_digest,zone),
  CHECK((portion='Hourly' AND start_time IS NOT NULL AND end_time IS NOT NULL AND
    start_day_offset IS NOT NULL AND end_day_offset IS NOT NULL AND
    start_day_offset IN (0,1) AND end_day_offset IN (0,1) AND end_day_offset>=start_day_offset AND
    requested_start_at IS NOT NULL AND requested_end_at IS NOT NULL AND requested_end_at>requested_start_at)
    OR (portion<>'Hourly' AND start_time IS NULL AND end_time IS NULL AND start_day_offset IS NULL AND end_day_offset IS NULL AND
      start_offset_seconds IS NULL AND end_offset_seconds IS NULL AND requested_start_at IS NULL AND requested_end_at IS NULL)),
  CHECK((requested_start_at IS NULL OR requested_start_at=date_trunc('milliseconds',requested_start_at)) AND
    (requested_end_at IS NULL OR requested_end_at=date_trunc('milliseconds',requested_end_at)))
);
CREATE TABLE hcm.leave_request_day_interval (
  tenant_id text NOT NULL, day_id text NOT NULL, request_id text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>0), start_at timestamptz NOT NULL, end_at timestamptz NOT NULL CHECK(end_at>start_at),
  PRIMARY KEY(tenant_id,day_id,ordinal),
  FOREIGN KEY(tenant_id,day_id,request_id) REFERENCES hcm.leave_request_day(tenant_id,id,request_id),
  CHECK(start_at=date_trunc('milliseconds',start_at) AND end_at=date_trunc('milliseconds',end_at)),
  EXCLUDE USING gist(tenant_id WITH =,day_id WITH =,tstzrange(start_at,end_at,'[)') WITH &&)
);

-- Lock the explicit period before the policy/enrollment, matching application
-- admission and future close. No account, grant, reservation or outbox is created.
CREATE FUNCTION hcm.guard_leave_request_draft() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period hcm.leave_period; policy hcm.leave_policy_version; enrollment hcm.leave_enrollment;
BEGIN
  NEW.creation_transaction:=pg_current_xact_id();
  SELECT * INTO period FROM hcm.leave_period WHERE tenant_id=NEW.tenant_id AND id=NEW.period_id FOR SHARE;
  SELECT * INTO policy FROM hcm.leave_policy_version WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_version_id FOR SHARE;
  SELECT * INTO enrollment FROM hcm.leave_enrollment WHERE tenant_id=NEW.tenant_id AND id=NEW.enrollment_id FOR SHARE;
  IF period.id IS NULL OR policy.id IS NULL OR enrollment.id IS NULL THEN
    RAISE EXCEPTION 'Leave request basis unavailable' USING ERRCODE='23503';
  END IF;
  IF period.state<>'Open' OR policy.state<>'Published' OR enrollment.state<>'Active' OR
    NOT(period.effective_period @> daterange(NEW.start_date,NEW.end_date+1,'[)')) OR
    NOT(policy.effective_period @> daterange(NEW.start_date,NEW.end_date+1,'[)')) OR
    NOT(enrollment.effective_period @> daterange(NEW.start_date,NEW.end_date+1,'[)')) THEN
    RAISE EXCEPTION 'Leave request requires one active enrollment, published version and open period' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_request_draft_guard BEFORE INSERT ON hcm.leave_request FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_request_draft();

CREATE FUNCTION hcm.guard_leave_request_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE created_in xid8;
BEGIN
  SELECT creation_transaction INTO created_in FROM hcm.leave_request WHERE tenant_id=NEW.tenant_id AND id=NEW.request_id;
  IF created_in IS DISTINCT FROM pg_current_xact_id() THEN
    RAISE EXCEPTION 'Leave request evidence must be created with its source' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='leave_request_day' THEN
    IF NEW.portion='Hourly' THEN
      IF (NEW.requested_start_at AT TIME ZONE NEW.zone) IS DISTINCT FROM (NEW.work_date+NEW.start_day_offset+NEW.start_time) OR
         (NEW.requested_end_at AT TIME ZONE NEW.zone) IS DISTINCT FROM (NEW.work_date+NEW.end_day_offset+NEW.end_time) THEN
        RAISE EXCEPTION 'Leave hourly instants must match local endpoints' USING ERRCODE='23514';
      END IF;
      IF (NEW.start_offset_seconds IS NOT NULL AND NEW.start_offset_seconds<>
          extract(epoch FROM((NEW.requested_start_at AT TIME ZONE NEW.zone)-(NEW.requested_start_at AT TIME ZONE 'UTC')))) OR
         (NEW.end_offset_seconds IS NOT NULL AND NEW.end_offset_seconds<>
          extract(epoch FROM((NEW.requested_end_at AT TIME ZONE NEW.zone)-(NEW.requested_end_at AT TIME ZONE 'UTC')))) THEN
        RAISE EXCEPTION 'Leave offset evidence must match its actual occurrence' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_request_day_creation BEFORE INSERT ON hcm.leave_request_day FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_request_child();
CREATE TRIGGER leave_request_interval_creation BEFORE INSERT ON hcm.leave_request_day_interval FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_request_child();
CREATE FUNCTION hcm.guard_leave_request_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Leave request evidence changes require a versioned source command' USING ERRCODE='23514';
END $$;

-- Deferred reconciliation prevents a root, day total or consumed interval set
-- from committing partially. Creation and all children are one source transaction.
CREATE FUNCTION hcm.require_leave_request_days() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root hcm.leave_request; selected_id text; day_count integer; first_date date; last_date date; total numeric;
BEGIN
  IF TG_TABLE_NAME='leave_request' THEN selected_id:=NEW.id; ELSE selected_id:=NEW.request_id; END IF;
  SELECT * INTO root FROM hcm.leave_request WHERE tenant_id=NEW.tenant_id AND id=selected_id;
  SELECT count(*),min(work_date),max(work_date),coalesce(sum(units),0) INTO day_count,first_date,last_date,total
    FROM hcm.leave_request_day WHERE tenant_id=NEW.tenant_id AND request_id=selected_id;
  IF day_count NOT BETWEEN 1 AND 366 OR first_date<>root.start_date OR last_date<>root.end_date OR total<>root.total_units OR
    EXISTS(SELECT 1 FROM hcm.leave_request_day d WHERE d.tenant_id=NEW.tenant_id AND d.request_id=selected_id AND
      d.requested_milliseconds<>(SELECT coalesce(sum(extract(epoch FROM(i.end_at-i.start_at))*1000),0)
        FROM hcm.leave_request_day_interval i WHERE i.tenant_id=d.tenant_id AND i.day_id=d.id)) THEN
    RAISE EXCEPTION 'Leave request days and intervals must reconcile' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;

DO $tables$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['leave_request','leave_request_day','leave_request_day_interval'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
    EXECUTE format('CREATE TRIGGER leave_request_evidence_immutable BEFORE UPDATE OR DELETE ON hcm.%I FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_request_immutable()',relation);
    EXECUTE format('CREATE CONSTRAINT TRIGGER leave_request_days_required AFTER INSERT ON hcm.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_leave_request_days()',relation);
  END LOOP;
END $tables$;

-- Reuse the source receipt store while retaining an exact request identity.
ALTER TABLE hcm.leave_command_receipt DROP CONSTRAINT leave_command_operation,
  DROP CONSTRAINT leave_command_enrollment_shape,
  ADD COLUMN request_id text,
  ADD CONSTRAINT leave_command_request_reference FOREIGN KEY(tenant_id,request_id) REFERENCES hcm.leave_request(tenant_id,id),
  ADD CONSTRAINT leave_command_operation CHECK(operation IN ('Policy.create','Policy.update','Policy.version','Enrollment.create','Request.create')),
  ADD CONSTRAINT leave_command_subject_shape CHECK(
    (operation IN ('Enrollment.create','Request.create') AND enrollment_id IS NOT NULL AND encrypted_reason IS NOT NULL)
    OR (operation LIKE 'Policy.%' AND enrollment_id IS NULL AND request_id IS NULL)),
  ADD CONSTRAINT leave_command_request_shape CHECK((operation='Request.create')=(request_id IS NOT NULL));
