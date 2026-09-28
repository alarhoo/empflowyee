-- Attendance owns policy and holiday configuration. SQL is schema authority;
-- immutable publication, tenant references and narrow runtime grants are enforced
-- here. Source authorization, preview/DST impact and receipts remain application work.

CREATE TABLE hcm.attendance_policy (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);


CREATE TABLE hcm.attendance_policy_version (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  policy_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number>0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  state text NOT NULL DEFAULT 'Draft' CHECK (state IN ('Draft','Published','Retired')),
  name text NOT NULL CHECK (length(name)<=120 AND length(btrim(name))>0),
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from,effective_to+1,'[)')) STORED,
  grace_in_minutes bigint NOT NULL CHECK (grace_in_minutes BETWEEN 0 AND 9007199254740991),
  grace_out_minutes bigint NOT NULL CHECK (grace_out_minutes BETWEEN 0 AND 9007199254740991),
  rounding text NOT NULL CHECK (rounding IN ('None','Configured')),
  rounding_increment_minutes bigint CHECK (rounding_increment_minutes BETWEEN 1 AND 9007199254740991),
  rounding_direction text CHECK (rounding_direction IN ('Down','Up','Nearest')),
  minimum_rest_minutes bigint CHECK (minimum_rest_minutes BETWEEN 0 AND 9007199254740991),
  minimum_rest_mode text CHECK (minimum_rest_mode IN ('Warn','Block')),
  overtime_enabled boolean NOT NULL,
  overtime_qualification text CHECK (overtime_qualification IN ('ScheduledExcess','RestDay','Holiday')),
  overtime_cap_minutes bigint CHECK (overtime_cap_minutes BETWEEN 0 AND 9007199254740991),
  overtime_preapproval_required boolean,
  supersedes_id text,
  created_by_account_id text NOT NULL,
  published_by_account_id text,
  published_at timestamptz,
  publication_digest text CHECK (publication_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,policy_id,version_number),
  FOREIGN KEY (tenant_id,policy_id) REFERENCES hcm.attendance_policy(tenant_id,id),
  UNIQUE (tenant_id,policy_id,id),
  FOREIGN KEY (tenant_id,policy_id,supersedes_id) REFERENCES hcm.attendance_policy_version(tenant_id,policy_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CHECK ((minimum_rest_minutes IS NULL)=(minimum_rest_mode IS NULL)),
  CHECK ((rounding='None' AND rounding_increment_minutes IS NULL AND rounding_direction IS NULL)
    OR (rounding='Configured' AND rounding_increment_minutes IS NOT NULL AND rounding_direction IS NOT NULL)),
  CHECK ((NOT overtime_enabled AND overtime_qualification IS NULL AND overtime_cap_minutes IS NULL AND overtime_preapproval_required IS NULL)
    OR (overtime_enabled AND overtime_qualification IS NOT NULL AND overtime_cap_minutes IS NOT NULL AND overtime_preapproval_required IS NOT NULL)),
  CHECK (supersedes_id IS NULL OR supersedes_id<>id),
  CHECK ((state='Draft' AND published_at IS NULL AND published_by_account_id IS NULL AND publication_digest IS NULL)
    OR (state<>'Draft' AND published_at IS NOT NULL AND published_by_account_id IS NOT NULL AND publication_digest IS NOT NULL)),
  EXCLUDE USING gist (tenant_id WITH =,policy_id WITH =,effective_period WITH &&) WHERE (state='Published')
);
CREATE INDEX attendance_policy_version_state ON hcm.attendance_policy_version(tenant_id,state,policy_id,id);


CREATE TABLE hcm.holiday_calendar (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);


CREATE TABLE hcm.holiday_calendar_version (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  calendar_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number>0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  state text NOT NULL DEFAULT 'Draft' CHECK (state IN ('Draft','Published','Retired')),
  name text NOT NULL CHECK (length(name)<=120 AND length(btrim(name))>0),
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from,effective_to+1,'[)')) STORED,
  supersedes_id text,
  created_by_account_id text NOT NULL,
  published_by_account_id text,
  published_at timestamptz,
  publication_digest text CHECK (publication_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,calendar_id,version_number),
  FOREIGN KEY (tenant_id,calendar_id) REFERENCES hcm.holiday_calendar(tenant_id,id),
  UNIQUE (tenant_id,calendar_id,id),
  FOREIGN KEY (tenant_id,calendar_id,supersedes_id) REFERENCES hcm.holiday_calendar_version(tenant_id,calendar_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CHECK (supersedes_id IS NULL OR supersedes_id<>id),
  CHECK ((state='Draft' AND published_at IS NULL AND published_by_account_id IS NULL AND publication_digest IS NULL)
    OR (state<>'Draft' AND published_at IS NOT NULL AND published_by_account_id IS NOT NULL AND publication_digest IS NOT NULL)),
  EXCLUDE USING gist (tenant_id WITH =,calendar_id WITH =,effective_period WITH &&) WHERE (state='Published')
);
CREATE INDEX holiday_calendar_version_state ON hcm.holiday_calendar_version(tenant_id,state,calendar_id,id);


CREATE TABLE hcm.attendance_approval_rule (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  version_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>0),
  subject_type text NOT NULL CHECK (subject_type IN ('Correction','Adjustment','Overtime','Roster','Override','AnomalyWaiver','PeriodReopen')),
  stage integer NOT NULL CHECK (stage>0),
  independent boolean NOT NULL,
  candidate_source text NOT NULL CHECK (candidate_source IN ('LineManager','ManagerLevel','Function','NamedUser')),
  manager_level integer CHECK (manager_level>0),
  function_code text CHECK (length(function_code)<=120 AND length(btrim(function_code))>0),
  account_id text,
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,version_id,ordinal),
  FOREIGN KEY (tenant_id,version_id) REFERENCES hcm.attendance_policy_version(tenant_id,id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (subject_type NOT IN ('Correction','Adjustment','Overtime','AnomalyWaiver','PeriodReopen') OR independent),
  CHECK ((candidate_source='LineManager' AND num_nonnulls(manager_level,function_code,account_id)=0)
    OR (num_nonnulls(manager_level,function_code,account_id)=1 AND
      ((candidate_source='ManagerLevel' AND manager_level IS NOT NULL)
      OR (candidate_source='Function' AND function_code IS NOT NULL)
      OR (candidate_source='NamedUser' AND account_id IS NOT NULL))))
);
CREATE UNIQUE INDEX attendance_rule_selector ON hcm.attendance_approval_rule
  (tenant_id,version_id,subject_type,stage,candidate_source,coalesce(manager_level,0),coalesce(function_code,''),coalesce(account_id,''));

CREATE TABLE hcm.holiday (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  version_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>0),
  actual_date date NOT NULL,
  observed_date date NOT NULL,
  category text NOT NULL CHECK (category IN ('Public','Company','Regional','Substitute')),
  name text NOT NULL CHECK (length(name)<=120 AND length(btrim(name))>0),
  priority integer NOT NULL,
  region_code text CHECK (length(region_code)<=120 AND length(btrim(region_code))>0),
  location_id text,
  start_time time,
  end_time time,
  start_overlap_choice text CHECK (start_overlap_choice IN ('Earlier','Later')),
  end_overlap_choice text CHECK (end_overlap_choice IN ('Earlier','Later')),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,version_id,ordinal),
  FOREIGN KEY (tenant_id,version_id) REFERENCES hcm.holiday_calendar_version(tenant_id,id),
  FOREIGN KEY (tenant_id,location_id) REFERENCES hcm.location(tenant_id,id),
  CHECK ((start_time IS NULL AND end_time IS NULL AND start_overlap_choice IS NULL AND end_overlap_choice IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time>start_time AND end_time<'24:00'::time
      AND extract(microseconds FROM start_time)::bigint % 1000=0 AND extract(microseconds FROM end_time)::bigint % 1000=0))
);
CREATE INDEX holiday_observed_scope ON hcm.holiday(tenant_id,version_id,observed_date,location_id,region_code);

-- Version table names come only from fixed trigger arguments in this migration.
-- Runtime has no DDL authority. These invoker-rights locks retain RLS and prevent
-- a child edit from racing a publication that freezes the owning version.
CREATE FUNCTION hcm.guard_attendance_configuration_child() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE child record;
DECLARE current_state text;
BEGIN
  IF TG_OP='DELETE' THEN child:=OLD; ELSE child:=NEW; END IF;
  IF TG_OP='UPDATE' AND (NEW.tenant_id<>OLD.tenant_id OR NEW.version_id<>OLD.version_id OR NEW.id<>OLD.id) THEN
    RAISE EXCEPTION 'Configuration child identity is immutable' USING ERRCODE='23514';
  END IF;
  EXECUTE format('SELECT state FROM hcm.%I WHERE tenant_id=$1 AND id=$2 FOR UPDATE',TG_ARGV[0])
    INTO current_state USING child.tenant_id,child.version_id;
  IF current_state IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Configuration content is not Draft' USING ERRCODE='23514';
  END IF;
  RETURN child;
END
$body$;
CREATE TRIGGER attendance_rule_draft BEFORE INSERT OR UPDATE OR DELETE ON hcm.attendance_approval_rule
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_configuration_child('attendance_policy_version');
CREATE TRIGGER holiday_draft BEFORE INSERT OR UPDATE OR DELETE ON hcm.holiday
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_configuration_child('holiday_calendar_version');

-- Publication freezes all content. Retirement preserves its effective period,
-- original publication actor and digest. Draft rules may be incomplete while
-- editing, but enabled overtime cannot publish without an independent manager.
CREATE FUNCTION hcm.guard_attendance_configuration_version() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' THEN RAISE EXCEPTION 'Create Draft before publication' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Configuration revision must advance once' USING ERRCODE='23514'; END IF;
  IF OLD.state<>'Draft' THEN
    IF OLD.state<>'Published' OR NEW.state<>'Retired'
      OR (to_jsonb(NEW)-ARRAY['state','revision','updated_at','effective_period']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','updated_at','effective_period']) THEN
      RAISE EXCEPTION 'Published configuration is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state='Retired' THEN RAISE EXCEPTION 'Draft cannot retire as publication evidence' USING ERRCODE='23514'; END IF;
  IF NEW.state='Published' THEN
    IF TG_TABLE_NAME='attendance_policy_version' THEN
      IF NEW.overtime_enabled AND NOT EXISTS(SELECT 1 FROM hcm.attendance_approval_rule
        WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id AND subject_type='Overtime' AND independent AND candidate_source IN ('LineManager','ManagerLevel')) THEN
        RAISE EXCEPTION 'Overtime requires independent manager approval' USING ERRCODE='23514';
      END IF;
      IF EXISTS(SELECT 1 FROM hcm.attendance_approval_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id
        GROUP BY subject_type HAVING min(stage)<>1 OR max(stage)<>count(DISTINCT stage)) THEN
        RAISE EXCEPTION 'Approval stages must be contiguous' USING ERRCODE='23514';
      END IF;
    ELSIF TG_TABLE_NAME='holiday_calendar_version' THEN
      IF EXISTS(SELECT 1 FROM hcm.holiday WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id
        AND NOT (daterange(NEW.effective_from,NEW.effective_to+1,'[)') @> observed_date)) THEN
        RAISE EXCEPTION 'Observed date outside calendar effective period' USING ERRCODE='23514';
      END IF;
    ELSE RAISE EXCEPTION 'Unsupported configuration owner' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_policy_lifecycle BEFORE INSERT OR UPDATE ON hcm.attendance_policy_version
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_configuration_version();
CREATE TRIGGER holiday_calendar_lifecycle BEFORE INSERT OR UPDATE ON hcm.holiday_calendar_version
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_configuration_version();

CREATE TABLE hcm.attendance_policy_assignment (
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
  FOREIGN KEY (tenant_id,version_id) REFERENCES hcm.attendance_policy_version(tenant_id,id),
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


CREATE TABLE hcm.holiday_calendar_assignment (
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
  FOREIGN KEY (tenant_id,version_id) REFERENCES hcm.holiday_calendar_version(tenant_id,id),
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


-- Typed scope references and exclusions reject cross-tenant references and
-- equal-target overlapping dates. Effective assignments require a covering
-- published version; a previous assignment is ended explicitly, never overwritten.
CREATE FUNCTION hcm.guard_attendance_configuration_assignment() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE current_state text;
DECLARE coverage daterange;
BEGIN
  EXECUTE format('SELECT state,effective_period FROM hcm.%I WHERE tenant_id=$1 AND id=$2 FOR SHARE',TG_ARGV[0])
    INTO current_state,coverage USING NEW.tenant_id,NEW.version_id;
  IF (TG_OP='INSERT' AND current_state IS DISTINCT FROM 'Published')
    OR (TG_OP='UPDATE' AND current_state NOT IN ('Published','Retired'))
    OR current_state IS NULL OR NOT (coverage @> daterange(NEW.effective_from,NEW.effective_to+1,'[)')) THEN
    RAISE EXCEPTION 'Assignment requires a covering published version' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR NEW.effective_to IS NULL
    OR (OLD.effective_to IS NOT NULL AND NEW.effective_to>OLD.effective_to)) THEN
    RAISE EXCEPTION 'Assignment changes may only end existing coverage and advance revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_policy_assignment_guard BEFORE INSERT OR UPDATE ON hcm.attendance_policy_assignment
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_configuration_assignment('attendance_policy_version');
CREATE TRIGGER holiday_calendar_assignment_guard BEFORE INSERT OR UPDATE ON hcm.holiday_calendar_assignment
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_configuration_assignment('holiday_calendar_version');

-- Forward refinement of the same assignment rule for schedules: retiring a
-- version does not prevent ending its old assignment; extending that retired
-- authority or reopening a previously ended range is forbidden.
CREATE OR REPLACE FUNCTION hcm.guard_schedule_assignment() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE published hcm.work_schedule_version;
DECLARE template boolean;
BEGIN
  SELECT * INTO published FROM hcm.work_schedule_version WHERE tenant_id=NEW.tenant_id AND id=NEW.version_id FOR SHARE;
  SELECT is_template INTO template FROM hcm.work_schedule WHERE tenant_id=NEW.tenant_id AND id=published.schedule_id;
  IF (TG_OP='INSERT' AND published.state IS DISTINCT FROM 'Published')
    OR (TG_OP='UPDATE' AND published.state NOT IN ('Published','Retired'))
    OR published.state IS NULL OR template IS DISTINCT FROM false
    OR NOT (published.effective_period @> daterange(NEW.effective_from,NEW.effective_to+1,'[)')) THEN
    RAISE EXCEPTION 'Assignment requires covering non-template publication evidence' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR NEW.effective_to IS NULL
    OR (OLD.effective_to IS NOT NULL AND NEW.effective_to>OLD.effective_to)) THEN
    RAISE EXCEPTION 'Assignment changes may only end existing coverage and advance revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['attendance_policy','attendance_policy_version','attendance_approval_rule','attendance_policy_assignment',
    'holiday_calendar','holiday_calendar_version','holiday','holiday_calendar_assignment'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
GRANT UPDATE(name,effective_from,effective_to,grace_in_minutes,grace_out_minutes,rounding,rounding_increment_minutes,rounding_direction,
  minimum_rest_minutes,minimum_rest_mode,overtime_enabled,overtime_qualification,overtime_cap_minutes,overtime_preapproval_required,
  state,revision,published_at,published_by_account_id,publication_digest,updated_at) ON hcm.attendance_policy_version TO hcm_runtime;
GRANT UPDATE(name,effective_from,effective_to,state,revision,published_at,published_by_account_id,publication_digest,updated_at)
  ON hcm.holiday_calendar_version TO hcm_runtime;
GRANT UPDATE(ordinal,subject_type,stage,independent,candidate_source,manager_level,function_code,account_id) ON hcm.attendance_approval_rule TO hcm_runtime;
GRANT UPDATE(ordinal,actual_date,observed_date,category,name,priority,region_code,location_id,start_time,end_time,start_overlap_choice,end_overlap_choice) ON hcm.holiday TO hcm_runtime;
-- Draft replacement only; parent-lock guards reject DELETE after publication.
GRANT DELETE ON hcm.attendance_approval_rule,hcm.holiday TO hcm_runtime;
GRANT UPDATE(effective_to,revision,updated_at) ON hcm.attendance_policy_assignment,hcm.holiday_calendar_assignment TO hcm_runtime;
