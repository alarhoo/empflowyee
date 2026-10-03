-- Attendance owns required approval cases, slots and immutable decisions.
-- This first admitted subject is Schedule Override; Workflow only coordinates it.
ALTER TABLE hcm.attendance_approval_rule ADD CONSTRAINT attendance_rule_version_identity
  UNIQUE (tenant_id,version_id,id);
-- The approved OverrideDraft contract requires independence whenever policy
-- configures an Override approval route. Existing rows are never rewritten.
ALTER TABLE hcm.attendance_approval_rule ADD CONSTRAINT attendance_override_independent
  CHECK (subject_type<>'Override' OR independent);

CREATE TABLE hcm.attendance_approval_case (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  subject_type text NOT NULL CHECK (subject_type='Override'),
  schedule_override_id text NOT NULL,
  employment_id text NOT NULL,
  work_date date NOT NULL,
  attendance_policy_version_id text NOT NULL,
  subject_revision integer NOT NULL CHECK (subject_revision>0),
  generation integer NOT NULL CHECK (generation>0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  state text NOT NULL DEFAULT 'Pending' CHECK (state IN ('Pending','Approved','Rejected','Cancelled','Invalidated')),
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  routing_digest text NOT NULL CHECK (routing_digest ~ '^[a-f0-9]{64}$'),
  requested_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,schedule_override_id,generation),
  UNIQUE (tenant_id,id,attendance_policy_version_id),
  FOREIGN KEY (tenant_id,employment_id,work_date,schedule_override_id)
    REFERENCES hcm.schedule_override(tenant_id,employment_id,work_date,id),
  FOREIGN KEY (tenant_id,attendance_policy_version_id) REFERENCES hcm.attendance_policy_version(tenant_id,id),
  FOREIGN KEY (tenant_id,requested_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE UNIQUE INDEX attendance_case_pending_override
  ON hcm.attendance_approval_case(tenant_id,schedule_override_id) WHERE state='Pending';

CREATE TABLE hcm.attendance_approval_slot (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  case_id text NOT NULL,
  attendance_policy_version_id text NOT NULL,
  rule_id text NOT NULL,
  stage integer NOT NULL CHECK (stage>0),
  ordinal integer NOT NULL CHECK (ordinal>0),
  independent boolean NOT NULL CHECK (independent),
  distinct_actors boolean NOT NULL,
  state text NOT NULL DEFAULT 'Pending' CHECK (state IN ('Pending','Approved','Rejected')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  decided_by_account_id text,
  decided_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,case_id,id),
  UNIQUE (tenant_id,case_id,ordinal),
  UNIQUE (tenant_id,case_id,rule_id),
  FOREIGN KEY (tenant_id,case_id,attendance_policy_version_id)
    REFERENCES hcm.attendance_approval_case(tenant_id,id,attendance_policy_version_id),
  FOREIGN KEY (tenant_id,attendance_policy_version_id,rule_id)
    REFERENCES hcm.attendance_approval_rule(tenant_id,version_id,id),
  FOREIGN KEY (tenant_id,decided_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK ((state='Pending')=(decided_by_account_id IS NULL AND decided_at IS NULL)),
  CHECK ((decided_by_account_id IS NULL)=(decided_at IS NULL))
);

CREATE TABLE hcm.attendance_decision (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  case_id text NOT NULL,
  slot_id text NOT NULL,
  actor_account_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('Approve','Reject')),
  case_revision integer NOT NULL CHECK (case_revision>0),
  slot_revision integer NOT NULL CHECK (slot_revision>0),
  subject_revision integer NOT NULL CHECK (subject_revision>0),
  generation integer NOT NULL CHECK (generation>0),
  command_key uuid NOT NULL,
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  encrypted_reason bytea NOT NULL CHECK (octet_length(encrypted_reason) BETWEEN 30 AND 10000),
  reason_key_version integer NOT NULL CHECK (reason_key_version>0),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,slot_id),
  UNIQUE (tenant_id,case_id,case_revision),
  UNIQUE (tenant_id,actor_account_id,command_key),
  FOREIGN KEY (tenant_id,case_id,slot_id) REFERENCES hcm.attendance_approval_slot(tenant_id,case_id,id),
  FOREIGN KEY (tenant_id,actor_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

-- A source case snapshots a published rule set and exact Draft revision.
CREATE FUNCTION hcm.guard_attendance_approval_case() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE subject hcm.schedule_override%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO subject FROM hcm.schedule_override WHERE tenant_id=NEW.tenant_id AND id=NEW.schedule_override_id FOR UPDATE;
    IF subject.state IS DISTINCT FROM 'Draft' OR subject.revision IS DISTINCT FROM NEW.subject_revision OR NEW.state<>'Pending' OR NEW.revision<>1 THEN
      RAISE EXCEPTION 'Approval case requires exact Draft' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM hcm.attendance_policy_version WHERE tenant_id=NEW.tenant_id AND id=NEW.attendance_policy_version_id AND state='Published' AND effective_period @> NEW.work_date) THEN
      RAISE EXCEPTION 'Approval case requires published dated policy' USING ERRCODE='23514';
    END IF;
    IF NEW.generation<>(SELECT coalesce(max(generation),0)+1 FROM hcm.attendance_approval_case WHERE tenant_id=NEW.tenant_id AND schedule_override_id=NEW.schedule_override_id) THEN
      RAISE EXCEPTION 'Approval generation must advance' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state<>'Pending' OR NEW.revision<>OLD.revision+1
    OR (to_jsonb(NEW)-ARRAY['state','revision','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','updated_at']) THEN
    RAISE EXCEPTION 'Approval case payload is immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Pending' AND NOT EXISTS(SELECT 1 FROM hcm.attendance_decision WHERE tenant_id=NEW.tenant_id AND case_id=NEW.id AND case_revision=OLD.revision AND action='Approve') THEN
    RAISE EXCEPTION 'Pending progress requires a new source decision' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Pending' AND NOT EXISTS(SELECT 1 FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND case_id=NEW.id AND state='Pending') THEN
    RAISE EXCEPTION 'Final source approval must close the case' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Approved' AND (NOT EXISTS(SELECT 1 FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND case_id=NEW.id)
      OR EXISTS(SELECT 1 FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND case_id=NEW.id AND state<>'Approved')) THEN
    RAISE EXCEPTION 'Every source slot must approve' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Rejected' AND NOT EXISTS(SELECT 1 FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND case_id=NEW.id AND state='Rejected') THEN
    RAISE EXCEPTION 'A source slot must reject' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_approval_case_guard BEFORE INSERT OR UPDATE ON hcm.attendance_approval_case
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_approval_case();

-- Required slots cannot be added after a decision or silently dropped. Every
-- configured Override rule must have its own independently decided slot.
CREATE FUNCTION hcm.guard_attendance_approval_slot() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE approval hcm.attendance_approval_case%ROWTYPE;
DECLARE rule hcm.attendance_approval_rule%ROWTYPE;
BEGIN
  SELECT * INTO approval FROM hcm.attendance_approval_case WHERE tenant_id=NEW.tenant_id AND id=NEW.case_id FOR UPDATE;
  IF approval.state IS DISTINCT FROM 'Pending' THEN RAISE EXCEPTION 'Approval case closed' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO rule FROM hcm.attendance_approval_rule WHERE tenant_id=NEW.tenant_id AND id=NEW.rule_id AND version_id=NEW.attendance_policy_version_id;
    IF rule.subject_type IS DISTINCT FROM 'Override' OR rule.stage IS DISTINCT FROM NEW.stage OR rule.ordinal IS DISTINCT FROM NEW.ordinal OR NEW.state<>'Pending' OR NEW.revision<>1
      OR EXISTS(SELECT 1 FROM hcm.attendance_decision WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id) THEN
      RAISE EXCEPTION 'Invalid required source slot' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state<>'Pending' OR NEW.state='Pending' OR NEW.revision<>OLD.revision+1
    OR (to_jsonb(NEW)-ARRAY['state','revision','decided_by_account_id','decided_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','decided_by_account_id','decided_at']) THEN
    RAISE EXCEPTION 'Source slot decision is immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM hcm.attendance_decision WHERE tenant_id=NEW.tenant_id AND slot_id=NEW.id AND actor_account_id=NEW.decided_by_account_id
    AND action=CASE NEW.state WHEN 'Approved' THEN 'Approve' ELSE 'Reject' END AND slot_revision=OLD.revision) THEN
    RAISE EXCEPTION 'Immutable source decision required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_approval_slot_guard BEFORE INSERT OR UPDATE ON hcm.attendance_approval_slot
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_approval_slot();

-- SQL retains structural/current-slot and maker-checker invariants. The owning
-- application separately checks current session, candidate, permission and scope.
CREATE FUNCTION hcm.guard_attendance_decision() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE approval hcm.attendance_approval_case%ROWTYPE;
DECLARE slot hcm.attendance_approval_slot%ROWTYPE;
DECLARE maker text;
BEGIN
  SELECT * INTO approval FROM hcm.attendance_approval_case WHERE tenant_id=NEW.tenant_id AND id=NEW.case_id FOR UPDATE;
  SELECT * INTO slot FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND id=NEW.slot_id AND case_id=NEW.case_id FOR UPDATE;
  IF approval.state IS DISTINCT FROM 'Pending' OR slot.state IS DISTINCT FROM 'Pending'
    OR approval.revision IS DISTINCT FROM NEW.case_revision OR approval.subject_revision IS DISTINCT FROM NEW.subject_revision
    OR slot.revision IS DISTINCT FROM NEW.slot_revision OR approval.generation IS DISTINCT FROM NEW.generation THEN
    RAISE EXCEPTION 'Stale source decision' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id AND stage<slot.stage AND state<>'Approved') THEN
    RAISE EXCEPTION 'Earlier source stage incomplete' USING ERRCODE='23514';
  END IF;
  SELECT created_by_account_id INTO maker FROM hcm.schedule_override WHERE tenant_id=NEW.tenant_id AND id=approval.schedule_override_id;
  IF NEW.actor_account_id IN (maker,approval.requested_by_account_id) THEN
    RAISE EXCEPTION 'Independent checker required' USING ERRCODE='23514';
  END IF;
  IF EXISTS(SELECT 1 FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id AND decided_by_account_id=NEW.actor_account_id AND (distinct_actors OR slot.distinct_actors)) THEN
    RAISE EXCEPTION 'Distinct checker required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_decision_guard BEFORE INSERT ON hcm.attendance_decision
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_decision();

-- A submitted subject cannot be edited out from under its source approval case.
CREATE FUNCTION hcm.guard_override_pending_case() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF EXISTS(SELECT 1 FROM hcm.attendance_approval_case WHERE tenant_id=OLD.tenant_id AND schedule_override_id=OLD.id AND state='Pending') THEN
    RAISE EXCEPTION 'Pending override case must be closed or invalidated first' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER schedule_override_pending_case BEFORE UPDATE ON hcm.schedule_override
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_override_pending_case();

-- An override remains Draft while its separate source case is Pending, so child
-- edits need the same case guard as changes to the parent payload.
CREATE FUNCTION hcm.guard_override_pending_segments() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE source_id text;
DECLARE source_tenant text;
BEGIN
  source_id:=CASE WHEN TG_OP='DELETE' THEN OLD.override_id ELSE NEW.override_id END;
  source_tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  IF EXISTS(SELECT 1 FROM hcm.attendance_approval_case WHERE tenant_id=source_tenant AND schedule_override_id=source_id AND state='Pending') THEN
    RAISE EXCEPTION 'Pending override intervals are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER schedule_override_pending_segments BEFORE INSERT OR UPDATE OR DELETE ON hcm.schedule_override_segment
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_override_pending_segments();

-- A decision and its source progression are atomic; an append alone is not an
-- accepted decision and cannot leave the same slot open for another actor.
CREATE FUNCTION hcm.require_attendance_decision_effect() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE case_state text;
DECLARE case_version integer;
BEGIN
  SELECT state,revision INTO case_state,case_version FROM hcm.attendance_approval_case WHERE tenant_id=NEW.tenant_id AND id=NEW.case_id;
  IF case_version<=NEW.case_revision OR (NEW.action='Reject' AND case_state<>'Rejected')
    OR NOT EXISTS(SELECT 1 FROM hcm.attendance_approval_slot WHERE tenant_id=NEW.tenant_id AND id=NEW.slot_id AND decided_by_account_id=NEW.actor_account_id
      AND state=CASE NEW.action WHEN 'Approve' THEN 'Approved' ELSE 'Rejected' END) THEN
    RAISE EXCEPTION 'Source decision and case progression must commit together' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END
$body$;
CREATE CONSTRAINT TRIGGER attendance_decision_effect AFTER INSERT ON hcm.attendance_decision
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_attendance_decision_effect();

-- Validate slot completeness at commit, allowing one atomic case-plus-slots insert.
CREATE FUNCTION hcm.require_attendance_case_slots() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM hcm.attendance_approval_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.attendance_policy_version_id AND subject_type='Override')
    OR EXISTS(SELECT 1 FROM hcm.attendance_approval_rule r WHERE r.tenant_id=NEW.tenant_id AND r.version_id=NEW.attendance_policy_version_id AND r.subject_type='Override'
      AND NOT EXISTS(SELECT 1 FROM hcm.attendance_approval_slot s WHERE s.tenant_id=r.tenant_id AND s.case_id=NEW.id AND s.rule_id=r.id)) THEN
    RAISE EXCEPTION 'Every configured source slot is required' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END
$body$;
CREATE CONSTRAINT TRIGGER attendance_case_required_slots AFTER INSERT ON hcm.attendance_approval_case
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_attendance_case_slots();

DO $security$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['attendance_approval_case','attendance_approval_slot','attendance_decision'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id = hcm.current_tenant_id()) WITH CHECK (tenant_id = hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$security$;
GRANT UPDATE(state,revision,updated_at) ON hcm.attendance_approval_case TO hcm_runtime;
GRANT UPDATE(state,revision,decided_by_account_id,decided_at) ON hcm.attendance_approval_slot TO hcm_runtime;
