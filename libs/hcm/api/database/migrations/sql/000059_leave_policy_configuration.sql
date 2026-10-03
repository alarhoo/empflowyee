-- Leave owns policy identities, effective immutable versions and typed rules.
-- Drafts may be incomplete; no default timing, entitlement or request window is
-- supplied by SQL. Runtime publication remains gated by source impact evidence.
CREATE DOMAIN hcm.leave_units AS numeric(18,6) CHECK(VALUE IS NULL OR VALUE <> 'NaN'::numeric);
CREATE TABLE hcm.leave_type (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  name text NOT NULL CHECK (length(btrim(name))>0 AND length(name)<=120),
  category text NOT NULL CHECK (category IN ('Annual','Sick','Casual','Parental','Unpaid','CompOff','Other')),
  unit text NOT NULL CHECK (unit IN ('Day','Hour')),
  is_paid boolean NOT NULL, is_sensitive boolean NOT NULL, is_active boolean NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  PRIMARY KEY (tenant_id,id), UNIQUE(tenant_id,code), UNIQUE(tenant_id,id,unit)
);
CREATE TABLE hcm.leave_policy (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  leave_type_id text NOT NULL, unit text NOT NULL,
  created_by_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code), UNIQUE(tenant_id,id,unit),
  FOREIGN KEY(tenant_id,leave_type_id,unit) REFERENCES hcm.leave_type(tenant_id,id,unit),
  FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.leave_policy_version (
  tenant_id text NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200), policy_id text NOT NULL,
  version_number integer NOT NULL CHECK (version_number>0), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  state text NOT NULL DEFAULT 'Draft' CHECK(state IN ('Draft','Published','Retired')),
  name text NOT NULL CHECK(length(btrim(name))>0 AND length(name)<=120),
  description text CHECK(length(description)<=2000),
  effective_from date NOT NULL, effective_to date,
  effective_period daterange GENERATED ALWAYS AS (daterange(effective_from,effective_to+1,'[)')) STORED,
  tracking_mode text NOT NULL CHECK(tracking_mode IN ('Balance','Unpaid')), unit text NOT NULL,
  standard_day_minutes integer CHECK(standard_day_minutes>0), hourly_increment_minutes integer CHECK(hourly_increment_minutes>0),
  rounding_scale smallint NOT NULL CHECK(rounding_scale BETWEEN 0 AND 6), rounding_mode text NOT NULL CHECK(rounding_mode IN ('Up','Down','Nearest')),
  allow_half_day boolean, allow_hourly boolean, maximum_backdated_days integer CHECK(maximum_backdated_days>=0), maximum_advance_days integer CHECK(maximum_advance_days>=0),
  minimum_request_units hcm.leave_units CHECK(minimum_request_units>0), maximum_request_units hcm.leave_units CHECK(maximum_request_units>0),
  minimum_service_days integer CHECK(minimum_service_days>=0), notice_days integer CHECK(notice_days>=0), notice_mode text NOT NULL CHECK(notice_mode IN ('Warning','Block')),
  evidence_after_consecutive_days integer CHECK(evidence_after_consecutive_days>0), bridge_rule text NOT NULL CHECK(bridge_rule IN ('None','CountIntervening')),
  allow_overlap boolean NOT NULL CHECK(NOT allow_overlap), negative_balance_allowed boolean NOT NULL CHECK(NOT negative_balance_allowed), posting_point text NOT NULL CHECK(posting_point='OnApproval'),
  supersedes_id text, created_by_account_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_by_account_id text, published_at timestamptz, publication_digest text CHECK(publication_digest ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,policy_id,version_number), UNIQUE(tenant_id,policy_id,id),
  FOREIGN KEY(tenant_id,policy_id,unit) REFERENCES hcm.leave_policy(tenant_id,id,unit),
  FOREIGN KEY(tenant_id,policy_id,supersedes_id) REFERENCES hcm.leave_policy_version(tenant_id,policy_id,id),
  FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY(tenant_id,published_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from), CHECK(supersedes_id IS NULL OR supersedes_id<>id),
  CHECK(minimum_request_units IS NULL OR maximum_request_units IS NULL OR minimum_request_units<=maximum_request_units),
  CHECK((state='Draft' AND published_at IS NULL AND published_by_account_id IS NULL AND publication_digest IS NULL)
    OR (state<>'Draft' AND published_at IS NOT NULL AND published_by_account_id IS NOT NULL AND publication_digest IS NOT NULL)),
  EXCLUDE USING gist(tenant_id WITH =,policy_id WITH =,effective_period WITH &&) WHERE(state='Published')
);
CREATE INDEX leave_policy_version_lookup ON hcm.leave_policy_version(tenant_id,state,policy_id,id);

CREATE TABLE hcm.leave_policy_worker_type (
  tenant_id text NOT NULL, version_id text NOT NULL, worker_type_id text NOT NULL,
  PRIMARY KEY(tenant_id,version_id,worker_type_id), FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id),
  FOREIGN KEY(tenant_id,worker_type_id) REFERENCES hcm.worker_type(tenant_id,id)
);
CREATE TABLE hcm.leave_policy_legal_entity (
  tenant_id text NOT NULL, version_id text NOT NULL, legal_entity_id text NOT NULL,
  PRIMARY KEY(tenant_id,version_id,legal_entity_id), FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id),
  FOREIGN KEY(tenant_id,legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id)
);
CREATE TABLE hcm.leave_eligibility_rule (
  tenant_id text NOT NULL, version_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 100),
  priority integer NOT NULL CHECK(priority>=0), effect text NOT NULL CHECK(effect IN ('Include','Exclude')),
  effective_from date NOT NULL, effective_to date,
  legal_entity_id text, org_unit_id text, department_id text, location_id text, worker_type_id text,
  employment_type text CHECK(length(employment_type) BETWEEN 1 AND 200), gender_code text CHECK(length(gender_code) BETWEEN 1 AND 200),
  minimum_service_days integer CHECK(minimum_service_days>=0), statutory_floor_reference text CHECK(length(statutory_floor_reference) BETWEEN 1 AND 200),
  PRIMARY KEY(tenant_id,version_id,id), UNIQUE(tenant_id,version_id,ordinal),
  FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id),
  FOREIGN KEY(tenant_id,legal_entity_id) REFERENCES hcm.legal_entity(tenant_id,id),
  FOREIGN KEY(tenant_id,org_unit_id) REFERENCES hcm.organisation(tenant_id,id),
  FOREIGN KEY(tenant_id,department_id) REFERENCES hcm.department(tenant_id,id),
  FOREIGN KEY(tenant_id,location_id) REFERENCES hcm.location(tenant_id,id),
  FOREIGN KEY(tenant_id,worker_type_id) REFERENCES hcm.worker_type(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from)
);
CREATE TABLE hcm.leave_policy_assignment (
  tenant_id text NOT NULL, version_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 100),
  employment_id text NOT NULL, effect text NOT NULL CHECK(effect IN ('Include','Exclude')), effective_from date NOT NULL, effective_to date,
  effective_period daterange GENERATED ALWAYS AS(daterange(effective_from,effective_to+1,'[)')) STORED,
  PRIMARY KEY(tenant_id,version_id,id), UNIQUE(tenant_id,version_id,ordinal),
  FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id),
  FOREIGN KEY(tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  CHECK(effective_to IS NULL OR effective_to>=effective_from),
  EXCLUDE USING gist(tenant_id WITH =,version_id WITH =,employment_id WITH =,effective_period WITH &&)
);
CREATE TABLE hcm.leave_accrual_rule (
  tenant_id text NOT NULL, version_id text NOT NULL, enabled boolean NOT NULL,
  units_per_year hcm.leave_units CHECK(units_per_year>0), units_per_month hcm.leave_units CHECK(units_per_month>0), units_per_occurrence hcm.leave_units CHECK(units_per_occurrence>0),
  frequency text CHECK(frequency IN ('OnJoin','Monthly','Quarterly','Annual','ServiceAnniversary')), timing text CHECK(timing IN ('Advance','Arrears')), proration text CHECK(proration IN ('None','CalendarDays','WorkingDays')),
  waiting_period_days integer CHECK(waiting_period_days>=0), maximum_accrued_balance_units hcm.leave_units CHECK(maximum_accrued_balance_units>0),
  PRIMARY KEY(tenant_id,version_id), FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id)
);
CREATE TABLE hcm.leave_carry_forward_rule (
  tenant_id text NOT NULL, version_id text NOT NULL, enabled boolean NOT NULL,
  cap_units hcm.leave_units CHECK(cap_units>0), expiry_days integer CHECK(expiry_days>0), expiry_basis text CHECK(expiry_basis IN ('PeriodStart','PeriodEnd','GrantDate')),
  PRIMARY KEY(tenant_id,version_id), FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id)
);
CREATE TABLE hcm.leave_comp_off_rule (
  tenant_id text NOT NULL, version_id text NOT NULL, enabled boolean NOT NULL,
  half_unit_minutes integer CHECK(half_unit_minutes>0), unit_minutes integer CHECK(unit_minutes>0), max_units_per_date hcm.leave_units CHECK(max_units_per_date>0),
  claim_window_days integer CHECK(claim_window_days>0), expiry_days integer CHECK(expiry_days>0),
  PRIMARY KEY(tenant_id,version_id), FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id),
  CHECK(half_unit_minutes IS NULL OR unit_minutes IS NULL OR half_unit_minutes<unit_minutes)
);
CREATE TABLE hcm.leave_encashment_rule (
  tenant_id text NOT NULL, version_id text NOT NULL, configured boolean NOT NULL, annual_only boolean NOT NULL CHECK(annual_only),
  max_units hcm.leave_units CHECK(max_units>0), minimum_retained_units hcm.leave_units CHECK(minimum_retained_units>=0),
  PRIMARY KEY(tenant_id,version_id), FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id)
);
CREATE TABLE hcm.leave_approval_rule (
  tenant_id text NOT NULL, version_id text NOT NULL, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 75),
  stage smallint NOT NULL CHECK(stage BETWEEN 1 AND 5), role_code text NOT NULL CHECK(role_code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  subject_type text NOT NULL CHECK(subject_type IN ('Leave','Cancellation','Adjustment')), independent boolean NOT NULL,
  candidate_source text CHECK(candidate_source IN ('LineManager','ManagerLevel','Function','NamedUser')),
  manager_level integer CHECK(manager_level>0), function_code text CHECK(function_code='LEAVE_APPROVAL_ACT'), account_id text,
  minimum_units hcm.leave_units CHECK(minimum_units>=0), maximum_units hcm.leave_units CHECK(maximum_units>0),
  PRIMARY KEY(tenant_id,version_id,id), UNIQUE(tenant_id,version_id,ordinal),
  FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id),
  FOREIGN KEY(tenant_id,account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK(subject_type<>'Adjustment' OR independent),
  CHECK(manager_level IS NULL OR candidate_source IS NOT DISTINCT FROM 'ManagerLevel'),
  CHECK(function_code IS NULL OR candidate_source IS NOT DISTINCT FROM 'Function'),
  CHECK(account_id IS NULL OR candidate_source IS NOT DISTINCT FROM 'NamedUser'),
  CHECK(minimum_units IS NULL OR maximum_units IS NULL OR minimum_units<maximum_units)
);
CREATE TABLE hcm.leave_policy_blackout (
  tenant_id text NOT NULL, version_id text NOT NULL, work_date date NOT NULL,
  PRIMARY KEY(tenant_id,version_id,work_date), FOREIGN KEY(tenant_id,version_id) REFERENCES hcm.leave_policy_version(tenant_id,id)
);

-- Version locking serializes draft replacement with publication. Published child
-- rows cannot be changed even through direct runtime SQL.
CREATE FUNCTION hcm.guard_leave_policy_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_state text; target_tenant text; target_version text;
BEGIN
  IF TG_OP='DELETE' THEN target_tenant:=OLD.tenant_id; target_version:=OLD.version_id;
  ELSE target_tenant:=NEW.tenant_id; target_version:=NEW.version_id; END IF;
  SELECT state INTO parent_state FROM hcm.leave_policy_version WHERE tenant_id=target_tenant AND id=target_version FOR UPDATE;
  IF parent_state IS DISTINCT FROM 'Draft' THEN RAISE EXCEPTION 'Leave policy content is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION hcm.guard_leave_policy_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Draft' THEN RAISE EXCEPTION 'Create a draft first' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1 OR NEW.tenant_id<>OLD.tenant_id OR NEW.id<>OLD.id OR NEW.policy_id<>OLD.policy_id
    OR NEW.version_number<>OLD.version_number OR NEW.unit<>OLD.unit OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
    OR NEW.created_by_account_id<>OLD.created_by_account_id OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'Invalid leave policy revision' USING ERRCODE='23514';
  END IF;
  IF OLD.state<>'Draft' THEN
    IF OLD.state<>'Published' OR NEW.state<>'Retired' OR
      (to_jsonb(NEW)-ARRAY['state','revision','effective_period']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','effective_period']) THEN
      RAISE EXCEPTION 'Published leave policy is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state='Retired' THEN RAISE EXCEPTION 'A draft cannot retire' USING ERRCODE='23514'; END IF;
  IF NEW.state='Published' THEN
    IF NEW.allow_half_day IS NULL OR NEW.allow_hourly IS NULL OR NEW.maximum_backdated_days IS NULL OR NEW.maximum_advance_days IS NULL
      OR (NEW.allow_hourly AND NEW.hourly_increment_minutes IS NULL)
      OR NOT EXISTS(SELECT 1 FROM hcm.leave_accrual_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id)
      OR NOT EXISTS(SELECT 1 FROM hcm.leave_carry_forward_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id)
      OR NOT EXISTS(SELECT 1 FROM hcm.leave_comp_off_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id)
      OR NOT EXISTS(SELECT 1 FROM hcm.leave_encashment_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id)
      OR EXISTS(SELECT 1 FROM hcm.leave_accrual_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id AND enabled AND
        (NEW.tracking_mode='Unpaid' OR frequency IS NULL OR timing IS NULL OR proration IS NULL OR units_per_occurrence IS NULL OR waiting_period_days IS NULL))
      OR EXISTS(SELECT 1 FROM hcm.leave_carry_forward_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id AND enabled AND
        (NEW.tracking_mode='Unpaid' OR cap_units IS NULL OR expiry_days IS NULL OR expiry_basis IS NULL))
      OR EXISTS(SELECT 1 FROM hcm.leave_comp_off_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id AND enabled AND
        (NEW.tracking_mode='Unpaid' OR half_unit_minutes IS NULL OR unit_minutes IS NULL OR max_units_per_date IS NULL OR claim_window_days IS NULL OR expiry_days IS NULL))
      OR EXISTS(SELECT 1 FROM hcm.leave_encashment_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id AND configured AND
        (NEW.tracking_mode='Unpaid' OR max_units IS NULL OR minimum_retained_units IS NULL))
      OR EXISTS(SELECT 1 FROM hcm.leave_approval_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id AND
        (candidate_source IS NULL OR (candidate_source='ManagerLevel' AND manager_level IS NULL) OR (candidate_source='Function' AND function_code IS NULL) OR (candidate_source='NamedUser' AND account_id IS NULL)))
      OR EXISTS(SELECT 1 FROM hcm.leave_approval_rule WHERE tenant_id=NEW.tenant_id AND version_id=NEW.id GROUP BY subject_type,stage HAVING count(*)>5) THEN
      RAISE EXCEPTION 'Incomplete leave policy' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_policy_version_guard BEFORE INSERT OR UPDATE ON hcm.leave_policy_version FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_policy_version();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['leave_type','leave_policy','leave_policy_version','leave_policy_worker_type','leave_policy_legal_entity','leave_eligibility_rule','leave_policy_assignment','leave_accrual_rule','leave_carry_forward_rule','leave_comp_off_rule','leave_encashment_rule','leave_approval_rule','leave_policy_blackout'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime',relation);
    IF relation<>'leave_type' THEN EXECUTE format('GRANT INSERT ON hcm.%I TO hcm_runtime',relation); END IF;
    IF relation NOT IN ('leave_type','leave_policy','leave_policy_version') THEN
      EXECUTE format('CREATE TRIGGER leave_policy_child_guard BEFORE INSERT OR DELETE ON hcm.%I FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_policy_child()',relation);
      EXECUTE format('GRANT DELETE ON hcm.%I TO hcm_runtime',relation);
    END IF;
  END LOOP;
END $policies$;
-- Runtime may edit drafts, but cannot publish until the impact-evidence migration
-- grants the lifecycle columns and binds publication to a consumed preview.
GRANT UPDATE(name,description,effective_from,effective_to,tracking_mode,standard_day_minutes,hourly_increment_minutes,rounding_scale,rounding_mode,
  allow_half_day,allow_hourly,maximum_backdated_days,maximum_advance_days,minimum_request_units,maximum_request_units,minimum_service_days,notice_days,notice_mode,
  evidence_after_consecutive_days,bridge_rule,allow_overlap,negative_balance_allowed,posting_point,revision) ON hcm.leave_policy_version TO hcm_runtime;
