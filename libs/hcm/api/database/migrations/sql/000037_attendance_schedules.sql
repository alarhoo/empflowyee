-- Ownership: Attendance. Stable schedule identity is separate from immutable
-- published content. Runtime cannot delete configuration or change its tenant/code.
CREATE TABLE hcm.work_schedule (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  is_template boolean NOT NULL,
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.work_schedule_version (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  schedule_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number>0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  state text NOT NULL DEFAULT 'Draft' CHECK (state IN ('Draft','Published','Retired')),
  name text NOT NULL CHECK (length(name)<=120 AND length(btrim(name))>0),
  description text NOT NULL DEFAULT '' CHECK (length(description)<=2000),
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from,effective_to+1,'[)')) STORED,
  timezone_mode text NOT NULL CHECK (timezone_mode IN ('Employment','Location','Fixed')),
  fixed_zone text,
  week_starts_on smallint NOT NULL CHECK (week_starts_on BETWEEN 1 AND 7),
  minimum_rest_minutes bigint CHECK (minimum_rest_minutes BETWEEN 0 AND 9007199254740991),
  minimum_rest_mode text CHECK (minimum_rest_mode IN ('Warn','Block')),
  supersedes_id text,
  copied_from_id text,
  created_by_account_id text NOT NULL,
  published_by_account_id text,
  published_at timestamptz,
  publication_digest text CHECK (publication_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,schedule_id,version_number),
  FOREIGN KEY (tenant_id,schedule_id) REFERENCES hcm.work_schedule(tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_id) REFERENCES hcm.work_schedule_version(tenant_id,id),
  FOREIGN KEY (tenant_id,copied_from_id) REFERENCES hcm.work_schedule_version(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CHECK ((timezone_mode='Fixed' AND fixed_zone IS NOT NULL AND length(fixed_zone) BETWEEN 1 AND 100)
    OR (timezone_mode<>'Fixed' AND fixed_zone IS NULL)),
  CHECK ((minimum_rest_minutes IS NULL)=(minimum_rest_mode IS NULL)),
  CHECK (supersedes_id IS NULL OR supersedes_id<>id),
  CHECK (copied_from_id IS NULL OR copied_from_id<>id),
  CHECK ((state='Draft' AND published_at IS NULL AND published_by_account_id IS NULL AND publication_digest IS NULL)
    OR (state<>'Draft' AND published_at IS NOT NULL AND published_by_account_id IS NOT NULL AND publication_digest IS NOT NULL)),
  EXCLUDE USING gist (tenant_id WITH =,schedule_id WITH =,effective_period WITH &&) WHERE (state='Published')
);
CREATE INDEX work_schedule_version_state ON hcm.work_schedule_version(tenant_id,state,schedule_id,id);

CREATE TABLE hcm.work_schedule_day (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  version_id text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  kind text NOT NULL CHECK (kind IN ('Work','Rest')),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,version_id,weekday), UNIQUE (tenant_id,version_id,id),
  FOREIGN KEY (tenant_id,version_id) REFERENCES hcm.work_schedule_version(tenant_id,id)
);

CREATE TABLE hcm.work_schedule_segment (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  version_id text NOT NULL,
  day_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>0),
  kind text NOT NULL CHECK (kind IN ('Work','UnpaidBreak')),
  start_time time NOT NULL,
  end_time time NOT NULL,
  start_day_offset smallint NOT NULL CHECK (start_day_offset IN (0,1)),
  end_day_offset smallint NOT NULL CHECK (end_day_offset IN (0,1)),
  start_overlap_choice text CHECK (start_overlap_choice IN ('Earlier','Later')),
  end_overlap_choice text CHECK (end_overlap_choice IN ('Earlier','Later')),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,day_id,ordinal),
  FOREIGN KEY (tenant_id,version_id,day_id) REFERENCES hcm.work_schedule_day(tenant_id,version_id,id),
  CHECK (extract(microseconds FROM start_time)::bigint % 1000=0 AND extract(microseconds FROM end_time)::bigint % 1000=0),
  CHECK (start_time<'24:00'::time AND end_time<'24:00'::time),
  CHECK (end_day_offset>=start_day_offset),
  CHECK ((end_day_offset*86400+extract(epoch FROM end_time))>(start_day_offset*86400+extract(epoch FROM start_time))
    OR (start_overlap_choice IS NOT NULL AND start_overlap_choice='Earlier' AND end_overlap_choice IS NOT NULL AND end_overlap_choice='Later'))
);

-- Child changes lock the owning version before checking Draft, preventing a
-- publication/child-edit race even when a caller bypasses application validation.
CREATE FUNCTION hcm.guard_schedule_child() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE current_state text;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT state INTO current_state FROM hcm.work_schedule_version
      WHERE tenant_id=OLD.tenant_id AND id=OLD.version_id FOR UPDATE;
    IF current_state IS DISTINCT FROM 'Draft' THEN
      RAISE EXCEPTION 'Published schedule child cannot be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.tenant_id<>OLD.tenant_id OR NEW.version_id<>OLD.version_id OR NEW.id<>OLD.id) THEN
    RAISE EXCEPTION 'Schedule child identity is immutable' USING ERRCODE='23514';
  END IF;
  SELECT state INTO current_state FROM hcm.work_schedule_version
    WHERE tenant_id=NEW.tenant_id AND id=NEW.version_id FOR UPDATE;
  IF current_state IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Schedule content is not Draft' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER schedule_day_draft BEFORE INSERT OR UPDATE OR DELETE ON hcm.work_schedule_day FOR EACH ROW EXECUTE FUNCTION hcm.guard_schedule_child();
CREATE TRIGGER schedule_segment_draft BEFORE INSERT OR UPDATE OR DELETE ON hcm.work_schedule_segment FOR EACH ROW EXECUTE FUNCTION hcm.guard_schedule_child();

-- A published version can only retire; its content, publication basis and actors
-- cannot change. Structural completeness is checked again at the SQL boundary.
CREATE FUNCTION hcm.guard_schedule_version() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' THEN RAISE EXCEPTION 'Create a Draft before publishing' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Schedule revision must advance once' USING ERRCODE='23514'; END IF;
  IF OLD.state<>'Draft' THEN
    IF OLD.state<>'Published' OR NEW.state<>'Retired'
      OR (to_jsonb(NEW)-ARRAY['state','revision','updated_at','effective_period']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','updated_at','effective_period']) THEN
      RAISE EXCEPTION 'Published schedule is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state='Retired' THEN RAISE EXCEPTION 'Draft cannot retire as publication evidence' USING ERRCODE='23514'; END IF;
  IF NEW.state='Published' THEN
    IF (SELECT count(*) FROM hcm.work_schedule_day WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id)<>7 THEN
      RAISE EXCEPTION 'A published pattern requires seven weekdays' USING ERRCODE='23514';
    END IF;
    IF NEW.timezone_mode='Fixed' AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.fixed_zone) THEN
      RAISE EXCEPTION 'Unknown fixed timezone' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM hcm.work_schedule_day d WHERE d.tenant_id=NEW.tenant_id AND d.version_id=NEW.id AND
      ((d.kind='Rest' AND EXISTS(SELECT 1 FROM hcm.work_schedule_segment s WHERE s.tenant_id=d.tenant_id AND s.day_id=d.id)) OR
       (d.kind='Work' AND NOT EXISTS(SELECT 1 FROM hcm.work_schedule_segment s WHERE s.tenant_id=d.tenant_id AND s.day_id=d.id)))) THEN
      RAISE EXCEPTION 'Work and rest content disagree' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM (
      SELECT s.*,lag(end_time) OVER w AS prior_end,lag(end_day_offset) OVER w AS prior_day,
        row_number() OVER w AS sequence_number,count(*) OVER(PARTITION BY tenant_id,day_id) AS segment_count
      FROM hcm.work_schedule_segment s WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id
      WINDOW w AS (PARTITION BY tenant_id,day_id ORDER BY ordinal)
    ) shape WHERE ordinal<>sequence_number
      OR (sequence_number=1 AND (kind<>'Work' OR start_day_offset<>0))
      OR (sequence_number=segment_count AND kind<>'Work')
      OR (sequence_number>1 AND (start_time<>prior_end OR start_day_offset<>prior_day))) THEN
      RAISE EXCEPTION 'Schedule must be one contiguous shift with internal breaks' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER schedule_version_lifecycle BEFORE INSERT OR UPDATE ON hcm.work_schedule_version FOR EACH ROW EXECUTE FUNCTION hcm.guard_schedule_version();

CREATE TABLE hcm.work_schedule_assignment (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  version_id text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('Tenant','LegalEntity','OrgUnit','Department','Location','Assignment','Employment')),
  legal_entity_id text,org_unit_id text,department_id text,location_id text,assignment_id text,employment_id text,
  scope_key text GENERATED ALWAYS AS (coalesce(legal_entity_id,org_unit_id,department_id,location_id,assignment_id,employment_id,'tenant')) STORED,
  effective_from date NOT NULL,effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from,effective_to+1,'[)')) STORED,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_by_account_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,version_id) REFERENCES hcm.work_schedule_version(tenant_id,id),
  FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id),
  FOREIGN KEY (tenant_id,org_unit_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY (tenant_id,department_id) REFERENCES hcm.department(tenant_id,id),
  FOREIGN KEY (tenant_id,location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CHECK ((scope_kind='Tenant' AND num_nonnulls(legal_entity_id,org_unit_id,department_id,location_id,assignment_id,employment_id)=0)
    OR (num_nonnulls(legal_entity_id,org_unit_id,department_id,location_id,assignment_id,employment_id)=1 AND
      ((scope_kind='LegalEntity' AND legal_entity_id IS NOT NULL) OR (scope_kind='OrgUnit' AND org_unit_id IS NOT NULL)
      OR (scope_kind='Department' AND department_id IS NOT NULL) OR (scope_kind='Location' AND location_id IS NOT NULL)
      OR (scope_kind='Assignment' AND assignment_id IS NOT NULL) OR (scope_kind='Employment' AND employment_id IS NOT NULL)))),
  EXCLUDE USING gist (tenant_id WITH =,scope_kind WITH =,scope_key WITH =,effective_period WITH &&)
);

-- New assignment references must point at an actually published non-template
-- version and be completely covered by that immutable version's date range.
CREATE FUNCTION hcm.guard_schedule_assignment() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE published hcm.work_schedule_version;
DECLARE template boolean;
BEGIN
  SELECT * INTO published FROM hcm.work_schedule_version WHERE tenant_id=NEW.tenant_id AND id=NEW.version_id FOR SHARE;
  SELECT is_template INTO template FROM hcm.work_schedule WHERE tenant_id=NEW.tenant_id AND id=published.schedule_id;
  IF published.state IS DISTINCT FROM 'Published' OR template IS DISTINCT FROM false
    OR NOT (published.effective_period @> daterange(NEW.effective_from,NEW.effective_to+1,'[)')) THEN
    RAISE EXCEPTION 'Assignment requires a covering published non-template version' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.revision<>OLD.revision+1 THEN
    RAISE EXCEPTION 'Assignment revision must advance once' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER schedule_assignment_guard BEFORE INSERT OR UPDATE ON hcm.work_schedule_assignment FOR EACH ROW EXECUTE FUNCTION hcm.guard_schedule_assignment();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['work_schedule','work_schedule_version','work_schedule_day','work_schedule_segment','work_schedule_assignment'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
GRANT UPDATE(name,description,effective_from,effective_to,timezone_mode,fixed_zone,week_starts_on,minimum_rest_minutes,minimum_rest_mode,state,revision,published_at,published_by_account_id,publication_digest,updated_at) ON hcm.work_schedule_version TO hcm_runtime;
GRANT UPDATE(kind) ON hcm.work_schedule_day TO hcm_runtime;
-- Whole-draft replacement can remove draft children; the parent-lock trigger
-- rejects the same operation for Published or Retired evidence.
GRANT DELETE ON hcm.work_schedule_day,hcm.work_schedule_segment TO hcm_runtime;
GRANT UPDATE(ordinal,kind,start_time,end_time,start_day_offset,end_day_offset,start_overlap_choice,end_overlap_choice) ON hcm.work_schedule_segment TO hcm_runtime;
GRANT UPDATE(effective_to,revision,updated_at) ON hcm.work_schedule_assignment TO hcm_runtime;
