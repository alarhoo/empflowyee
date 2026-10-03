-- Attendance retains immutable source proof for every dispatched decision outcome.
-- Workflow references this proof; coordination state never substitutes for it.
CREATE TABLE hcm.attendance_decision_receipt (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
  dispatch_key uuid NOT NULL,
  intent_digest text NOT NULL CHECK(intent_digest ~ '^[a-f0-9]{64}$'),
  case_id text NOT NULL,
  slot_id text NOT NULL,
  actor_account_id text NOT NULL,
  generation integer NOT NULL CHECK(generation>0),
  outcome text NOT NULL CHECK(outcome IN ('Accepted','Denied','Stale','Conflict','CaseClosed')),
  case_revision integer NOT NULL CHECK(case_revision>0),
  subject_revision integer NOT NULL CHECK(subject_revision>0),
  decision_id text,
  safe_failure_code text CHECK(safe_failure_code ~ '^[A-Za-z][A-Za-z0-9]{0,79}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,dispatch_key),
  FOREIGN KEY(tenant_id,case_id,slot_id) REFERENCES hcm.attendance_approval_slot(tenant_id,case_id,id),
  FOREIGN KEY(tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY(tenant_id,decision_id) REFERENCES hcm.attendance_decision(tenant_id,id),
  CHECK((outcome='Accepted')=(decision_id IS NOT NULL)),
  CHECK(outcome<>'Accepted' OR safe_failure_code IS NULL)
);
ALTER TABLE hcm.attendance_decision_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE hcm.attendance_decision_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON hcm.attendance_decision_receipt TO hcm_runtime,hcm_migrator
  USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id());
GRANT SELECT,INSERT ON hcm.attendance_decision_receipt TO hcm_runtime;

-- Accepted proof must name this exact source decision and its committed progress.
CREATE FUNCTION hcm.require_attendance_receipt_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome='Accepted' AND NOT EXISTS(
    SELECT 1 FROM hcm.attendance_decision d JOIN hcm.attendance_approval_case c
      ON c.tenant_id=d.tenant_id AND c.id=d.case_id
    WHERE d.tenant_id=NEW.tenant_id AND d.id=NEW.decision_id AND d.case_id=NEW.case_id
      AND d.slot_id=NEW.slot_id AND d.actor_account_id=NEW.actor_account_id
      AND d.generation=NEW.generation AND d.command_key=NEW.dispatch_key
      AND d.input_digest=NEW.intent_digest AND c.revision=NEW.case_revision
      AND c.revision=d.case_revision+1
  ) THEN RAISE EXCEPTION 'Exact source decision proof required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attendance_receipt_decision BEFORE INSERT ON hcm.attendance_decision_receipt
  FOR EACH ROW EXECUTE FUNCTION hcm.require_attendance_receipt_decision();

-- Even privileged application callers cannot revise or delete original proof.
CREATE FUNCTION hcm.guard_attendance_decision_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Attendance decision receipt is immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER attendance_decision_receipt_immutable BEFORE UPDATE OR DELETE
  ON hcm.attendance_decision_receipt FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_decision_receipt();
