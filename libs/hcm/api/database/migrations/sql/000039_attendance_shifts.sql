-- Attendance-owned reusable shifts. SQL-first forward migration; no automatic assignments.
CREATE TABLE hcm.shift (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.shift_version (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  shift_id text NOT NULL,
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
  minimum_rest_minutes bigint CHECK (minimum_rest_minutes BETWEEN 0 AND 9007199254740991),
  minimum_rest_mode text CHECK (minimum_rest_mode IN ('Warn','Block')),
  supersedes_id text,
  created_by_account_id text NOT NULL,
  published_by_account_id text,
  published_at timestamptz,
  publication_digest text CHECK (publication_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,shift_id,version_number),
  FOREIGN KEY (tenant_id,shift_id) REFERENCES hcm.shift(tenant_id,id),
  UNIQUE (tenant_id,shift_id,id),
  FOREIGN KEY (tenant_id,shift_id,supersedes_id) REFERENCES hcm.shift_version(tenant_id,shift_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK (effective_to IS NULL OR effective_to>=effective_from),
  CHECK ((timezone_mode='Fixed' AND fixed_zone IS NOT NULL AND length(fixed_zone) BETWEEN 1 AND 100)
    OR (timezone_mode<>'Fixed' AND fixed_zone IS NULL)),
  CHECK ((minimum_rest_minutes IS NULL)=(minimum_rest_mode IS NULL)),
  CHECK (supersedes_id IS NULL OR supersedes_id<>id),
  CHECK ((state='Draft' AND published_at IS NULL AND published_by_account_id IS NULL AND publication_digest IS NULL)
    OR (state<>'Draft' AND published_at IS NOT NULL AND published_by_account_id IS NOT NULL AND publication_digest IS NOT NULL)),
  EXCLUDE USING gist (tenant_id WITH =,shift_id WITH =,effective_period WITH &&) WHERE (state='Published')
);
CREATE INDEX shift_version_state ON hcm.shift_version(tenant_id,state,shift_id,id);

CREATE TABLE hcm.shift_segment (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  version_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal>0),
  kind text NOT NULL CHECK (kind IN ('Work','UnpaidBreak')),
  start_time time NOT NULL,
  end_time time NOT NULL,
  start_day_offset smallint NOT NULL CHECK (start_day_offset IN (0,1)),
  end_day_offset smallint NOT NULL CHECK (end_day_offset IN (0,1)),
  start_overlap_choice text CHECK (start_overlap_choice IN ('Earlier','Later')),
  end_overlap_choice text CHECK (end_overlap_choice IN ('Earlier','Later')),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,version_id,ordinal),
  FOREIGN KEY (tenant_id,version_id) REFERENCES hcm.shift_version(tenant_id,id),
  CHECK (extract(microseconds FROM start_time)::bigint % 1000=0 AND extract(microseconds FROM end_time)::bigint % 1000=0),
  CHECK (start_time<'24:00'::time AND end_time<'24:00'::time),
  CHECK (end_day_offset>=start_day_offset),
  CHECK ((end_day_offset*86400+extract(epoch FROM end_time))>(start_day_offset*86400+extract(epoch FROM start_time))
    OR (start_overlap_choice IS NOT NULL AND start_overlap_choice='Earlier' AND end_overlap_choice IS NOT NULL AND end_overlap_choice='Later'))
);

-- Reusable shift content is frozen independently of schedules and rosters.
-- The shared Attendance child guard locks this version using a fixed DDL argument.
CREATE TRIGGER shift_segment_draft BEFORE INSERT OR UPDATE OR DELETE ON hcm.shift_segment
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_configuration_child('shift_version');

CREATE FUNCTION hcm.guard_shift_version() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' THEN RAISE EXCEPTION 'Create Draft before publication' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Shift revision must advance once' USING ERRCODE='23514'; END IF;
  IF OLD.state<>'Draft' THEN
    IF OLD.state<>'Published' OR NEW.state<>'Retired'
      OR (to_jsonb(NEW)-ARRAY['state','revision','updated_at','effective_period']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','updated_at','effective_period']) THEN
      RAISE EXCEPTION 'Published shift is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state='Retired' THEN RAISE EXCEPTION 'Draft cannot retire as publication evidence' USING ERRCODE='23514'; END IF;
  IF NEW.state='Published' THEN
    IF NEW.timezone_mode='Fixed' AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.fixed_zone) THEN
      RAISE EXCEPTION 'Unknown fixed timezone' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM hcm.shift_segment WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id) THEN
      RAISE EXCEPTION 'Shift requires configured segments' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM (
      SELECT s.*,lag(end_time) OVER w AS prior_end,lag(end_day_offset) OVER w AS prior_day,
        row_number() OVER w AS sequence_number,count(*) OVER() AS segment_count
      FROM hcm.shift_segment s WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id
      WINDOW w AS (ORDER BY ordinal)
    ) shape WHERE ordinal<>sequence_number
      OR (sequence_number=1 AND (kind<>'Work' OR start_day_offset<>0))
      OR (sequence_number=segment_count AND kind<>'Work')
      OR (sequence_number>1 AND (start_time<>prior_end OR start_day_offset<>prior_day))) THEN
      RAISE EXCEPTION 'Shift must be contiguous with internal breaks' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER shift_version_lifecycle BEFORE INSERT OR UPDATE ON hcm.shift_version
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_shift_version();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['shift','shift_version','shift_segment'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
GRANT UPDATE(name,description,effective_from,effective_to,timezone_mode,fixed_zone,minimum_rest_minutes,minimum_rest_mode,
  state,revision,published_at,published_by_account_id,publication_digest,updated_at) ON hcm.shift_version TO hcm_runtime;
GRANT UPDATE(ordinal,kind,start_time,end_time,start_day_offset,end_day_offset,start_overlap_choice,end_overlap_choice) ON hcm.shift_segment TO hcm_runtime;
-- Only Draft children may be replaced, as enforced by the parent-lock trigger.
GRANT DELETE ON hcm.shift_segment TO hcm_runtime;
