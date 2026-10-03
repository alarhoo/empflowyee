-- Source-driven reconciliation advances required stages and cancels obsolete
-- timers. It cannot create source decisions or complete tasks without receipts.
ALTER TABLE hcm.workflow_instance DROP CONSTRAINT workflow_instance_state_check;
ALTER TABLE hcm.workflow_instance ADD CONSTRAINT workflow_instance_state_check
  CHECK (state IN ('Open','Completed','Cancelled','Invalidated','Failed'));
ALTER TABLE hcm.workflow_instance ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0);
ALTER TABLE hcm.workflow_instance ADD COLUMN closed_at timestamptz;
ALTER TABLE hcm.workflow_instance ADD CONSTRAINT workflow_instance_closed
  CHECK ((state IN ('Completed','Cancelled','Invalidated'))=(closed_at IS NOT NULL));
ALTER TABLE hcm.workflow_stage_instance DROP CONSTRAINT workflow_stage_instance_state_check;
ALTER TABLE hcm.workflow_stage_instance ADD CONSTRAINT workflow_stage_instance_state_check
  CHECK (state IN ('Active','Blocked','Completed','Rejected','Cancelled','Invalidated'));
ALTER TABLE hcm.workflow_reconciliation_exception DROP CONSTRAINT workflow_reconciliation_exception_code_check;
ALTER TABLE hcm.workflow_reconciliation_exception ADD CONSTRAINT workflow_reconciliation_exception_code_check
  CHECK (code IN ('NoCandidates','MissingSource','VersionDrift','SourceProofMissing','DispatchUnknown'));

CREATE TABLE hcm.workflow_reconciliation_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  outbox_id text NOT NULL,
  instance_id text,
  outcome text NOT NULL CHECK (outcome IN ('Refreshed','Closed','NotPlanned','SourceUnavailable','SourceChanged','SourceProofMissing')),
  manifest_digest text CHECK (manifest_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,outbox_id),
  FOREIGN KEY (tenant_id,outbox_id) REFERENCES hcm.workflow_outbox(tenant_id,id),
  FOREIGN KEY (tenant_id,instance_id) REFERENCES hcm.workflow_instance(tenant_id,id)
);
ALTER TABLE hcm.workflow_reconciliation_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.workflow_reconciliation_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.workflow_reconciliation_receipt TO hcm_runtime,hcm_migrator
  USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.workflow_reconciliation_receipt TO hcm_runtime;

CREATE FUNCTION hcm.guard_workflow_instance_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('Completed','Cancelled','Invalidated') OR NEW.revision<>OLD.revision+1 OR NEW.source_case_revision<OLD.source_case_revision OR
    (to_jsonb(NEW)-ARRAY['state','revision','source_case_revision','manifest_digest','closed_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','revision','source_case_revision','manifest_digest','closed_at']) THEN
    RAISE EXCEPTION 'Invalid workflow instance transition' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Completed' AND (NOT EXISTS(SELECT 1 FROM hcm.workflow_stage_instance WHERE tenant_id=NEW.tenant_id AND instance_id=NEW.id)
    OR EXISTS(SELECT 1 FROM hcm.workflow_stage_instance WHERE tenant_id=NEW.tenant_id AND instance_id=NEW.id AND state NOT IN ('Completed','Rejected','Cancelled'))
    OR NOT EXISTS(SELECT 1 FROM hcm.workflow_stage_instance WHERE tenant_id=NEW.tenant_id AND instance_id=NEW.id AND state IN ('Completed','Rejected'))) THEN
    RAISE EXCEPTION 'Completed workflow requires source-backed stages' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_instance_transition BEFORE UPDATE ON hcm.workflow_instance
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_workflow_instance_transition();

CREATE FUNCTION hcm.guard_workflow_stage_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['state','activated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','activated_at'])
    OR (OLD.state IN ('Completed','Rejected','Cancelled','Invalidated') AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Immutable workflow stage' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Completed' AND (NOT EXISTS(SELECT 1 FROM hcm.workflow_task WHERE tenant_id=NEW.tenant_id AND instance_id=NEW.instance_id AND stage=NEW.stage)
    OR EXISTS(SELECT 1 FROM hcm.workflow_task WHERE tenant_id=NEW.tenant_id AND instance_id=NEW.instance_id AND stage=NEW.stage AND state<>'Completed')) THEN
    RAISE EXCEPTION 'Stage completion requires completed tasks' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Rejected' AND NOT EXISTS(SELECT 1 FROM hcm.workflow_task t JOIN hcm.workflow_action_attempt a ON a.tenant_id=t.tenant_id AND a.task_id=t.id
    JOIN hcm.workflow_action_receipt r ON r.tenant_id=a.tenant_id AND r.attempt_id=a.id
    WHERE t.tenant_id=NEW.tenant_id AND t.instance_id=NEW.instance_id AND t.stage=NEW.stage AND a.action='Reject' AND r.outcome='Accepted') THEN
    RAISE EXCEPTION 'Stage rejection requires source receipt' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_stage_transition BEFORE UPDATE ON hcm.workflow_stage_instance
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_workflow_stage_transition();

CREATE FUNCTION hcm.guard_workflow_timer_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state<>'Pending' OR NEW.state='Pending' OR (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN
    RAISE EXCEPTION 'Immutable workflow timer effect' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_timer_transition BEFORE UPDATE ON hcm.workflow_task_timer
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_workflow_timer_transition();

GRANT UPDATE(state,revision,source_case_revision,manifest_digest,closed_at) ON hcm.workflow_instance TO hcm_runtime;
GRANT UPDATE(state,activated_at) ON hcm.workflow_stage_instance TO hcm_runtime;
GRANT UPDATE(state) ON hcm.workflow_task_timer,hcm.workflow_reconciliation_exception TO hcm_runtime;
GRANT DELETE ON hcm.workflow_task_candidate TO hcm_runtime;
