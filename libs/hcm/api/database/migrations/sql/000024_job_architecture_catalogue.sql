-- Job architecture catalogue: one versioned catalogue per tenant with families, career tracks, levels,
-- bands and grades, and versioned job profiles that reference one published catalogue version.
-- Published versions are immutable (trigger and column grants); corrections create successor drafts.
-- No salary, currency, pay rate or benefit value is stored (job architecture business rule 21).

CREATE TABLE hcm.job_catalogue (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Retired')),
  current_published_version_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- DEC-HCM2-006: one catalogue per organisation.
CREATE UNIQUE INDEX job_catalogue_one_per_tenant ON hcm.job_catalogue (tenant_id);

CREATE TABLE hcm.job_catalogue_version (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_catalogue_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','InReview','Published','Superseded','Retired')),
  effective_from date,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to + 1, '[)')) STORED,
  supersedes_version_id text,
  change_summary text NOT NULL DEFAULT '' CHECK (length(change_summary) <= 500),
  source_digest text CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  published_at timestamptz,
  published_by_account_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_catalogue_id,version_number),
  CONSTRAINT job_catalogue_version_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT job_catalogue_version_published CHECK (
    (status IN ('Draft','InReview')) = (effective_from IS NULL)
    AND (status IN ('Draft','InReview')) = (published_at IS NULL)
    AND (status IN ('Draft','InReview')) = (source_digest IS NULL)),
  CONSTRAINT job_catalogue_version_no_overlap EXCLUDE USING gist (
    tenant_id WITH =, job_catalogue_id WITH =, effective_period WITH &&) WHERE (effective_from IS NOT NULL),
  FOREIGN KEY (tenant_id,job_catalogue_id) REFERENCES hcm.job_catalogue(tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_version_id) REFERENCES hcm.job_catalogue_version(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- One open draft or review per catalogue at a time.
CREATE UNIQUE INDEX job_catalogue_version_one_open ON hcm.job_catalogue_version (tenant_id,job_catalogue_id)
  WHERE status IN ('Draft','InReview');
ALTER TABLE hcm.job_catalogue
  ADD FOREIGN KEY (tenant_id,current_published_version_id) REFERENCES hcm.job_catalogue_version(tenant_id,id);

CREATE TABLE hcm.job_family (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_catalogue_version_id text NOT NULL,
  parent_job_family_id text,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  materialized_path text NOT NULL CHECK (length(materialized_path) BETWEEN 1 AND 100),
  -- DEC-HCM2-005: families are at most two levels deep, so a parent is always a root.
  depth smallint NOT NULL CHECK (depth IN (1,2)),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,code),
  CONSTRAINT job_family_root CHECK ((depth = 1) = (parent_job_family_id IS NULL)),
  CONSTRAINT job_family_self CHECK (parent_job_family_id IS DISTINCT FROM id),
  FOREIGN KEY (tenant_id,job_catalogue_version_id) REFERENCES hcm.job_catalogue_version(tenant_id,id),
  FOREIGN KEY (tenant_id,job_catalogue_version_id,parent_job_family_id) REFERENCES hcm.job_family(tenant_id,job_catalogue_version_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX job_family_parent ON hcm.job_family (tenant_id,job_catalogue_version_id,parent_job_family_id,sort_order);

CREATE TABLE hcm.career_track (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_catalogue_version_id text NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  -- DEC-HCM2-005: the two supported track kinds, one track each.
  kind text NOT NULL CHECK (kind IN ('IndividualContributor','Management')),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,code),
  UNIQUE (tenant_id,job_catalogue_version_id,kind),
  FOREIGN KEY (tenant_id,job_catalogue_version_id) REFERENCES hcm.job_catalogue_version(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.job_level (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_catalogue_version_id text NOT NULL,
  career_track_id text NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  sequence_number integer NOT NULL CHECK (sequence_number BETWEEN 1 AND 99),
  scope_summary text NOT NULL DEFAULT '' CHECK (length(scope_summary) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,career_track_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,code),
  UNIQUE (tenant_id,career_track_id,sequence_number),
  FOREIGN KEY (tenant_id,job_catalogue_version_id,career_track_id) REFERENCES hcm.career_track(tenant_id,job_catalogue_version_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.job_band (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_catalogue_version_id text NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  sequence_number integer NOT NULL CHECK (sequence_number BETWEEN 1 AND 99),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,code),
  UNIQUE (tenant_id,job_catalogue_version_id,sequence_number),
  FOREIGN KEY (tenant_id,job_catalogue_version_id) REFERENCES hcm.job_catalogue_version(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.job_grade (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_catalogue_version_id text NOT NULL,
  job_band_id text NOT NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  sequence_number integer NOT NULL CHECK (sequence_number BETWEEN 1 AND 99),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,code),
  UNIQUE (tenant_id,job_band_id,sequence_number),
  FOREIGN KEY (tenant_id,job_catalogue_version_id,job_band_id) REFERENCES hcm.job_band(tenant_id,job_catalogue_version_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.job_profile (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Retired')),
  current_published_version_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.job_profile_version (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_profile_id text NOT NULL,
  job_catalogue_version_id text NOT NULL,
  job_family_id text NOT NULL,
  career_track_id text NOT NULL,
  job_level_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','InReview','Published','Superseded','Retired')),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 500),
  purpose text NOT NULL DEFAULT '' CHECK (length(purpose) <= 2000),
  scope_of_impact text NOT NULL DEFAULT '' CHECK (length(scope_of_impact) <= 2000),
  autonomy_level text NOT NULL DEFAULT '' CHECK (length(autonomy_level) <= 500),
  effective_from date,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to + 1, '[)')) STORED,
  supersedes_version_id text,
  source_digest text CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  published_at timestamptz,
  published_by_account_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_catalogue_version_id,id),
  UNIQUE (tenant_id,job_profile_id,version_number),
  CONSTRAINT job_profile_version_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT job_profile_version_published CHECK (
    (status IN ('Draft','InReview')) = (effective_from IS NULL)
    AND (status IN ('Draft','InReview')) = (published_at IS NULL)
    AND (status IN ('Draft','InReview')) = (source_digest IS NULL)),
  CONSTRAINT job_profile_version_no_overlap EXCLUDE USING gist (
    tenant_id WITH =, job_profile_id WITH =, effective_period WITH &&) WHERE (effective_from IS NOT NULL),
  FOREIGN KEY (tenant_id,job_profile_id) REFERENCES hcm.job_profile(tenant_id,id),
  -- Family, track and level belong to the referenced catalogue version (business rule 5).
  FOREIGN KEY (tenant_id,job_catalogue_version_id,job_family_id) REFERENCES hcm.job_family(tenant_id,job_catalogue_version_id,id),
  FOREIGN KEY (tenant_id,job_catalogue_version_id,career_track_id) REFERENCES hcm.career_track(tenant_id,job_catalogue_version_id,id),
  FOREIGN KEY (tenant_id,career_track_id,job_level_id) REFERENCES hcm.job_level(tenant_id,career_track_id,id),
  FOREIGN KEY (tenant_id,supersedes_version_id) REFERENCES hcm.job_profile_version(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX job_profile_version_one_open ON hcm.job_profile_version (tenant_id,job_profile_id)
  WHERE status IN ('Draft','InReview');
ALTER TABLE hcm.job_profile
  ADD FOREIGN KEY (tenant_id,current_published_version_id) REFERENCES hcm.job_profile_version(tenant_id,id);

CREATE TABLE hcm.job_profile_responsibility (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_profile_version_id text NOT NULL,
  responsibility_code text NOT NULL CHECK (responsibility_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  statement text NOT NULL CHECK (length(btrim(statement)) BETWEEN 1 AND 1000),
  is_essential boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_profile_version_id,responsibility_code),
  FOREIGN KEY (tenant_id,job_profile_version_id) REFERENCES hcm.job_profile_version(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.job_profile_requirement (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_profile_version_id text NOT NULL,
  requirement_code text NOT NULL CHECK (requirement_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  requirement_type text NOT NULL CHECK (requirement_type IN ('Education','Experience','Certification','Licence','Language','Skill','Competency','Other')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  proficiency_level text NOT NULL DEFAULT '' CHECK (length(proficiency_level) <= 100),
  minimum_quantity numeric(8,2) CHECK (minimum_quantity >= 0),
  quantity_unit text CHECK (quantity_unit IN ('Years','Months','Hours','Credits','Count')),
  is_mandatory boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_profile_version_id,requirement_code),
  -- A quantity always carries its unit (business rule 8).
  CONSTRAINT job_profile_requirement_quantity CHECK ((minimum_quantity IS NULL) = (quantity_unit IS NULL)),
  FOREIGN KEY (tenant_id,job_profile_version_id) REFERENCES hcm.job_profile_version(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.job_profile_grade (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  job_profile_version_id text NOT NULL,
  job_catalogue_version_id text NOT NULL,
  job_grade_id text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_profile_version_id,job_grade_id),
  -- The grade and the profile version belong to the same catalogue version (business rule 5).
  FOREIGN KEY (tenant_id,job_catalogue_version_id,job_profile_version_id) REFERENCES hcm.job_profile_version(tenant_id,job_catalogue_version_id,id),
  FOREIGN KEY (tenant_id,job_catalogue_version_id,job_grade_id) REFERENCES hcm.job_grade(tenant_id,job_catalogue_version_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX job_profile_grade_one_default ON hcm.job_profile_grade (tenant_id,job_profile_version_id) WHERE is_default;

CREATE TABLE hcm.job_architecture_command_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  actor_account_id text NOT NULL,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 100),
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object' AND octet_length(response::text) <= 65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,actor_account_id,operation,idempotency_key),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- Published, superseded and retired versions are immutable: only the lifecycle closure
-- (status to Superseded or Retired, effective_to, revision and updated_*) may change.
CREATE FUNCTION hcm.require_architecture_version_mutable() RETURNS trigger LANGUAGE plpgsql AS $mutable$
BEGIN
  IF OLD.status IN ('Published','Superseded','Retired') THEN
    IF (to_jsonb(NEW) - ARRAY['status','effective_to','effective_period','revision','updated_at','updated_by_account_id'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','effective_to','effective_period','revision','updated_at','updated_by_account_id'])
       OR NOT (NEW.status = OLD.status
         OR (OLD.status = 'Published' AND NEW.status IN ('Superseded','Retired'))
         OR (OLD.status = 'Superseded' AND NEW.status = 'Retired'))
       OR (OLD.effective_to IS NOT NULL AND NEW.effective_to IS DISTINCT FROM OLD.effective_to) THEN
      RAISE EXCEPTION 'Published architecture versions are immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'InReview' AND NEW.status = 'Draft' THEN
    RAISE EXCEPTION 'A version under review does not return to draft' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$mutable$;
CREATE TRIGGER job_catalogue_version_mutable BEFORE UPDATE ON hcm.job_catalogue_version
  FOR EACH ROW EXECUTE FUNCTION hcm.require_architecture_version_mutable();
CREATE TRIGGER job_profile_version_mutable BEFORE UPDATE ON hcm.job_profile_version
  FOR EACH ROW EXECUTE FUNCTION hcm.require_architecture_version_mutable();

-- Children of a catalogue or profile version change only while that version is a draft. The
-- migrator may delete them when a seed module is reset.
CREATE FUNCTION hcm.require_draft_architecture_parent() RETURNS trigger LANGUAGE plpgsql AS $draft$
DECLARE
  row_data jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  parent_status text;
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'hcm_migrator' THEN
    RETURN OLD;
  END IF;
  IF TG_ARGV[0] = 'catalogue' THEN
    SELECT status INTO parent_status FROM hcm.job_catalogue_version
      WHERE tenant_id = row_data->>'tenant_id' AND id = row_data->>'job_catalogue_version_id';
  ELSE
    SELECT status INTO parent_status FROM hcm.job_profile_version
      WHERE tenant_id = row_data->>'tenant_id' AND id = row_data->>'job_profile_version_id';
  END IF;
  IF parent_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Only draft architecture versions can change' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$draft$;
DO $children$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['job_family','career_track','job_level','job_band','job_grade'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON hcm.%I FOR EACH ROW EXECUTE FUNCTION hcm.require_draft_architecture_parent(%L)', relation || '_draft_only', relation, 'catalogue');
  END LOOP;
  FOREACH relation IN ARRAY ARRAY['job_profile_responsibility','job_profile_requirement','job_profile_grade'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON hcm.%I FOR EACH ROW EXECUTE FUNCTION hcm.require_draft_architecture_parent(%L)', relation || '_draft_only', relation, 'profile');
  END LOOP;
END
$children$;

-- A family's depth and path derive from its parent, which must be a root of the same version.
CREATE FUNCTION hcm.derive_job_family_path() RETURNS trigger LANGUAGE plpgsql AS $path$
DECLARE parent record;
BEGIN
  IF NEW.parent_job_family_id IS NULL THEN
    NEW.depth := 1;
    NEW.materialized_path := NEW.code;
  ELSE
    SELECT depth, materialized_path INTO parent FROM hcm.job_family
      WHERE tenant_id = NEW.tenant_id AND job_catalogue_version_id = NEW.job_catalogue_version_id AND id = NEW.parent_job_family_id;
    IF parent.depth IS NULL THEN
      RAISE EXCEPTION 'Parent job family is unknown' USING ERRCODE = '23503';
    END IF;
    IF parent.depth <> 1 THEN
      RAISE EXCEPTION 'Job families are at most two levels deep' USING ERRCODE = '23514';
    END IF;
    NEW.depth := 2;
    NEW.materialized_path := parent.materialized_path || '/' || NEW.code;
  END IF;
  RETURN NEW;
END
$path$;
CREATE TRIGGER job_family_path BEFORE INSERT ON hcm.job_family
  FOR EACH ROW EXECUTE FUNCTION hcm.derive_job_family_path();

-- A profile version leaving draft has at least one allowed grade and exactly one default
-- (business rule 7), and references a published catalogue version.
CREATE FUNCTION hcm.require_job_profile_version_complete() RETURNS trigger LANGUAGE plpgsql AS $complete$
DECLARE
  grades integer;
  defaults integer;
  catalogue_status text;
BEGIN
  IF NEW.status IN ('InReview','Published') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT count(*), count(*) FILTER (WHERE is_default) INTO grades, defaults FROM hcm.job_profile_grade
      WHERE tenant_id = NEW.tenant_id AND job_profile_version_id = NEW.id;
    IF grades < 1 OR defaults <> 1 THEN
      RAISE EXCEPTION 'A job profile version needs allowed grades with exactly one default' USING ERRCODE = '23514';
    END IF;
    SELECT status INTO catalogue_status FROM hcm.job_catalogue_version
      WHERE tenant_id = NEW.tenant_id AND id = NEW.job_catalogue_version_id;
    IF catalogue_status NOT IN ('Published','Superseded') THEN
      RAISE EXCEPTION 'A job profile version references a published catalogue version' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END
$complete$;
CREATE CONSTRAINT TRIGGER job_profile_version_complete AFTER UPDATE ON hcm.job_profile_version
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_job_profile_version_complete();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['job_catalogue','job_catalogue_version','job_family','career_track','job_level','job_band','job_grade','job_profile','job_profile_version','job_profile_responsibility','job_profile_requirement','job_profile_grade','job_architecture_command_receipt'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT, INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Codes, parents and version references are fixed for life; lifecycle columns move only as the
-- immutability trigger allows. Draft profile children are replaced, never edited in place.
GRANT UPDATE (name,description,current_published_version_id,revision,updated_at,updated_by_account_id) ON hcm.job_catalogue TO hcm_runtime;
GRANT UPDATE (name,current_published_version_id,revision,updated_at,updated_by_account_id) ON hcm.job_profile TO hcm_runtime;
GRANT UPDATE (status,effective_from,effective_to,change_summary,source_digest,published_at,published_by_account_id,revision,updated_at,updated_by_account_id) ON hcm.job_catalogue_version TO hcm_runtime;
GRANT UPDATE (job_catalogue_version_id,job_family_id,career_track_id,job_level_id,status,summary,purpose,scope_of_impact,autonomy_level,effective_from,effective_to,source_digest,published_at,published_by_account_id,revision,updated_at,updated_by_account_id) ON hcm.job_profile_version TO hcm_runtime;
GRANT UPDATE (name,description,sort_order,is_active,revision,updated_at,updated_by_account_id) ON hcm.job_family, hcm.career_track TO hcm_runtime;
GRANT UPDATE (name,description,sequence_number,scope_summary,is_active,revision,updated_at,updated_by_account_id) ON hcm.job_level TO hcm_runtime;
GRANT UPDATE (name,description,sequence_number,is_active,revision,updated_at,updated_by_account_id) ON hcm.job_band, hcm.job_grade TO hcm_runtime;
GRANT DELETE ON hcm.job_profile_responsibility, hcm.job_profile_requirement, hcm.job_profile_grade TO hcm_runtime;
