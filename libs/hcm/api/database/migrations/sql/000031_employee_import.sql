-- Ownership: employee. Employee Import templates, runs, rows and issues (TDD-HCM-2-DATA-MODEL
-- migration order 10, Employee Import TDD#DATA). Rows and issues never hold source values: a row
-- keeps a digest of its source cells so commit can re-read the staged file and detect drift, and
-- an issue keeps a field, a code and a safe message only.

CREATE TABLE hcm.employee_import_template (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  version_number integer NOT NULL CHECK (version_number > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  file_format text NOT NULL CHECK (file_format IN ('Csv','Xlsx')),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Published','Retired')),
  has_header_row boolean NOT NULL DEFAULT true,
  date_format text NOT NULL CHECK (date_format IN ('yyyy-MM-dd','dd/MM/yyyy','MM/dd/yyyy','dd.MM.yyyy')),
  time_zone text NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 64),
  supersedes_template_id text,
  published_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by_account_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code,version_number),
  CONSTRAINT employee_import_template_published CHECK ((status = 'Draft') = (published_at IS NULL)),
  FOREIGN KEY (tenant_id,supersedes_template_id) REFERENCES hcm.employee_import_template(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- One draft per template code at a time.
CREATE UNIQUE INDEX employee_import_template_one_draft ON hcm.employee_import_template (tenant_id,code) WHERE status = 'Draft';

CREATE TABLE hcm.employee_import_template_column (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  template_id text NOT NULL,
  source_column_name text NOT NULL CHECK (length(btrim(source_column_name)) BETWEEN 1 AND 100),
  source_column_ordinal integer NOT NULL CHECK (source_column_ordinal BETWEEN 1 AND 100),
  standard_field_code text NOT NULL REFERENCES hcm.profile_field_definition(code),
  transformation_code text NOT NULL DEFAULT 'none' CHECK (transformation_code IN ('none','trim','uppercase','lowercase')),
  is_match_key boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL CHECK (sort_order BETWEEN 0 AND 999),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,template_id,standard_field_code),
  UNIQUE (tenant_id,template_id,source_column_ordinal),
  FOREIGN KEY (tenant_id,template_id) REFERENCES hcm.employee_import_template(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- A published template version is immutable: its columns change only while it is a draft.
CREATE FUNCTION hcm.require_draft_import_template() RETURNS trigger LANGUAGE plpgsql AS $draft$
DECLARE parent_status text;
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'hcm_migrator' THEN
    RETURN OLD;
  END IF;
  SELECT status INTO parent_status FROM hcm.employee_import_template
    WHERE tenant_id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END)
      AND id = (CASE WHEN TG_OP = 'DELETE' THEN OLD.template_id ELSE NEW.template_id END);
  IF parent_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Only draft import templates can change' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$draft$;
CREATE TRIGGER employee_import_template_column_draft_only BEFORE INSERT OR UPDATE OR DELETE ON hcm.employee_import_template_column
  FOR EACH ROW EXECUTE FUNCTION hcm.require_draft_import_template();

CREATE TABLE hcm.employee_import_run (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  template_id text NOT NULL,
  source_blob_id uuid NOT NULL,
  source_file_name text NOT NULL CHECK (length(btrim(source_file_name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'Uploaded' CHECK (status IN ('Uploaded','Validating','ReadyToCommit','Committing','Completed','CompletedWithErrors','Failed','Cancelled')),
  intended_action text NOT NULL CHECK (intended_action IN ('Create','Update','Upsert')),
  parser_version text CHECK (parser_version ~ '^[a-z0-9.-]{1,40}$'),
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  total_row_count integer NOT NULL DEFAULT 0 CHECK (total_row_count BETWEEN 0 AND 2000),
  valid_row_count integer NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  invalid_row_count integer NOT NULL DEFAULT 0 CHECK (invalid_row_count >= 0),
  committed_row_count integer NOT NULL DEFAULT 0 CHECK (committed_row_count >= 0),
  failed_row_count integer NOT NULL DEFAULT 0 CHECK (failed_row_count >= 0),
  skipped_row_count integer NOT NULL DEFAULT 0 CHECK (skipped_row_count >= 0),
  failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  cancel_reason text CHECK (length(btrim(cancel_reason)) BETWEEN 1 AND 500),
  requested_by_account_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  validation_completed_at timestamptz,
  commit_requested_by_account_id text,
  commit_requested_at timestamptz,
  completed_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,source_blob_id),
  -- The parser version is fixed when validation starts.
  CONSTRAINT employee_import_run_parser CHECK (status IN ('Uploaded','Cancelled') OR parser_version IS NOT NULL),
  CONSTRAINT employee_import_run_counts CHECK (
    valid_row_count + invalid_row_count <= total_row_count
    AND committed_row_count + failed_row_count + skipped_row_count <= total_row_count),
  CONSTRAINT employee_import_run_cancelled CHECK ((status = 'Cancelled') = (cancel_reason IS NOT NULL)),
  FOREIGN KEY (tenant_id,template_id) REFERENCES hcm.employee_import_template(tenant_id,id),
  FOREIGN KEY (tenant_id,source_blob_id) REFERENCES hcm.document_blob(tenant_id,id),
  FOREIGN KEY (tenant_id,requested_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,commit_requested_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX employee_import_run_list ON hcm.employee_import_run (tenant_id,created_at DESC,id DESC);

-- A run reads only an import source, and only a published template version.
CREATE FUNCTION hcm.require_import_run_sources() RETURNS trigger LANGUAGE plpgsql AS $sources$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hcm.document_blob WHERE tenant_id=NEW.tenant_id AND id=NEW.source_blob_id AND purpose='import-source') THEN
    RAISE EXCEPTION 'An import run reads only an import source' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM hcm.employee_import_template WHERE tenant_id=NEW.tenant_id AND id=NEW.template_id AND status='Published') THEN
    RAISE EXCEPTION 'An import run uses a published template version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$sources$;
CREATE TRIGGER employee_import_run_sources BEFORE INSERT ON hcm.employee_import_run
  FOR EACH ROW EXECUTE FUNCTION hcm.require_import_run_sources();

CREATE TABLE hcm.employee_import_row (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  run_id text NOT NULL,
  source_row_number integer NOT NULL CHECK (source_row_number BETWEEN 1 AND 2001),
  source_row_digest text NOT NULL CHECK (source_row_digest ~ '^[a-f0-9]{64}$'),
  match_status text NOT NULL CHECK (match_status IN ('NotRequired','None','Unique','Ambiguous')),
  proposed_action text NOT NULL CHECK (proposed_action IN ('Create','Update','Skip','Reject')),
  status text NOT NULL CHECK (status IN ('Valid','Invalid','Committed','CommitFailed','Skipped')),
  matched_worker_ids text[] NOT NULL DEFAULT '{}' CHECK (cardinality(matched_worker_ids) <= 20),
  resolution text CHECK (resolution IN ('UseExisting','CreateNew','Skip')),
  resolution_worker_id text,
  resolution_reason text CHECK (length(btrim(resolution_reason)) BETWEEN 1 AND 500),
  resolved_by_account_id text,
  resolved_at timestamptz,
  row_idempotency_key text NOT NULL CHECK (length(row_idempotency_key) BETWEEN 1 AND 300),
  result_worker_id text,
  failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  committed_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,run_id,source_row_number),
  UNIQUE (tenant_id,row_idempotency_key),
  CONSTRAINT employee_import_row_resolution CHECK (
    (resolution IS NULL) = (resolved_by_account_id IS NULL)
    AND (resolution IS DISTINCT FROM 'UseExisting' OR resolution_worker_id IS NOT NULL)
    AND (resolution IS DISTINCT FROM 'CreateNew' OR resolution_reason IS NOT NULL)),
  CONSTRAINT employee_import_row_committed CHECK ((status = 'Committed') = (committed_at IS NOT NULL)),
  CONSTRAINT employee_import_row_failed CHECK ((status = 'CommitFailed') = (failure_code IS NOT NULL)),
  FOREIGN KEY (tenant_id,run_id) REFERENCES hcm.employee_import_run(tenant_id,id),
  FOREIGN KEY (tenant_id,resolution_worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,result_worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,resolved_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX employee_import_row_list ON hcm.employee_import_row (tenant_id,run_id,source_row_number);

CREATE TABLE hcm.employee_import_issue (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  run_id text NOT NULL,
  row_id text,
  standard_field_code text REFERENCES hcm.profile_field_definition(code),
  source_column_name text CHECK (length(source_column_name) <= 100),
  severity text NOT NULL CHECK (severity IN ('Warning','Error')),
  issue_code text NOT NULL CHECK (issue_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  safe_message text NOT NULL CHECK (length(btrim(safe_message)) BETWEEN 1 AND 300),
  is_blocking boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,run_id) REFERENCES hcm.employee_import_run(tenant_id,id),
  FOREIGN KEY (tenant_id,row_id) REFERENCES hcm.employee_import_row(tenant_id,id)
);
CREATE INDEX employee_import_issue_list ON hcm.employee_import_issue (tenant_id,run_id,row_id);

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['employee_import_template','employee_import_template_column','employee_import_run','employee_import_row','employee_import_issue'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT, INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Draft columns are replaced as a set; issues are replaced when a run is validated again.
GRANT UPDATE (name,description,file_format,status,has_header_row,date_format,time_zone,published_at,revision,updated_by_account_id,updated_at) ON hcm.employee_import_template TO hcm_runtime;
GRANT DELETE ON hcm.employee_import_template_column TO hcm_runtime;
GRANT UPDATE (status,parser_version,total_row_count,valid_row_count,invalid_row_count,committed_row_count,failed_row_count,skipped_row_count,failure_code,cancel_reason,validation_completed_at,commit_requested_by_account_id,commit_requested_at,completed_at,revision,updated_at) ON hcm.employee_import_run TO hcm_runtime;
GRANT UPDATE (status,proposed_action,resolution,resolution_worker_id,resolution_reason,resolved_by_account_id,resolved_at,result_worker_id,failure_code,committed_at,revision,updated_at) ON hcm.employee_import_row TO hcm_runtime;
