-- Ownership: employee. Probation reviews, reviewer assessments and HR decisions (TDD-HCM-2-DATA-MODEL
-- migration order 11, Probation Management and Probation Review TDD#DATA). DEC-HCM2-003: one Final
-- review due 14 days before the probation end date, a 1-5 rating, at most one extension of up to
-- 90 days, and escalation 7 days after the due date, computed at read time. The stored reviewer is
-- the only reviewer authority; reporting lines never grant access.

CREATE TABLE hcm.probation_review (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  employment_id text NOT NULL,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  review_type text NOT NULL CHECK (review_type IN ('Final','AdHoc')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  probation_end_date date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','AssessmentSubmitted','Decided','Cancelled')),
  primary_reviewer_account_id text,
  owner_account_id text NOT NULL,
  schedule_reason text NOT NULL CHECK (length(btrim(schedule_reason)) BETWEEN 1 AND 500),
  cancel_reason text CHECK (length(btrim(cancel_reason)) BETWEEN 1 AND 500),
  cancelled_at timestamptz,
  decided_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,employment_id,sequence_number),
  CONSTRAINT probation_review_period CHECK (period_end >= period_start),
  CONSTRAINT probation_review_cancelled CHECK ((status = 'Cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)),
  CONSTRAINT probation_review_decided CHECK ((status = 'Decided') = (decided_at IS NOT NULL)),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,primary_reviewer_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,owner_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- One open Final review per employment at a time.
CREATE UNIQUE INDEX probation_review_one_open_final ON hcm.probation_review (tenant_id,employment_id)
  WHERE review_type = 'Final' AND status IN ('Scheduled','AssessmentSubmitted');
CREATE INDEX probation_review_due ON hcm.probation_review (tenant_id,due_date,id);
CREATE INDEX probation_review_reviewer ON hcm.probation_review (tenant_id,primary_reviewer_account_id,due_date,id);

CREATE TABLE hcm.probation_assessment (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  review_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  reviewer_account_id text NOT NULL,
  recommendation text NOT NULL CHECK (recommendation IN ('Confirm','Extend','Fail','NoChange')),
  overall_rating smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  strengths text NOT NULL DEFAULT '' CHECK (length(strengths) <= 2000),
  concerns text NOT NULL DEFAULT '' CHECK (length(concerns) <= 2000),
  recommendation_reason text NOT NULL CHECK (length(btrim(recommendation_reason)) BETWEEN 1 AND 2000),
  superseded_by_assessment_id text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,review_id,version_number),
  FOREIGN KEY (tenant_id,review_id) REFERENCES hcm.probation_review(tenant_id,id),
  FOREIGN KEY (tenant_id,reviewer_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,superseded_by_assessment_id) REFERENCES hcm.probation_assessment(tenant_id,id)
);
-- Exactly one current assessment per review; earlier versions stay as superseded history.
CREATE UNIQUE INDEX probation_assessment_current ON hcm.probation_assessment (tenant_id,review_id)
  WHERE superseded_by_assessment_id IS NULL;

-- Only the stored reviewer of an undecided review can add an assessment.
CREATE FUNCTION hcm.require_open_probation_assessment() RETURNS trigger LANGUAGE plpgsql AS $assess$
DECLARE review record;
BEGIN
  SELECT status, primary_reviewer_account_id INTO review FROM hcm.probation_review
    WHERE tenant_id=NEW.tenant_id AND id=NEW.review_id;
  IF review.status NOT IN ('Scheduled','AssessmentSubmitted') THEN
    RAISE EXCEPTION 'Only an undecided probation review can be assessed' USING ERRCODE = '23514';
  END IF;
  IF review.primary_reviewer_account_id IS DISTINCT FROM NEW.reviewer_account_id THEN
    RAISE EXCEPTION 'Only the assigned reviewer can assess a probation review' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$assess$;
CREATE TRIGGER probation_assessment_open BEFORE INSERT ON hcm.probation_assessment
  FOR EACH ROW EXECUTE FUNCTION hcm.require_open_probation_assessment();

CREATE TABLE hcm.probation_decision (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  review_id text NOT NULL,
  employment_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('Confirm','Extend','Fail','NoChange')),
  effective_date date NOT NULL,
  previous_probation_end_date date NOT NULL,
  extended_probation_end_date date,
  assessment_id text,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  evidence_reference text CHECK (length(btrim(evidence_reference)) BETWEEN 1 AND 200),
  decided_by_account_id text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,review_id),
  CONSTRAINT probation_decision_extension CHECK (
    (outcome = 'Extend') = (extended_probation_end_date IS NOT NULL)
    AND (extended_probation_end_date IS NULL OR extended_probation_end_date > previous_probation_end_date)),
  FOREIGN KEY (tenant_id,review_id) REFERENCES hcm.probation_review(tenant_id,id),
  FOREIGN KEY (tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY (tenant_id,assessment_id) REFERENCES hcm.probation_assessment(tenant_id,id),
  FOREIGN KEY (tenant_id,decided_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- DEC-HCM2-003: at most one extension per employment.
CREATE UNIQUE INDEX probation_decision_one_extension ON hcm.probation_decision (tenant_id,employment_id)
  WHERE outcome = 'Extend';

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['probation_review','probation_assessment','probation_decision'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT, INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Assessments and decisions are append-only apart from the supersession link.
GRANT UPDATE (status,primary_reviewer_account_id,period_end,probation_end_date,due_date,cancel_reason,cancelled_at,decided_at,revision,updated_at) ON hcm.probation_review TO hcm_runtime;
GRANT UPDATE (superseded_by_assessment_id) ON hcm.probation_assessment TO hcm_runtime;
