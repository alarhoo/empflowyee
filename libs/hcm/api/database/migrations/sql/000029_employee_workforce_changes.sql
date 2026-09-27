-- Ownership: employee. Employment change requests, approvals and execution steps
-- (TDD-HCM-2-DATA-MODEL migration order 9, Employment Changes TDD#DATA).
-- A request records typed target facts; a null target keeps the current value and
-- cleared_fields names the optional facts a request sets to none. Workforce facts change only
-- when a request executes, through WorkforceFactsPort in the same transaction.

CREATE TABLE hcm.workforce_change_request (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  worker_id text NOT NULL,
  employment_id text,
  assignment_id text,
  change_type text NOT NULL CHECK (change_type IN ('Rehire','Transfer','Promotion','Demotion','LocationChange','ManagerChange','HoursChange','EmploymentTypeChange','Suspension','ReturnToWork','Correction')),
  effective_date date NOT NULL,
  expected_employment_revision integer CHECK (expected_employment_revision > 0),
  expected_assignment_revision integer CHECK (expected_assignment_revision > 0),
  target_worker_type_id text,
  target_legal_entity_id text,
  target_employment_type text CHECK (target_employment_type IN ('Permanent','FixedTerm','Contract','Internship','Apprenticeship','Consultant')),
  target_employment_status text CHECK (target_employment_status IN ('Active','Suspended')),
  target_continuous_service_start_date date,
  target_probation_end_date date,
  target_notice_period_days smallint CHECK (target_notice_period_days BETWEEN 0 AND 365),
  target_organisation_id text,
  target_department_id text,
  target_designation_id text,
  target_location_id text,
  target_position_id text,
  target_job_title text CHECK (length(btrim(target_job_title)) BETWEEN 1 AND 150),
  target_work_mode text CHECK (target_work_mode IN ('OnSite','Remote','Hybrid')),
  target_full_time_equivalent numeric(4,2) CHECK (target_full_time_equivalent > 0 AND target_full_time_equivalent <= 1),
  target_standard_hours_per_week numeric(5,2) CHECK (target_standard_hours_per_week > 0 AND target_standard_hours_per_week <= 168),
  target_cost_center_code text CHECK (length(target_cost_center_code) <= 40),
  target_manager_assignment_id text,
  cleared_fields text[] NOT NULL DEFAULT '{}' CHECK (cleared_fields <@ ARRAY['departmentId','designationId','positionId','probationEndDate','noticePeriodDays','standardHoursPerWeek','costCenterCode','managerAssignmentId']::text[]),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  reason_detail text NOT NULL DEFAULT '' CHECK (length(reason_detail) <= 1000),
  evidence_reference text NOT NULL DEFAULT '' CHECK (length(evidence_reference) <= 200),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','PendingApproval','Approved','Rejected','Executing','Completed','Failed','Cancelled')),
  approval_policy_code text CHECK (approval_policy_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  approval_policy_version integer CHECK (approval_policy_version > 0),
  requested_by_account_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text CHECK (length(btrim(cancel_reason)) BETWEEN 1 AND 500),
  failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  result_employment_id text,
  result_assignment_id text,
  idempotency_key uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,idempotency_key),
  -- A rehire starts a new employment; every other change acts on an existing one.
  CONSTRAINT workforce_change_request_subject CHECK ((change_type = 'Rehire') = (employment_id IS NULL)),
  CONSTRAINT workforce_change_request_assignment CHECK (assignment_id IS NULL OR employment_id IS NOT NULL),
  -- The approval policy is snapshotted at submission and never before.
  CONSTRAINT workforce_change_request_policy CHECK (
    (approval_policy_code IS NULL) = (approval_policy_version IS NULL)
    AND (status IN ('Draft','Cancelled') OR approval_policy_code IS NOT NULL)),
  CONSTRAINT workforce_change_request_submitted CHECK (status = 'Draft' OR status = 'Cancelled' OR submitted_at IS NOT NULL),
  CONSTRAINT workforce_change_request_cancelled CHECK ((status = 'Cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)),
  CONSTRAINT workforce_change_request_completed CHECK ((status = 'Completed') = (completed_at IS NOT NULL)),
  CONSTRAINT workforce_change_request_failed CHECK ((status = 'Failed') = (failure_code IS NOT NULL)),
  FOREIGN KEY (tenant_id,worker_id) REFERENCES hcm.worker(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,target_worker_type_id) REFERENCES hcm.worker_type(tenant_id,id),
  FOREIGN KEY (tenant_id,target_legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id),
  FOREIGN KEY (tenant_id,target_organisation_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY (tenant_id,target_department_id) REFERENCES hcm.department(tenant_id,id),
  FOREIGN KEY (tenant_id,target_designation_id) REFERENCES hcm.designation(tenant_id,id),
  FOREIGN KEY (tenant_id,target_location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY (tenant_id,target_position_id) REFERENCES hcm.position(tenant_id,id),
  FOREIGN KEY (tenant_id,target_manager_assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,result_employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,result_assignment_id) REFERENCES hcm.assignment(tenant_id,id),
  FOREIGN KEY (tenant_id,requested_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- Business rule 17: nonterminal requests never overlap the same employment and effective date.
-- A failed request stays open for a retried Apply.
CREATE UNIQUE INDEX workforce_change_request_one_open ON hcm.workforce_change_request (tenant_id,employment_id,effective_date)
  WHERE employment_id IS NOT NULL AND status IN ('Draft','PendingApproval','Approved','Executing','Failed');
CREATE UNIQUE INDEX workforce_change_request_one_open_rehire ON hcm.workforce_change_request (tenant_id,worker_id,effective_date)
  WHERE change_type = 'Rehire' AND status IN ('Draft','PendingApproval','Approved','Executing','Failed');
CREATE INDEX workforce_change_request_status ON hcm.workforce_change_request (tenant_id,status,effective_date,id);
CREATE INDEX workforce_change_request_worker ON hcm.workforce_change_request (tenant_id,worker_id,effective_date);

CREATE TABLE hcm.workforce_change_approval (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  request_id text NOT NULL,
  approval_slot_code text NOT NULL CHECK (approval_slot_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  decided_by_account_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('Approved','Rejected')),
  authority_code text NOT NULL CHECK (length(authority_code) BETWEEN 1 AND 100),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  -- DEC-HCM2-002: one approver fills one slot.
  UNIQUE (tenant_id,request_id,approval_slot_code),
  UNIQUE (tenant_id,request_id,decided_by_account_id),
  FOREIGN KEY (tenant_id,request_id) REFERENCES hcm.workforce_change_request(tenant_id,id),
  FOREIGN KEY (tenant_id,decided_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- The requester never decides their own request, whatever their permissions (DEC-HCM2-002).
CREATE FUNCTION hcm.require_independent_workforce_change_approval() RETURNS trigger LANGUAGE plpgsql AS $independent$
DECLARE requester text;
BEGIN
  SELECT requested_by_account_id INTO requester FROM hcm.workforce_change_request
    WHERE tenant_id = NEW.tenant_id AND id = NEW.request_id;
  IF requester IS NULL OR requester = NEW.decided_by_account_id THEN
    RAISE EXCEPTION 'The requester cannot decide their own employment change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$independent$;
CREATE CONSTRAINT TRIGGER workforce_change_approval_independent AFTER INSERT ON hcm.workforce_change_approval
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_independent_workforce_change_approval();

CREATE TABLE hcm.workforce_change_execution_step (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  request_id text NOT NULL,
  step_code text NOT NULL CHECK (step_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  sequence_number integer NOT NULL CHECK (sequence_number BETWEEN 1 AND 99),
  status text NOT NULL CHECK (status IN ('Pending','Running','Succeeded','Failed','Skipped')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 300),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  result_entity_type text CHECK (result_entity_type IN ('employment','assignment','reporting_line','worker_event')),
  result_entity_id text CHECK (length(result_entity_id) BETWEEN 1 AND 200),
  failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9-]{1,59}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  -- Each attempt of a request records its steps once; a retried Apply starts a new attempt.
  UNIQUE (tenant_id,request_id,attempt_count,sequence_number),
  UNIQUE (tenant_id,idempotency_key),
  CONSTRAINT workforce_change_execution_step_result CHECK ((result_entity_type IS NULL) = (result_entity_id IS NULL)),
  CONSTRAINT workforce_change_execution_step_failure CHECK ((status = 'Failed') = (failure_code IS NOT NULL)),
  FOREIGN KEY (tenant_id,request_id) REFERENCES hcm.workforce_change_request(tenant_id,id)
);

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['workforce_change_request','workforce_change_approval','workforce_change_execution_step'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT, INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Subjects, requesters and idempotency keys are fixed for life; approvals and execution steps
-- are append-only evidence.
GRANT UPDATE (effective_date,expected_employment_revision,expected_assignment_revision,target_worker_type_id,target_legal_entity_id,target_employment_type,target_employment_status,target_continuous_service_start_date,target_probation_end_date,target_notice_period_days,target_organisation_id,target_department_id,target_designation_id,target_location_id,target_position_id,target_job_title,target_work_mode,target_full_time_equivalent,target_standard_hours_per_week,target_cost_center_code,target_manager_assignment_id,cleared_fields,reason_code,reason_detail,evidence_reference,status,approval_policy_code,approval_policy_version,submitted_at,approved_at,completed_at,cancelled_at,cancel_reason,failure_code,result_employment_id,result_assignment_id,revision,updated_at) ON hcm.workforce_change_request TO hcm_runtime;
