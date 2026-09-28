-- Attendance owns immutable scheduled-workday evidence. Roster/override sources
-- are added by their owning slices; no placeholder or arbitrary source IDs exist.
CREATE TABLE hcm.published_workday (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  employment_id text NOT NULL,
  work_date date NOT NULL CHECK (work_date BETWEEN date '0001-01-01' AND date '9999-12-31'),
  zone text NOT NULL CHECK (length(zone) BETWEEN 1 AND 120),
  schedule_kind text NOT NULL CHECK (schedule_kind IN ('Work','Rest')),
  work_schedule_version_id text NOT NULL,
  attendance_policy_version_id text,
  revision integer NOT NULL CHECK (revision>0),
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  resolution_digest text NOT NULL CHECK (resolution_digest ~ '^[a-f0-9]{64}$'),
  scheduled_work_milliseconds bigint NOT NULL CHECK (scheduled_work_milliseconds>=0),
  break_milliseconds bigint NOT NULL CHECK (break_milliseconds>=0),
  expected_work_milliseconds bigint NOT NULL CHECK (expected_work_milliseconds BETWEEN 0 AND scheduled_work_milliseconds),
  supersedes_id text,
  workload_run_id uuid NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  creation_transaction xid8 NOT NULL DEFAULT pg_current_xact_id(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,employment_id,work_date,id),
  UNIQUE (tenant_id,employment_id,work_date,revision),
  UNIQUE (tenant_id,employment_id,work_date,resolution_digest),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,work_schedule_version_id) REFERENCES hcm.work_schedule_version(tenant_id,id),
  FOREIGN KEY (tenant_id,attendance_policy_version_id) REFERENCES hcm.attendance_policy_version(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id,work_date,supersedes_id) REFERENCES hcm.published_workday(tenant_id,employment_id,work_date,id),
  CHECK ((revision=1)=(supersedes_id IS NULL)),
  CHECK (id IS DISTINCT FROM supersedes_id)
);
CREATE TABLE hcm.published_workday_holiday_source (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  workday_id text NOT NULL,
  calendar_version_id text NOT NULL,
  PRIMARY KEY (tenant_id,workday_id,calendar_version_id),
  FOREIGN KEY (tenant_id,workday_id) REFERENCES hcm.published_workday(tenant_id,id),
  FOREIGN KEY (tenant_id,calendar_version_id) REFERENCES hcm.holiday_calendar_version(tenant_id,id)
);
ALTER TABLE hcm.holiday ADD CONSTRAINT holiday_version_identity UNIQUE (tenant_id,version_id,id);
CREATE TABLE hcm.published_work_segment (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  workday_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>0),
  kind text NOT NULL CHECK (kind IN ('Work','UnpaidBreak','Holiday','ExpectedWork')),
  lane text GENERATED ALWAYS AS (CASE WHEN kind IN ('Work','UnpaidBreak') THEN 'Schedule' ELSE kind END) STORED,
  start_at timestamptz NOT NULL CHECK (isfinite(start_at) AND date_trunc('milliseconds',start_at)=start_at),
  end_at timestamptz NOT NULL CHECK (isfinite(end_at) AND date_trunc('milliseconds',end_at)=end_at),
  start_local timestamp NOT NULL,
  end_local timestamp NOT NULL,
  start_offset_seconds integer NOT NULL CHECK (abs(start_offset_seconds::bigint)<86400),
  end_offset_seconds integer NOT NULL CHECK (abs(end_offset_seconds::bigint)<86400),
  holiday_calendar_version_id text,
  holiday_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,workday_id,ordinal),
  FOREIGN KEY (tenant_id,workday_id) REFERENCES hcm.published_workday(tenant_id,id),
  FOREIGN KEY (tenant_id,workday_id,holiday_calendar_version_id) REFERENCES hcm.published_workday_holiday_source(tenant_id,workday_id,calendar_version_id),
  FOREIGN KEY (tenant_id,holiday_calendar_version_id,holiday_id) REFERENCES hcm.holiday(tenant_id,version_id,id),
  CHECK (end_at>start_at),
  CHECK ((kind='Holiday' AND holiday_calendar_version_id IS NOT NULL AND holiday_id IS NOT NULL)
    OR (kind<>'Holiday' AND holiday_calendar_version_id IS NULL AND holiday_id IS NULL)),
  EXCLUDE USING gist (tenant_id WITH =,workday_id WITH =,lane WITH =,tstzrange(start_at,end_at,'[)') WITH &&)
);

-- Serialize new revisions after the tenant authority and monthly period fence.
-- Immutable versions are selected exactly; no latest-root substitution occurs.
CREATE FUNCTION hcm.guard_published_workday() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE prior_id text;
DECLARE prior_revision integer;
DECLARE period_state text;
BEGIN
  PERFORM hcm.fence_attendance_month(NEW.tenant_id,date_trunc('month',NEW.work_date::timestamp)::date,false);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id||':workday:'||NEW.employment_id||':'||to_char(NEW.work_date,'YYYY-MM-DD'),0));
  SELECT state INTO period_state FROM hcm.attendance_period
    WHERE tenant_id=NEW.tenant_id AND month_start=date_trunc('month',NEW.work_date::timestamp)::date;
  IF period_state IN ('Closing','Locked','Reopened') THEN
    RAISE EXCEPTION 'Period does not allow ordinary workday publication' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW.zone) THEN
    RAISE EXCEPTION 'Workday timezone unavailable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hcm.work_schedule_version v
    JOIN hcm.work_schedule s ON s.tenant_id=v.tenant_id AND s.id=v.schedule_id
    JOIN hcm.work_schedule_day d ON d.tenant_id=v.tenant_id AND d.version_id=v.id
    WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.work_schedule_version_id AND v.state='Published'
      AND NOT s.is_template AND v.effective_period @> NEW.work_date
      AND d.weekday=extract(isodow FROM NEW.work_date) AND d.kind=NEW.schedule_kind
      AND (v.timezone_mode<>'Fixed' OR v.fixed_zone=NEW.zone)) THEN
    RAISE EXCEPTION 'Published schedule basis unavailable' USING ERRCODE='23514';
  END IF;
  IF NEW.attendance_policy_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM hcm.attendance_policy_version WHERE tenant_id=NEW.tenant_id
      AND id=NEW.attendance_policy_version_id AND state='Published' AND effective_period @> NEW.work_date) THEN
    RAISE EXCEPTION 'Published policy basis unavailable' USING ERRCODE='23514';
  END IF;
  SELECT id,revision INTO prior_id,prior_revision FROM hcm.published_workday
    WHERE tenant_id=NEW.tenant_id AND employment_id=NEW.employment_id AND work_date=NEW.work_date
    ORDER BY revision DESC LIMIT 1;
  IF NEW.revision<>coalesce(prior_revision,0)+1 OR NEW.supersedes_id IS DISTINCT FROM prior_id THEN
    RAISE EXCEPTION 'Exact previous workday revision required' USING ERRCODE='23514';
  END IF;
  NEW.creation_transaction:=pg_current_xact_id();
  RETURN NEW;
END
$body$;
CREATE TRIGGER published_workday_guard BEFORE INSERT ON hcm.published_workday
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_published_workday();

-- Children can only join the parent's creation transaction. Runtime cannot add
-- late segments to a historical result, even when it still knows that result ID.
CREATE FUNCTION hcm.guard_published_workday_child() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE parent hcm.published_workday%ROWTYPE;
BEGIN
  SELECT * INTO parent FROM hcm.published_workday WHERE tenant_id=NEW.tenant_id AND id=NEW.workday_id;
  IF parent.id IS NULL THEN RAISE EXCEPTION 'Workday unavailable' USING ERRCODE='23503'; END IF;
  IF parent.creation_transaction<>pg_current_xact_id() THEN
    RAISE EXCEPTION 'Published workday children are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='published_workday_holiday_source' THEN
    IF NOT EXISTS (SELECT 1 FROM hcm.holiday_calendar_version WHERE tenant_id=NEW.tenant_id
      AND id=NEW.calendar_version_id AND state='Published'
      AND (effective_period @> parent.work_date OR effective_period @> (parent.work_date+1))) THEN
      RAISE EXCEPTION 'Published holiday basis unavailable' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.start_local IS DISTINCT FROM (NEW.start_at AT TIME ZONE parent.zone)
      OR NEW.end_local IS DISTINCT FROM (NEW.end_at AT TIME ZONE parent.zone)
      OR NEW.start_offset_seconds IS DISTINCT FROM extract(epoch FROM ((NEW.start_at AT TIME ZONE parent.zone)-(NEW.start_at AT TIME ZONE 'UTC')))::integer
      OR NEW.end_offset_seconds IS DISTINCT FROM extract(epoch FROM ((NEW.end_at AT TIME ZONE parent.zone)-(NEW.end_at AT TIME ZONE 'UTC')))::integer THEN
      RAISE EXCEPTION 'Workday instant/local/offset mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER published_workday_holiday_guard BEFORE INSERT ON hcm.published_workday_holiday_source
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_published_workday_child();
CREATE TRIGGER published_work_segment_guard BEFORE INSERT ON hcm.published_work_segment
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_published_workday_child();

-- Repeat deferred validation on child insertion as well as parent insertion so
-- SET CONSTRAINTS IMMEDIATE cannot bypass completeness inside the same transaction.
CREATE FUNCTION hcm.validate_published_workday() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE parent_id text;
DECLARE parent hcm.published_workday%ROWTYPE;
DECLARE work_ranges tstzmultirange;
DECLARE break_ranges tstzmultirange;
DECLARE holiday_ranges tstzmultirange;
DECLARE expected_ranges tstzmultirange;
DECLARE schedule_ranges tstzmultirange;
DECLARE work_ms numeric;
DECLARE break_ms numeric;
DECLARE expected_ms numeric;
DECLARE segment_count integer;
DECLARE first_ordinal integer;
DECLARE last_ordinal integer;
DECLARE start_date date;
DECLARE end_date date;
BEGIN
  IF TG_TABLE_NAME='published_workday' THEN parent_id:=NEW.id; ELSE parent_id:=NEW.workday_id; END IF;
  SELECT * INTO parent FROM hcm.published_workday WHERE tenant_id=NEW.tenant_id AND id=parent_id;
  SELECT coalesce(range_agg(tstzrange(start_at,end_at,'[)')) FILTER(WHERE kind='Work'),'{}'::tstzmultirange),
    coalesce(range_agg(tstzrange(start_at,end_at,'[)')) FILTER(WHERE kind='UnpaidBreak'),'{}'::tstzmultirange),
    coalesce(range_agg(tstzrange(start_at,end_at,'[)')) FILTER(WHERE kind='Holiday'),'{}'::tstzmultirange),
    coalesce(range_agg(tstzrange(start_at,end_at,'[)')) FILTER(WHERE kind='ExpectedWork'),'{}'::tstzmultirange),
    coalesce(sum(extract(epoch FROM(end_at-start_at))*1000) FILTER(WHERE kind='Work'),0),
    coalesce(sum(extract(epoch FROM(end_at-start_at))*1000) FILTER(WHERE kind='UnpaidBreak'),0),
    coalesce(sum(extract(epoch FROM(end_at-start_at))*1000) FILTER(WHERE kind='ExpectedWork'),0),
    count(*),min(ordinal),max(ordinal),
    min(start_local::date) FILTER(WHERE kind IN ('Work','UnpaidBreak')),
    max(end_local::date) FILTER(WHERE kind IN ('Work','UnpaidBreak'))
  INTO work_ranges,break_ranges,holiday_ranges,expected_ranges,work_ms,break_ms,expected_ms,
    segment_count,first_ordinal,last_ordinal,start_date,end_date
  FROM hcm.published_work_segment WHERE tenant_id=NEW.tenant_id AND workday_id=parent_id;
  schedule_ranges:=work_ranges+break_ranges;
  IF (segment_count>0 AND (first_ordinal<>1 OR last_ordinal<>segment_count))
    OR work_ms<>parent.scheduled_work_milliseconds OR break_ms<>parent.break_milliseconds
    OR expected_ms<>parent.expected_work_milliseconds OR expected_ranges<>(work_ranges-holiday_ranges)
    OR (parent.schedule_kind='Rest' AND schedule_ranges<>'{}'::tstzmultirange)
    OR (parent.schedule_kind='Work' AND (work_ranges='{}'::tstzmultirange
      OR schedule_ranges<>tstzmultirange(range_merge(schedule_ranges))
      OR lower(work_ranges)<>lower(schedule_ranges) OR upper(work_ranges)<>upper(schedule_ranges)
      OR start_date<>parent.work_date OR end_date>parent.work_date+1)) THEN
    RAISE EXCEPTION 'Incomplete or inconsistent workday intervals' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END
$body$;
CREATE CONSTRAINT TRIGGER published_workday_complete AFTER INSERT ON hcm.published_workday
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.validate_published_workday();
CREATE CONSTRAINT TRIGGER published_work_segment_complete AFTER INSERT ON hcm.published_work_segment
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.validate_published_workday();
CREATE CONSTRAINT TRIGGER published_workday_holiday_complete AFTER INSERT ON hcm.published_workday_holiday_source
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.validate_published_workday();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['published_workday','published_workday_holiday_source','published_work_segment'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
