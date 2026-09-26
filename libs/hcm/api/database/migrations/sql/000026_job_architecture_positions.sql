-- Job architecture positions: coded planned seats with effective-dated, immutable published
-- versions, position requirement variances, relationships, and the change request workflow with
-- impact previews, one approval case and one decision (DEC-HCM2-007 to DEC-HCM2-009).
-- A position stores no person: incumbency is derived from workforce assignments. Reasons,
-- decision comments and waive justifications are ciphertext under ADR-HCM-FIELD-ENCRYPTION.

CREATE TABLE hcm.position (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  lifecycle_status text NOT NULL DEFAULT 'Planned' CHECK (lifecycle_status IN ('Planned','Open','Frozen','Closed','Cancelled')),
  current_published_version_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,code),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.position_version (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  position_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','InReview','Published','Superseded','Cancelled')),
  job_profile_version_id text NOT NULL,
  job_grade_id text NOT NULL,
  designation_id text NOT NULL,
  legal_entity_id text NOT NULL,
  organisation_id text NOT NULL,
  department_id text,
  location_id text NOT NULL,
  position_type text NOT NULL CHECK (position_type IN ('Regular','Temporary','Project')),
  headcount_capacity integer NOT NULL CHECK (headcount_capacity > 0 AND headcount_capacity <= 10000),
  fte_capacity numeric(8,2) NOT NULL CHECK (fte_capacity > 0 AND fte_capacity <= 10000),
  is_key_position boolean NOT NULL DEFAULT false,
  cost_center_code text NOT NULL DEFAULT '' CHECK (length(cost_center_code) <= 40),
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to + 1, '[)')) STORED,
  supersedes_version_id text,
  change_summary text NOT NULL DEFAULT '' CHECK (length(change_summary) <= 500),
  source_digest text CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  published_at timestamptz,
  published_by_account_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  updated_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,position_id,version_number),
  CONSTRAINT position_version_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- FTE capacity never exceeds one full-time equivalent per seat.
  CONSTRAINT position_version_fte CHECK (fte_capacity <= headcount_capacity),
  CONSTRAINT position_version_published CHECK (
    (status IN ('Published','Superseded')) = (published_at IS NOT NULL)
    AND (status IN ('Published','Superseded')) = (source_digest IS NOT NULL)),
  CONSTRAINT position_version_no_overlap EXCLUDE USING gist (
    tenant_id WITH =, position_id WITH =, effective_period WITH &&) WHERE (status IN ('Published','Superseded')),
  FOREIGN KEY (tenant_id,position_id) REFERENCES hcm.position(tenant_id,id),
  -- The grade must be allowed by the selected profile version (business rule 7).
  FOREIGN KEY (tenant_id,job_profile_version_id,job_grade_id) REFERENCES hcm.job_profile_grade(tenant_id,job_profile_version_id,job_grade_id),
  FOREIGN KEY (tenant_id,designation_id) REFERENCES hcm.designation(tenant_id,id),
  FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id),
  FOREIGN KEY (tenant_id,organisation_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY (tenant_id,department_id) REFERENCES hcm.department(tenant_id,id),
  FOREIGN KEY (tenant_id,location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY (tenant_id,supersedes_version_id) REFERENCES hcm.position_version(tenant_id,id),
  FOREIGN KEY (tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX position_version_placement ON hcm.position_version (tenant_id,organisation_id,department_id,location_id);
ALTER TABLE hcm.position
  ADD FOREIGN KEY (tenant_id,current_published_version_id) REFERENCES hcm.position_version(tenant_id,id);
-- A published position version references a published profile version (business rule 11).
CREATE FUNCTION hcm.require_position_profile_published() RETURNS trigger LANGUAGE plpgsql AS $profile$
DECLARE profile_status text;
BEGIN
  IF NEW.status IN ('InReview','Published') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT status INTO profile_status FROM hcm.job_profile_version
      WHERE tenant_id = NEW.tenant_id AND id = NEW.job_profile_version_id;
    IF profile_status NOT IN ('Published','Superseded') THEN
      RAISE EXCEPTION 'A position version references a published job profile version' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$profile$;
CREATE TRIGGER position_version_profile BEFORE UPDATE ON hcm.position_version
  FOR EACH ROW EXECUTE FUNCTION hcm.require_position_profile_published();
CREATE TRIGGER position_version_mutable BEFORE UPDATE ON hcm.position_version
  FOR EACH ROW EXECUTE FUNCTION hcm.require_architecture_version_mutable();

CREATE TABLE hcm.position_requirement (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  position_version_id text NOT NULL,
  source_job_profile_requirement_id text,
  requirement_code text NOT NULL CHECK (requirement_code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  variance_type text NOT NULL CHECK (variance_type IN ('Add','Replace','Strengthen','Waive')),
  requirement_type text NOT NULL CHECK (requirement_type IN ('Education','Experience','Certification','Licence','Language','Skill','Competency','Other')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  proficiency_level text NOT NULL DEFAULT '' CHECK (length(proficiency_level) <= 100),
  minimum_quantity numeric(8,2) CHECK (minimum_quantity >= 0),
  quantity_unit text CHECK (quantity_unit IN ('Years','Months','Hours','Credits','Count')),
  is_mandatory boolean NOT NULL DEFAULT true,
  encrypted_justification bytea,
  justification_key_version integer CHECK (justification_key_version > 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,position_version_id,requirement_code),
  CONSTRAINT position_requirement_quantity CHECK ((minimum_quantity IS NULL) = (quantity_unit IS NULL)),
  -- Replace, Strengthen and Waive act on a profile requirement; Add introduces a new one.
  CONSTRAINT position_requirement_source CHECK ((variance_type = 'Add') = (source_job_profile_requirement_id IS NULL)),
  -- A Waive keeps its source and always carries an encrypted justification (DEC-HCM2-009).
  CONSTRAINT position_requirement_waive CHECK (
    (variance_type = 'Waive') = (encrypted_justification IS NOT NULL)
    AND (encrypted_justification IS NULL) = (justification_key_version IS NULL)),
  FOREIGN KEY (tenant_id,position_version_id) REFERENCES hcm.position_version(tenant_id,id),
  FOREIGN KEY (tenant_id,source_job_profile_requirement_id) REFERENCES hcm.job_profile_requirement(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.position_relationship (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  source_position_id text NOT NULL,
  target_position_id text NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN ('SolidLine','DottedLine','Functional')),
  effective_from date NOT NULL,
  effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to + 1, '[)')) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id text,
  PRIMARY KEY (tenant_id,id),
  -- Relationships never self-reference (business rule 12); cycles are refused by the command.
  CONSTRAINT position_relationship_self CHECK (source_position_id <> target_position_id),
  CONSTRAINT position_relationship_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT position_relationship_one_solid EXCLUDE USING gist (
    tenant_id WITH =, source_position_id WITH =, effective_period WITH &&) WHERE (relationship_type = 'SolidLine'),
  FOREIGN KEY (tenant_id,source_position_id) REFERENCES hcm.position(tenant_id,id),
  FOREIGN KEY (tenant_id,target_position_id) REFERENCES hcm.position(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);

CREATE TABLE hcm.position_change_request (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  position_id text NOT NULL,
  request_type text NOT NULL CHECK (request_type IN ('Create','Change','Freeze','Reopen','Close','Cancel')),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Previewed','Submitted','PendingApproval','Approved','Rejected','Withdrawn','Applying','Applied','Failed')),
  base_position_version_id text,
  proposed_position_version_id text,
  encrypted_reason bytea NOT NULL,
  reason_key_version integer NOT NULL CHECK (reason_key_version > 0),
  requested_by_account_id text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  applied_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  -- Create and Change propose a version; lifecycle requests change status only.
  CONSTRAINT position_change_request_proposal CHECK (
    (request_type IN ('Create','Change')) = (proposed_position_version_id IS NOT NULL)),
  CONSTRAINT position_change_request_base CHECK ((request_type = 'Create') = (base_position_version_id IS NULL)),
  FOREIGN KEY (tenant_id,position_id) REFERENCES hcm.position(tenant_id,id),
  FOREIGN KEY (tenant_id,base_position_version_id) REFERENCES hcm.position_version(tenant_id,id),
  FOREIGN KEY (tenant_id,proposed_position_version_id) REFERENCES hcm.position_version(tenant_id,id),
  FOREIGN KEY (tenant_id,requested_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- One request in flight per position.
CREATE UNIQUE INDEX position_change_request_one_open ON hcm.position_change_request (tenant_id,position_id)
  WHERE status IN ('Draft','Previewed','Submitted','PendingApproval','Approved','Applying');

CREATE TABLE hcm.position_change_item (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  position_change_request_id text NOT NULL,
  field_code text NOT NULL CHECK (field_code ~ '^[a-zA-Z][A-Za-z0-9.]{0,63}$'),
  change_type text NOT NULL CHECK (change_type IN ('Set','Clear','AddRequirement','ReplaceRequirement','RemoveRequirement')),
  old_value_digest text CHECK (old_value_digest ~ '^[a-f0-9]{64}$'),
  new_value_digest text CHECK (new_value_digest ~ '^[a-f0-9]{64}$'),
  safe_summary text NOT NULL DEFAULT '' CHECK (length(safe_summary) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,position_change_request_id,field_code),
  FOREIGN KEY (tenant_id,position_change_request_id) REFERENCES hcm.position_change_request(tenant_id,id)
);

CREATE TABLE hcm.position_impact_preview (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  position_change_request_id text NOT NULL,
  preview_revision integer NOT NULL CHECK (preview_revision > 0),
  status text NOT NULL CHECK (status IN ('Building','Ready','Stale','Failed')),
  active_assignment_count integer CHECK (active_assignment_count >= 0),
  assigned_full_time_equivalent numeric(8,2) CHECK (assigned_full_time_equivalent >= 0),
  occupancy_complete boolean NOT NULL,
  child_position_count integer NOT NULL CHECK (child_position_count >= 0),
  downstream_reference_count integer NOT NULL CHECK (downstream_reference_count >= 0),
  source_version_digest text NOT NULL CHECK (source_version_digest ~ '^[a-f0-9]{64}$'),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  CONSTRAINT position_impact_preview_expiry CHECK (expires_at > calculated_at),
  CONSTRAINT position_impact_preview_occupancy CHECK (
    occupancy_complete = (active_assignment_count IS NOT NULL AND assigned_full_time_equivalent IS NOT NULL)),
  FOREIGN KEY (tenant_id,position_change_request_id) REFERENCES hcm.position_change_request(tenant_id,id)
);

CREATE TABLE hcm.position_approval_case (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  position_change_request_id text NOT NULL,
  subject_version integer NOT NULL CHECK (subject_version > 0),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Requested','Pending','Approved','Rejected','Cancelled','Failed')),
  -- DEC-HCM2-009: a request containing a Waive also needs the waive authority.
  requires_waive_authority boolean NOT NULL DEFAULT false,
  preview_id text NOT NULL,
  policy_snapshot_digest text NOT NULL CHECK (policy_snapshot_digest ~ '^[a-f0-9]{64}$'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,position_change_request_id) REFERENCES hcm.position_change_request(tenant_id,id),
  FOREIGN KEY (tenant_id,preview_id) REFERENCES hcm.position_impact_preview(tenant_id,id)
);
CREATE UNIQUE INDEX position_approval_case_one_open ON hcm.position_approval_case (tenant_id,position_change_request_id)
  WHERE status IN ('Requested','Pending');

CREATE TABLE hcm.position_decision (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  position_approval_case_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('Approved','Rejected','Cancelled')),
  subject_version integer NOT NULL CHECK (subject_version > 0),
  decided_by_account_id text NOT NULL,
  encrypted_comment bytea,
  comment_key_version integer CHECK (comment_key_version > 0),
  decided_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  -- DEC-HCM2-008: one decision slot per approval case.
  UNIQUE (tenant_id,position_approval_case_id),
  CONSTRAINT position_decision_comment CHECK ((encrypted_comment IS NULL) = (comment_key_version IS NULL)),
  FOREIGN KEY (tenant_id,position_approval_case_id) REFERENCES hcm.position_approval_case(tenant_id,id),
  FOREIGN KEY (tenant_id,decided_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
-- The requester never decides their own request, whatever their permissions (DEC-HCM2-008).
CREATE FUNCTION hcm.require_independent_position_decision() RETURNS trigger LANGUAGE plpgsql AS $independent$
DECLARE requester text;
BEGIN
  SELECT r.requested_by_account_id INTO requester FROM hcm.position_approval_case c
    JOIN hcm.position_change_request r ON r.tenant_id = c.tenant_id AND r.id = c.position_change_request_id
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.position_approval_case_id;
  IF requester IS NULL OR requester = NEW.decided_by_account_id THEN
    RAISE EXCEPTION 'The requester cannot decide their own position change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$independent$;
CREATE TRIGGER position_decision_independent BEFORE INSERT ON hcm.position_decision
  FOR EACH ROW EXECUTE FUNCTION hcm.require_independent_position_decision();

-- Position requirements of a proposed version change only while it is a draft.
CREATE OR REPLACE FUNCTION hcm.require_draft_architecture_parent() RETURNS trigger LANGUAGE plpgsql AS $draft$
DECLARE
  row_data jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  parent_status text;
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'hcm_migrator' THEN
    RETURN OLD;
  END IF;
  IF TG_ARGV[0] = 'catalogue' THEN
    SELECT status INTO parent_status FROM hcm.job_catalogue_version
      WHERE tenant_id = row_data->>'tenant_id' AND id = row_data->>'job_catalogue_version_id';
  ELSIF TG_ARGV[0] = 'position' THEN
    SELECT status INTO parent_status FROM hcm.position_version
      WHERE tenant_id = row_data->>'tenant_id' AND id = row_data->>'position_version_id';
  ELSE
    SELECT status INTO parent_status FROM hcm.job_profile_version
      WHERE tenant_id = row_data->>'tenant_id' AND id = row_data->>'job_profile_version_id';
  END IF;
  IF parent_status IS DISTINCT FROM 'Draft' THEN
    RAISE EXCEPTION 'Only draft architecture versions can change' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$draft$;
CREATE TRIGGER position_requirement_draft_only BEFORE INSERT OR UPDATE OR DELETE ON hcm.position_requirement
  FOR EACH ROW EXECUTE FUNCTION hcm.require_draft_architecture_parent('position');

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['position','position_version','position_requirement','position_relationship','position_change_request','position_change_item','position_impact_preview','position_approval_case','position_decision'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())', relation);
    EXECUTE format('GRANT SELECT, INSERT ON hcm.%I TO hcm_runtime', relation);
  END LOOP;
END
$policies$;

-- Codes, requesters and decisions are fixed for life; decisions and relationships are append-only.
GRANT UPDATE (name,lifecycle_status,current_published_version_id,revision,updated_at,updated_by_account_id) ON hcm.position TO hcm_runtime;
GRANT UPDATE (status,job_profile_version_id,job_grade_id,designation_id,legal_entity_id,organisation_id,department_id,location_id,position_type,headcount_capacity,fte_capacity,is_key_position,cost_center_code,effective_from,effective_to,change_summary,source_digest,published_at,published_by_account_id,revision,updated_at,updated_by_account_id) ON hcm.position_version TO hcm_runtime;
GRANT DELETE ON hcm.position_requirement, hcm.position_change_item TO hcm_runtime;
GRANT UPDATE (status,encrypted_reason,reason_key_version,submitted_at,applied_at,revision,updated_at) ON hcm.position_change_request TO hcm_runtime;
GRANT UPDATE (status) ON hcm.position_impact_preview TO hcm_runtime;
GRANT UPDATE (status,completed_at) ON hcm.position_approval_case TO hcm_runtime;
GRANT UPDATE (applied_at) ON hcm.position_decision TO hcm_runtime;
