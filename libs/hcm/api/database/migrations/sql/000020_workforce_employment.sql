-- Ownership: workforce-foundation. HCM-2 employment, assignment, reporting lines and worker events.
-- Version-1 rows are minimal spine rows. Each grouped fact set is all-or-none, so HCM-2 commands
-- write only established rows while the immutable seed and positional test inserts stay valid.

ALTER TABLE hcm.employment
  ADD COLUMN legal_entity_id text,
  ADD COLUMN employment_type text CHECK (employment_type IN ('Permanent','FixedTerm','Contract','Internship','Apprenticeship','Consultant')),
  ADD COLUMN employment_status text CHECK (employment_status IN ('Pending','Active','OnNotice','Suspended','Ended')),
  ADD COLUMN hire_date date,
  ADD COLUMN employment_sequence smallint CHECK (employment_sequence > 0),
  ADD COLUMN is_primary_employment boolean,
  ADD COLUMN work_email text CHECK (length(work_email) <= 254 AND work_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  ADD COLUMN continuous_service_start_date date,
  ADD COLUMN probation_end_date date,
  ADD COLUMN probation_status text CHECK (probation_status IN ('NotApplicable','InProgress','Confirmed','Extended','Failed')),
  ADD COLUMN confirmed_on date,
  ADD COLUMN notice_period_days smallint CHECK (notice_period_days BETWEEN 0 AND 365),
  ADD COLUMN resignation_submitted_on date,
  ADD COLUMN last_working_date date,
  ADD COLUMN employment_end_date date,
  ADD COLUMN employment_end_reason_id text,
  ADD COLUMN is_eligible_for_rehire boolean,
  ADD COLUMN rehire_eligibility_note text NOT NULL DEFAULT '' CHECK (length(rehire_eligibility_note) <= 500),
  ADD COLUMN employment_period daterange GENERATED ALWAYS AS (
    CASE WHEN hire_date IS NULL THEN NULL ELSE daterange(hire_date, employment_end_date + 1, '[)') END
  ) STORED,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_account_id text,
  ADD COLUMN updated_by_account_id text,
  ADD CONSTRAINT employment_established CHECK (
    (legal_entity_id IS NULL AND employment_type IS NULL AND employment_status IS NULL AND hire_date IS NULL AND employment_sequence IS NULL AND is_primary_employment IS NULL)
    OR (legal_entity_id IS NOT NULL AND employment_type IS NOT NULL AND employment_status IS NOT NULL AND hire_date IS NOT NULL AND employment_sequence IS NOT NULL AND is_primary_employment IS NOT NULL)),
  ADD CONSTRAINT employment_dates CHECK (employment_end_date IS NULL OR hire_date IS NULL OR employment_end_date >= hire_date),
  ADD CONSTRAINT employment_last_day CHECK (last_working_date IS NULL OR employment_end_date IS NULL OR last_working_date <= employment_end_date),
  ADD CONSTRAINT employment_ended CHECK (employment_status IS DISTINCT FROM 'Ended' OR employment_end_date IS NOT NULL),
  ADD CONSTRAINT employment_probation CHECK (probation_status IS DISTINCT FROM 'Confirmed' OR confirmed_on IS NOT NULL),
  ADD CONSTRAINT employment_legal_entity FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id),
  ADD CONSTRAINT employment_end_reason_reference FOREIGN KEY (tenant_id,employment_end_reason_id) REFERENCES hcm.employment_end_reason(tenant_id,id),
  ADD CONSTRAINT employment_no_overlap EXCLUDE USING gist (tenant_id WITH =, worker_id WITH =, legal_entity_id WITH =, employment_period WITH &&) WHERE (employment_period IS NOT NULL),
  ADD CONSTRAINT employment_one_primary EXCLUDE USING gist (tenant_id WITH =, worker_id WITH =, employment_period WITH &&) WHERE (is_primary_employment),
  ADD CONSTRAINT employment_creator FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  ADD CONSTRAINT employment_updater FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id);
CREATE INDEX employment_work_email ON hcm.employment (tenant_id, lower(work_email)) WHERE work_email IS NOT NULL;

-- organisation_id is the org unit and location_id the work location; job_title is the title snapshot.
ALTER TABLE hcm.assignment
  ADD COLUMN department_id text,
  ADD COLUMN designation_id text,
  ADD COLUMN work_mode text CHECK (work_mode IN ('OnSite','Remote','Hybrid')),
  ADD COLUMN full_time_equivalent numeric(4,2) CHECK (full_time_equivalent > 0 AND full_time_equivalent <= 1),
  ADD COLUMN standard_hours_per_week numeric(5,2) CHECK (standard_hours_per_week > 0 AND standard_hours_per_week <= 168),
  ADD COLUMN is_primary_assignment boolean,
  ADD COLUMN is_billable boolean NOT NULL DEFAULT false,
  ADD COLUMN cost_center_code text NOT NULL DEFAULT '' CHECK (length(cost_center_code) <= 40),
  ADD COLUMN effective_from date,
  ADD COLUMN effective_to date,
  ADD COLUMN effective_period daterange GENERATED ALWAYS AS (
    CASE WHEN effective_from IS NULL THEN NULL ELSE daterange(effective_from, effective_to + 1, '[)') END
  ) STORED,
  ADD COLUMN superseded_by_id text,
  ADD COLUMN change_note text NOT NULL DEFAULT '' CHECK (length(change_note) <= 500),
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by_account_id text,
  ADD COLUMN updated_by_account_id text,
  ADD CONSTRAINT assignment_established CHECK (
    (effective_from IS NULL AND is_primary_assignment IS NULL AND work_mode IS NULL AND full_time_equivalent IS NULL)
    OR (effective_from IS NOT NULL AND is_primary_assignment IS NOT NULL AND work_mode IS NOT NULL AND full_time_equivalent IS NOT NULL)),
  ADD CONSTRAINT assignment_dates CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  ADD CONSTRAINT assignment_superseded_closed CHECK (superseded_by_id IS NULL OR effective_to IS NOT NULL),
  ADD CONSTRAINT assignment_superseded_self CHECK (superseded_by_id IS NULL OR superseded_by_id <> id),
  ADD CONSTRAINT assignment_department FOREIGN KEY (tenant_id,department_id) REFERENCES hcm.department(tenant_id,id),
  ADD CONSTRAINT assignment_designation FOREIGN KEY (tenant_id,designation_id) REFERENCES hcm.designation(tenant_id,id),
  ADD CONSTRAINT assignment_successor FOREIGN KEY (tenant_id,superseded_by_id) REFERENCES hcm.assignment(tenant_id,id),
  ADD CONSTRAINT assignment_one_primary EXCLUDE USING gist (tenant_id WITH =, employment_id WITH =, effective_period WITH &&) WHERE (is_primary_assignment),
  ADD CONSTRAINT assignment_creator FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  ADD CONSTRAINT assignment_updater FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id);
CREATE INDEX assignment_unit_period ON hcm.assignment USING gist (tenant_id, organisation_id, effective_period);
CREATE INDEX assignment_employment_period ON hcm.assignment USING gist (tenant_id, employment_id, effective_period);

-- A line points at the manager's assignment so it survives the manager's own transfer correctly.
CREATE TABLE hcm.reporting_line (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  assignment_id text NOT NULL,
  manager_assignment_id text NOT NULL,
  reporting_line_type text NOT NULL CHECK (reporting_line_type IN ('Solid','Dotted','Temporary','Administrative')),
  is_primary boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to + 1, '[)')) STORED,
  delegated_from_reporting_line_id text,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT reporting_line_self CHECK (assignment_id <> manager_assignment_id),
  CONSTRAINT reporting_line_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT reporting_line_primary_solid CHECK (NOT is_primary OR reporting_line_type = 'Solid'),
  CONSTRAINT reporting_line_delegation CHECK (delegated_from_reporting_line_id IS NULL OR reporting_line_type = 'Temporary'),
  CONSTRAINT reporting_line_one_primary EXCLUDE USING gist (tenant_id WITH =, assignment_id WITH =, effective_period WITH &&) WHERE (is_primary),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,manager_assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,delegated_from_reporting_line_id) REFERENCES hcm.reporting_line(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX reporting_line_manager ON hcm.reporting_line USING gist (tenant_id, manager_assignment_id, effective_period);
CREATE INDEX reporting_line_assignment ON hcm.reporting_line USING gist (tenant_id, assignment_id, effective_period);

-- Append-only lifecycle evidence; runtime may insert and read but never change or delete.
CREATE TABLE hcm.worker_event (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  worker_id text NOT NULL,
  employment_id text,
  assignment_id text,
  worker_event_type_id text NOT NULL,
  effective_date date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
  approved_by_account_id text,
  approved_on date,
  previous_value_summary text NOT NULL DEFAULT '' CHECK (length(previous_value_summary) <= 1000),
  new_value_summary text NOT NULL DEFAULT '' CHECK (length(new_value_summary) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT worker_event_approval CHECK ((approved_by_account_id IS NULL) = (approved_on IS NULL)),
  CONSTRAINT worker_event_assignment_employment CHECK (assignment_id IS NULL OR employment_id IS NOT NULL),
  FOREIGN KEY (tenant_id,worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,worker_event_type_id) REFERENCES hcm.worker_event_type(tenant_id,id),
  FOREIGN KEY (tenant_id,approved_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX worker_event_timeline ON hcm.worker_event (tenant_id, worker_id, effective_date, recorded_at, id);

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['reporting_line','worker_event'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Employment facts change by explicit command; identity, worker and legacy unit stay fixed.
GRANT INSERT (tenant_id,id,worker_id,organisation_id,legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment,work_email,continuous_service_start_date,probation_end_date,probation_status,notice_period_days,created_by_account_id,updated_by_account_id) ON hcm.employment TO hcm_runtime;
GRANT UPDATE (legal_entity_id,employment_type,employment_status,hire_date,employment_sequence,is_primary_employment,work_email,continuous_service_start_date,probation_end_date,probation_status,confirmed_on,notice_period_days,resignation_submitted_on,last_working_date,employment_end_date,employment_end_reason_id,is_eligible_for_rehire,rehire_eligibility_note,revision,updated_at,updated_by_account_id) ON hcm.employment TO hcm_runtime;
-- Assignments are superseded, never rewritten: only closing columns are updatable.
GRANT INSERT (tenant_id,id,employment_id,organisation_id,location_id,job_title,department_id,designation_id,work_mode,full_time_equivalent,standard_hours_per_week,is_primary_assignment,is_billable,cost_center_code,effective_from,change_note,created_by_account_id,updated_by_account_id) ON hcm.assignment TO hcm_runtime;
GRANT UPDATE (effective_to,superseded_by_id,revision,updated_at,updated_by_account_id) ON hcm.assignment TO hcm_runtime;
GRANT UPDATE (effective_to,revision,updated_at,updated_by_account_id) ON hcm.reporting_line TO hcm_runtime;
