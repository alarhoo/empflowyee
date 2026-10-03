-- Attendance-owned dated sources required by Work Schedules resolution. Roster
-- entry lifecycle is derived from its parent; no second mutable publication flag.
CREATE TABLE hcm.shift_roster (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  from_date date NOT NULL CHECK (from_date BETWEEN date '0001-01-01' AND date '9999-12-31'),
  to_date date NOT NULL CHECK (to_date BETWEEN from_date AND from_date+365),
  state text NOT NULL DEFAULT 'Draft' CHECK (state IN ('Draft','PendingApproval','Published','Rejected','Cancelled','Superseded')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  supersedes_id text,
  publication_digest text CHECK (publication_digest ~ '^[a-f0-9]{64}$'),
  published_at timestamptz,
  published_by_account_id text,
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_id) REFERENCES hcm.shift_roster(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (id IS DISTINCT FROM supersedes_id),
  CHECK ((state IN ('Published','Superseded'))=(publication_digest IS NOT NULL AND published_at IS NOT NULL AND published_by_account_id IS NOT NULL))
);
CREATE TABLE hcm.shift_roster_entry (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  roster_id text NOT NULL,
  employment_id text NOT NULL,
  assignment_id text,
  work_date date NOT NULL CHECK (work_date BETWEEN date '0001-01-01' AND date '9999-12-31'),
  shift_version_id text NOT NULL,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,roster_id,employment_id,work_date),
  UNIQUE (tenant_id,employment_id,work_date,id),
  FOREIGN KEY (tenant_id,roster_id) REFERENCES hcm.shift_roster(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,shift_version_id) REFERENCES hcm.shift_version(tenant_id,id)
);
CREATE INDEX shift_roster_entry_date ON hcm.shift_roster_entry(tenant_id,employment_id,work_date);

-- An override retains the exact previously reviewed workday and policy basis.
-- Private reason/evidence admission remains with the owning command and cipher.
CREATE TABLE hcm.schedule_override (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  employment_id text NOT NULL,
  work_date date NOT NULL CHECK (work_date BETWEEN date '0001-01-01' AND date '9999-12-31'),
  basis_workday_id text NOT NULL,
  zone text NOT NULL CHECK (length(zone) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('Work','Rest')),
  state text NOT NULL DEFAULT 'Draft' CHECK (state IN ('Draft','Approved','Cancelled','Superseded')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  supersedes_id text,
  approval_digest text CHECK (approval_digest ~ '^[a-f0-9]{64}$'),
  approved_at timestamptz,
  approved_by_account_id text,
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,employment_id,work_date,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id,work_date,basis_workday_id) REFERENCES hcm.published_workday(tenant_id,employment_id,work_date,id),
  FOREIGN KEY (tenant_id,employment_id,work_date,supersedes_id) REFERENCES hcm.schedule_override(tenant_id,employment_id,work_date,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,approved_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (id IS DISTINCT FROM supersedes_id),
  CHECK ((approval_digest IS NULL)=(approved_at IS NULL) AND (approval_digest IS NULL)=(approved_by_account_id IS NULL)),
  CHECK (state NOT IN ('Approved','Superseded') OR approval_digest IS NOT NULL),
  CHECK (state<>'Draft' OR approval_digest IS NULL)
);
CREATE UNIQUE INDEX schedule_override_approved_date ON hcm.schedule_override(tenant_id,employment_id,work_date) WHERE state='Approved';
CREATE TABLE hcm.schedule_override_segment (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  override_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>0),
  kind text NOT NULL CHECK (kind IN ('Work','UnpaidBreak')),
  start_time time NOT NULL,
  end_time time NOT NULL,
  start_day_offset integer NOT NULL CHECK (start_day_offset IN (0,1)),
  end_day_offset integer NOT NULL CHECK (end_day_offset IN (0,1)),
  start_overlap_choice text CHECK (start_overlap_choice IN ('Earlier','Later')),
  end_overlap_choice text CHECK (end_overlap_choice IN ('Earlier','Later')),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,override_id,ordinal),
  FOREIGN KEY (tenant_id,override_id) REFERENCES hcm.schedule_override(tenant_id,id),
  CHECK (extract(microseconds FROM start_time)::bigint % 1000=0 AND extract(microseconds FROM end_time)::bigint % 1000=0),
  CHECK (start_time<'24:00'::time AND end_time<'24:00'::time),
  CHECK (end_day_offset>=start_day_offset),
  CHECK ((end_day_offset*86400+extract(epoch FROM end_time))>(start_day_offset*86400+extract(epoch FROM start_time))
    OR (start_overlap_choice IS NOT NULL AND end_overlap_choice IS NOT NULL AND start_overlap_choice='Earlier' AND end_overlap_choice='Later'))
);

-- Keep dated children editable only while their exact owner remains a Draft.
CREATE FUNCTION hcm.guard_dated_work_source_child() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE owner_id text;
DECLARE owner_state text;
BEGIN
  IF TG_TABLE_NAME='shift_roster_entry' THEN
    owner_id:=CASE WHEN TG_OP='DELETE' THEN OLD.roster_id ELSE NEW.roster_id END;
    SELECT state INTO owner_state FROM hcm.shift_roster WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND id=owner_id FOR UPDATE;
  ELSE
    owner_id:=CASE WHEN TG_OP='DELETE' THEN OLD.override_id ELSE NEW.override_id END;
    SELECT state INTO owner_state FROM hcm.schedule_override WHERE tenant_id=coalesce(NEW.tenant_id,OLD.tenant_id) AND id=owner_id FOR UPDATE;
  END IF;
  IF owner_state IS DISTINCT FROM 'Draft' THEN RAISE EXCEPTION 'Dated source is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER shift_roster_entry_draft BEFORE INSERT OR UPDATE OR DELETE ON hcm.shift_roster_entry FOR EACH ROW EXECUTE FUNCTION hcm.guard_dated_work_source_child();
CREATE TRIGGER schedule_override_segment_draft BEFORE INSERT OR UPDATE OR DELETE ON hcm.schedule_override_segment FOR EACH ROW EXECUTE FUNCTION hcm.guard_dated_work_source_child();

-- Publication serializes each dated employment, checks exact source coverage and
-- keeps published payload immutable. The application also rechecks approval slots.
CREATE FUNCTION hcm.guard_shift_roster() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE entry hcm.shift_roster_entry%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' THEN RAISE EXCEPTION 'Create roster Draft first' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Roster revision must advance once' USING ERRCODE='23514'; END IF;
  IF OLD.state='Published' THEN
    FOR entry IN SELECT * FROM hcm.shift_roster_entry WHERE tenant_id=OLD.tenant_id AND roster_id=OLD.id ORDER BY work_date,employment_id LOOP
      PERFORM hcm.fence_attendance_month(OLD.tenant_id,date_trunc('month',entry.work_date::timestamp)::date,false);
      IF EXISTS(SELECT 1 FROM hcm.attendance_period WHERE tenant_id=OLD.tenant_id AND entry.work_date BETWEEN month_start AND month_end AND state IN ('Closing','Locked','Reopened')) THEN RAISE EXCEPTION 'Roster period unavailable' USING ERRCODE='23514'; END IF;
    END LOOP;
    IF NEW.state<>'Superseded' OR (to_jsonb(NEW)-ARRAY['state','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','updated_at']) THEN
      RAISE EXCEPTION 'Published roster is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state NOT IN ('Draft','PendingApproval') THEN RAISE EXCEPTION 'Terminal roster' USING ERRCODE='23514'; END IF;
  IF OLD.state='PendingApproval' AND (to_jsonb(NEW)-ARRAY['state','revision','updated_at','publication_digest','published_at','published_by_account_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','updated_at','publication_digest','published_at','published_by_account_id']) THEN
    RAISE EXCEPTION 'Submitted roster content is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Superseded' THEN RAISE EXCEPTION 'Unpublished roster cannot supersede' USING ERRCODE='23514'; END IF;
  IF NEW.state='Published' THEN
    IF NOT EXISTS(SELECT 1 FROM hcm.shift_roster_entry WHERE tenant_id=NEW.tenant_id AND roster_id=NEW.id) THEN RAISE EXCEPTION 'Roster requires entries' USING ERRCODE='23514'; END IF;
    FOR entry IN SELECT * FROM hcm.shift_roster_entry WHERE tenant_id=NEW.tenant_id AND roster_id=NEW.id ORDER BY work_date,employment_id LOOP
      PERFORM hcm.fence_attendance_month(NEW.tenant_id,date_trunc('month',entry.work_date::timestamp)::date,false);
      PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id||':dated-source:'||entry.employment_id||':'||to_char(entry.work_date,'YYYY-MM-DD'),0));
      IF entry.work_date NOT BETWEEN NEW.from_date AND NEW.to_date OR NOT EXISTS (SELECT 1 FROM hcm.shift_version WHERE tenant_id=NEW.tenant_id AND id=entry.shift_version_id AND state='Published' AND effective_period @> entry.work_date) THEN RAISE EXCEPTION 'Published shift coverage unavailable' USING ERRCODE='23514'; END IF;
      IF entry.assignment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM hcm.assignment WHERE tenant_id=NEW.tenant_id AND id=entry.assignment_id AND employment_id=entry.employment_id) THEN RAISE EXCEPTION 'Roster assignment employment mismatch' USING ERRCODE='23514'; END IF;
      IF EXISTS(SELECT 1 FROM hcm.attendance_period WHERE tenant_id=NEW.tenant_id AND entry.work_date BETWEEN month_start AND month_end AND state IN ('Closing','Locked','Reopened')) THEN RAISE EXCEPTION 'Roster period unavailable' USING ERRCODE='23514'; END IF;
      IF EXISTS(SELECT 1 FROM hcm.shift_roster_entry e JOIN hcm.shift_roster r ON r.tenant_id=e.tenant_id AND r.id=e.roster_id WHERE e.tenant_id=NEW.tenant_id AND e.employment_id=entry.employment_id AND e.work_date=entry.work_date AND r.state='Published' AND r.id<>NEW.id) THEN RAISE EXCEPTION 'Equal precedence roster conflict' USING ERRCODE='23P01'; END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER shift_roster_lifecycle BEFORE INSERT OR UPDATE ON hcm.shift_roster FOR EACH ROW EXECUTE FUNCTION hcm.guard_shift_roster();

CREATE FUNCTION hcm.guard_schedule_override() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' THEN RAISE EXCEPTION 'Create override Draft first' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Override revision must advance once' USING ERRCODE='23514'; END IF;
  IF OLD.state<>'Draft' THEN
    PERFORM hcm.fence_attendance_month(OLD.tenant_id,date_trunc('month',OLD.work_date::timestamp)::date,false);
    IF EXISTS(SELECT 1 FROM hcm.attendance_period WHERE tenant_id=OLD.tenant_id AND OLD.work_date BETWEEN month_start AND month_end AND state IN ('Closing','Locked','Reopened')) THEN RAISE EXCEPTION 'Override period unavailable' USING ERRCODE='23514'; END IF;
    IF OLD.state<>'Approved' OR NEW.state NOT IN ('Superseded','Cancelled') OR (to_jsonb(NEW)-ARRAY['state','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','updated_at']) THEN RAISE EXCEPTION 'Approved override is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state='Superseded' THEN RAISE EXCEPTION 'Unapproved override cannot supersede' USING ERRCODE='23514'; END IF;
  IF NEW.state='Approved' THEN
    PERFORM hcm.fence_attendance_month(NEW.tenant_id,date_trunc('month',NEW.work_date::timestamp)::date,false);
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id||':dated-source:'||NEW.employment_id||':'||to_char(NEW.work_date,'YYYY-MM-DD'),0));
    IF EXISTS(SELECT 1 FROM hcm.attendance_period WHERE tenant_id=NEW.tenant_id AND NEW.work_date BETWEEN month_start AND month_end AND state IN ('Closing','Locked','Reopened')) THEN RAISE EXCEPTION 'Override period unavailable' USING ERRCODE='23514'; END IF;
    IF NEW.basis_workday_id IS DISTINCT FROM (SELECT id FROM hcm.published_workday WHERE tenant_id=NEW.tenant_id AND employment_id=NEW.employment_id AND work_date=NEW.work_date ORDER BY revision DESC LIMIT 1) THEN RAISE EXCEPTION 'Override workday basis changed' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.zone) THEN RAISE EXCEPTION 'Override timezone unavailable' USING ERRCODE='23514'; END IF;
    IF (NEW.kind='Rest' AND EXISTS(SELECT 1 FROM hcm.schedule_override_segment WHERE tenant_id=NEW.tenant_id AND override_id=NEW.id)) OR (NEW.kind='Work' AND NOT EXISTS(SELECT 1 FROM hcm.schedule_override_segment WHERE tenant_id=NEW.tenant_id AND override_id=NEW.id)) THEN RAISE EXCEPTION 'Override segments incomplete' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM (
      SELECT s.*,lag(end_time) OVER w AS prior_end,lag(end_day_offset) OVER w AS prior_day,row_number() OVER w AS sequence_number,count(*) OVER() AS segment_count
      FROM hcm.schedule_override_segment s WHERE tenant_id=NEW.tenant_id AND override_id=NEW.id WINDOW w AS (ORDER BY ordinal)
    ) shape WHERE ordinal<>sequence_number OR (sequence_number=1 AND (kind<>'Work' OR start_day_offset<>0)) OR (sequence_number=segment_count AND kind<>'Work') OR (sequence_number>1 AND (start_time<>prior_end OR start_day_offset<>prior_day))) THEN RAISE EXCEPTION 'Override must be contiguous with internal breaks' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER schedule_override_lifecycle BEFORE INSERT OR UPDATE ON hcm.schedule_override FOR EACH ROW EXECUTE FUNCTION hcm.guard_schedule_override();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['shift_roster','shift_roster_entry','schedule_override','schedule_override_segment'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
GRANT UPDATE(name,from_date,to_date,state,revision,publication_digest,published_at,published_by_account_id,updated_at) ON hcm.shift_roster TO hcm_runtime;
GRANT UPDATE(zone,kind,state,revision,approval_digest,approved_at,approved_by_account_id,updated_at) ON hcm.schedule_override TO hcm_runtime;
GRANT DELETE ON hcm.shift_roster_entry,hcm.schedule_override_segment TO hcm_runtime;
