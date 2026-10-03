-- Workflow coordinates source-owned DomainManifest approvals. Source references
-- are opaque contract references, not scope targets or permission-bearing rows.
CREATE TABLE hcm.workflow_instance (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('Attendance','Leave')),
  subject_type text NOT NULL,
  definition_mode text NOT NULL CHECK (definition_mode='DomainManifest'),
  registry_version integer NOT NULL CHECK (registry_version=1),
  source_case_id text NOT NULL CHECK (length(source_case_id) BETWEEN 1 AND 200),
  source_case_revision integer NOT NULL CHECK (source_case_revision>0),
  subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 200),
  subject_revision integer NOT NULL CHECK (subject_revision>0),
  generation integer NOT NULL CHECK (generation>0),
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'Open' CHECK (state='Open'),
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,source,source_case_id,generation),
  CHECK ((source='Attendance' AND subject_type IN ('Override','Roster')) OR
    (source='Leave' AND subject_type IN ('Leave','Cancellation','Adjustment')))
);
CREATE UNIQUE INDEX workflow_one_open_generation ON hcm.workflow_instance(tenant_id,source,source_case_id) WHERE state='Open';

CREATE TABLE hcm.workflow_stage_instance (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  instance_id uuid NOT NULL,
  stage integer NOT NULL CHECK (stage BETWEEN 1 AND 5),
  required_count integer NOT NULL CHECK (required_count BETWEEN 1 AND 5),
  completion_mode text NOT NULL CHECK (completion_mode='All'),
  state text NOT NULL CHECK (state IN ('Active','Blocked')),
  activated_at timestamptz,
  PRIMARY KEY (tenant_id,instance_id,stage),
  FOREIGN KEY (tenant_id,instance_id) REFERENCES hcm.workflow_instance(tenant_id,id)
);

CREATE TABLE hcm.workflow_task (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id uuid NOT NULL,
  instance_id uuid NOT NULL,
  stage integer NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
  source_slot_id text NOT NULL CHECK (length(source_slot_id) BETWEEN 1 AND 200),
  source_slot_revision integer NOT NULL CHECK (source_slot_revision>0),
  expected_case_revision integer NOT NULL CHECK (expected_case_revision>0),
  independent boolean NOT NULL,
  distinct_actors boolean NOT NULL,
  candidate_rule_code text NOT NULL CHECK (length(candidate_rule_code) BETWEEN 1 AND 120),
  candidate_digest text CHECK (candidate_digest ~ '^[a-f0-9]{64}$'),
  assignment_mode text CHECK (assignment_mode IN ('Direct','OfferToCandidates')),
  state text NOT NULL CHECK (state IN ('Blocked','Ready','Failed')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  available_at timestamptz,
  due_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,instance_id,source_slot_id),
  UNIQUE (tenant_id,instance_id,stage,ordinal),
  FOREIGN KEY (tenant_id,instance_id,stage) REFERENCES hcm.workflow_stage_instance(tenant_id,instance_id,stage),
  CHECK (due_at IS NULL OR (available_at IS NOT NULL AND due_at>available_at)),
  CHECK (state<>'Ready' OR (assignment_mode IS NOT NULL AND candidate_digest IS NOT NULL AND available_at IS NOT NULL AND due_at IS NOT NULL))
);
CREATE INDEX workflow_task_state ON hcm.workflow_task(tenant_id,state,due_at,id);

CREATE TABLE hcm.workflow_task_candidate (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  task_id uuid NOT NULL,
  account_id text NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,task_id,account_id),
  FOREIGN KEY (tenant_id,task_id) REFERENCES hcm.workflow_task(tenant_id,id),
  FOREIGN KEY (tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.workflow_task_timer (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('Due','Reminder','Escalation')),
  fire_number integer NOT NULL CHECK (fire_number BETWEEN 1 AND 3),
  due_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'Pending' CHECK (state IN ('Pending','Fired','Cancelled')),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,task_id,kind,fire_number),
  FOREIGN KEY (tenant_id,task_id) REFERENCES hcm.workflow_task(tenant_id,id),
  CHECK (kind='Reminder' OR fire_number=1)
);
CREATE INDEX workflow_pending_timer ON hcm.workflow_task_timer(tenant_id,state,due_at,id);

CREATE TABLE hcm.workflow_reconciliation_exception (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id uuid NOT NULL,
  task_id uuid NOT NULL,
  code text NOT NULL CHECK (code='NoCandidates'),
  state text NOT NULL DEFAULT 'Open' CHECK (state IN ('Open','Resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,task_id,code),
  FOREIGN KEY (tenant_id,task_id) REFERENCES hcm.workflow_task(tenant_id,id)
);

CREATE TABLE hcm.workflow_planning_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  outbox_id text NOT NULL,
  instance_id uuid,
  outcome text NOT NULL CHECK (outcome IN ('Planned','AlreadyPlanned','SourceChanged','SourceUnavailable','SourceClosed','ReconciliationRequired')),
  manifest_digest text NOT NULL CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,outbox_id),
  FOREIGN KEY (tenant_id,outbox_id) REFERENCES hcm.workflow_outbox(tenant_id,id),
  FOREIGN KEY (tenant_id,instance_id) REFERENCES hcm.workflow_instance(tenant_id,id),
  CHECK ((outcome IN ('Planned','AlreadyPlanned'))=(instance_id IS NOT NULL))
);

-- No runtime deletes or rewrites are admitted by this initial planner slice.
-- Later source-receipt transitions must add their own guarded update privileges.
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['workflow_instance','workflow_stage_instance','workflow_task','workflow_task_candidate','workflow_task_timer','workflow_reconciliation_exception','workflow_planning_receipt'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END $$;
