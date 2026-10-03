-- Admit durable source actions and only source-receipt-backed completion.
ALTER TABLE hcm.workflow_task DROP CONSTRAINT workflow_task_state_check;
ALTER TABLE hcm.workflow_task ADD CONSTRAINT workflow_task_state_check
  CHECK (state IN ('Blocked','Ready','ActionPending','Completed','Cancelled','Failed'));

CREATE TABLE hcm.workflow_action_attempt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  task_id text NOT NULL,
  actor_account_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  dispatch_key uuid NOT NULL,
  intent_digest text NOT NULL CHECK (intent_digest ~ '^[a-f0-9]{64}$'),
  authority_reference text NOT NULL,
  source text NOT NULL CHECK (source IN ('Attendance','Leave')),
  case_id text NOT NULL CHECK (length(case_id) BETWEEN 1 AND 200),
  slot_id text NOT NULL CHECK (length(slot_id) BETWEEN 1 AND 200),
  expected_task_revision integer NOT NULL CHECK (expected_task_revision>0),
  expected_case_revision integer NOT NULL CHECK (expected_case_revision>0),
  expected_slot_revision integer NOT NULL CHECK (expected_slot_revision>0),
  expected_subject_revision integer NOT NULL CHECK (expected_subject_revision>0),
  generation integer NOT NULL CHECK (generation>0),
  action text NOT NULL CHECK (action IN ('Approve','Reject')),
  encrypted_reason bytea NOT NULL CHECK (octet_length(encrypted_reason) BETWEEN 30 AND 10000),
  reason_key_version integer NOT NULL CHECK (reason_key_version>0),
  state text NOT NULL DEFAULT 'Pending' CHECK (state IN ('Pending','Unknown','Accepted','Denied','Stale','Conflict','CaseClosed')),
  outbox_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,actor_account_id,idempotency_key),
  UNIQUE (tenant_id,dispatch_key),
  UNIQUE (tenant_id,id,task_id),
  FOREIGN KEY (tenant_id,task_id) REFERENCES hcm.workflow_task(tenant_id,id),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,authority_reference) REFERENCES hcm.runtime_action_authorization(tenant_id,id),
  FOREIGN KEY (tenant_id,outbox_id) REFERENCES hcm.workflow_outbox(tenant_id,id),
  CHECK ((state IN ('Pending','Unknown'))=(completed_at IS NULL))
);
CREATE UNIQUE INDEX workflow_task_pending_action ON hcm.workflow_action_attempt(tenant_id,task_id) WHERE state IN ('Pending','Unknown');

CREATE TABLE hcm.workflow_action_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  attempt_id text NOT NULL,
  task_id text NOT NULL,
  source_receipt_id text NOT NULL CHECK (length(source_receipt_id) BETWEEN 1 AND 200),
  outcome text NOT NULL CHECK (outcome IN ('Accepted','Denied','Stale','Conflict','CaseClosed')),
  source_case_revision integer NOT NULL CHECK (source_case_revision>0),
  source_subject_revision integer NOT NULL CHECK (source_subject_revision>0),
  source_decision_id text CHECK (length(source_decision_id) BETWEEN 1 AND 200),
  safe_failure_code text CHECK (safe_failure_code ~ '^[A-Za-z][A-Za-z0-9]{0,79}$'),
  result_digest text NOT NULL CHECK (result_digest ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,attempt_id),
  FOREIGN KEY (tenant_id,attempt_id,task_id) REFERENCES hcm.workflow_action_attempt(tenant_id,id,task_id),
  CHECK ((outcome='Accepted')=(source_decision_id IS NOT NULL)),
  CHECK (outcome<>'Accepted' OR safe_failure_code IS NULL)
);

-- Exact task/source snapshots and authority records must agree at admission.
CREATE FUNCTION hcm.guard_workflow_action_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task hcm.workflow_task%ROWTYPE;
DECLARE instance hcm.workflow_instance%ROWTYPE;
DECLARE authority hcm.runtime_action_authorization%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.state NOT IN ('Pending','Unknown') OR
      (to_jsonb(NEW)-ARRAY['state','completed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','completed_at']) THEN
      RAISE EXCEPTION 'Immutable action intent' USING ERRCODE='23514';
    END IF;
    IF NEW.state NOT IN ('Pending','Unknown') AND NOT EXISTS (
      SELECT 1 FROM hcm.workflow_action_receipt WHERE tenant_id=NEW.tenant_id AND attempt_id=NEW.id AND outcome=NEW.state
    ) THEN RAISE EXCEPTION 'Source receipt required' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO task FROM hcm.workflow_task WHERE tenant_id=NEW.tenant_id AND id=NEW.task_id FOR UPDATE;
  SELECT * INTO instance FROM hcm.workflow_instance WHERE tenant_id=NEW.tenant_id AND id=task.instance_id;
  SELECT * INTO authority FROM hcm.runtime_action_authorization WHERE tenant_id=NEW.tenant_id AND id=NEW.authority_reference;
  IF NOT EXISTS(SELECT 1 FROM hcm.workflow_outbox WHERE tenant_id=NEW.tenant_id AND id=NEW.outbox_id
    AND workload='WorkflowDispatch' AND kind='workflow.action.dispatch' AND schema_version=1
    AND payload->>'attemptId'=NEW.id AND payload->>'intentDigest'=NEW.intent_digest) THEN
    RAISE EXCEPTION 'Exact durable dispatch required' USING ERRCODE='23514';
  END IF;
  IF NEW.state<>'Pending' OR task.state IS DISTINCT FROM 'Ready' OR instance.state IS DISTINCT FROM 'Open'
    OR task.revision IS DISTINCT FROM NEW.expected_task_revision OR task.source_slot_id IS DISTINCT FROM NEW.slot_id
    OR task.source_slot_revision IS DISTINCT FROM NEW.expected_slot_revision OR task.expected_case_revision IS DISTINCT FROM NEW.expected_case_revision
    OR instance.source IS DISTINCT FROM NEW.source OR instance.source_case_id IS DISTINCT FROM NEW.case_id
    OR instance.subject_revision IS DISTINCT FROM NEW.expected_subject_revision OR instance.generation IS DISTINCT FROM NEW.generation
    OR authority.actor_account_id IS DISTINCT FROM NEW.actor_account_id OR authority.intent_digest IS DISTINCT FROM NEW.intent_digest
    OR authority.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid action admission' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_action_attempt_guard BEFORE INSERT OR UPDATE ON hcm.workflow_action_attempt
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_workflow_action_attempt();

-- Task completion cannot be manufactured from a dispatch timeout or a browser response.
CREATE FUNCTION hcm.guard_workflow_task_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision<>OLD.revision+1 OR OLD.state IN ('Completed','Cancelled') OR
    (to_jsonb(NEW)-ARRAY['state','revision','source_slot_revision','expected_case_revision','candidate_digest','assignment_mode','available_at','due_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','revision','source_slot_revision','expected_case_revision','candidate_digest','assignment_mode','available_at','due_at']) THEN
    RAISE EXCEPTION 'Invalid task transition' USING ERRCODE='23514';
  END IF;
  IF NEW.state='ActionPending' AND NOT EXISTS(SELECT 1 FROM hcm.workflow_action_attempt WHERE tenant_id=NEW.tenant_id AND task_id=NEW.id AND state IN ('Pending','Unknown')) THEN
    RAISE EXCEPTION 'Durable action required' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Completed' AND NOT EXISTS(SELECT 1 FROM hcm.workflow_action_receipt WHERE tenant_id=NEW.tenant_id AND task_id=NEW.id AND outcome='Accepted') THEN
    RAISE EXCEPTION 'Accepted source receipt required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_task_transition BEFORE UPDATE ON hcm.workflow_task
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_workflow_task_transition();

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['workflow_action_attempt','workflow_action_receipt'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END $$;
GRANT UPDATE(state,completed_at) ON hcm.workflow_action_attempt TO hcm_runtime;
GRANT UPDATE(state,revision,source_slot_revision,expected_case_revision,candidate_digest,assignment_mode,available_at,due_at) ON hcm.workflow_task TO hcm_runtime;
