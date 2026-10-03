-- Leave periods are explicit tenant configuration; dates are never inferred from
-- a financial year or a calendar-year default. Ordinary commands cannot close
-- periods until the reconciled close command is installed.
CREATE TABLE hcm.leave_period (
  tenant_id text NOT NULL REFERENCES hcm.organisation_profile(tenant_id),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
  code text NOT NULL CHECK(code ~ '^[A-Z][A-Z0-9_-]{0,39}$'),
  name text NOT NULL CHECK(length(btrim(name))>0 AND length(name)<=120),
  start_date date NOT NULL, end_date date NOT NULL CHECK(end_date>=start_date),
  effective_period daterange GENERATED ALWAYS AS(daterange(start_date,end_date+1,'[)')) STORED,
  state text NOT NULL DEFAULT 'Planned' CHECK(state IN ('Planned','Open','Closing','Closed')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  closed_at timestamptz, closed_by_account_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by_account_id text NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code),
  FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY(tenant_id,closed_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  CHECK((state='Closed')=(closed_at IS NOT NULL AND closed_by_account_id IS NOT NULL)),
  CHECK((closed_at IS NULL)=(closed_by_account_id IS NULL)),
  EXCLUDE USING gist(tenant_id WITH =,effective_period WITH &&)
);

-- Composite identity carries the published policy's mode and unit into every
-- enrollment and account. This is a database invariant, not a UI convention.
ALTER TABLE hcm.leave_policy_version ADD CONSTRAINT leave_policy_version_enrollment_basis
  UNIQUE(tenant_id,id,policy_id,tracking_mode,unit);
CREATE TABLE hcm.leave_enrollment (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
  employment_id text NOT NULL, policy_id text NOT NULL, policy_version_id text NOT NULL,
  period_id text NOT NULL, tracking_mode text NOT NULL, unit text NOT NULL,
  source text NOT NULL CHECK(source IN ('Eligibility','ManualOverride')),
  state text NOT NULL CHECK(state IN ('Pending','Active','Suspended','Ended')),
  effective_from date NOT NULL, effective_to date NOT NULL CHECK(effective_to>=effective_from),
  effective_period daterange GENERATED ALWAYS AS(daterange(effective_from,effective_to+1,'[)')) STORED,
  eligibility_digest text NOT NULL CHECK(eligibility_digest ~ '^[a-f0-9]{64}$'),
  encrypted_eligibility_snapshot bytea NOT NULL CHECK(octet_length(encrypted_eligibility_snapshot) BETWEEN 1 AND 1048576),
  eligibility_key_version integer NOT NULL CHECK(eligibility_key_version>0),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by_account_id text NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,id,tracking_mode,unit),
  FOREIGN KEY(tenant_id,employment_id) REFERENCES hcm.employment(tenant_id,id),
  FOREIGN KEY(tenant_id,policy_version_id,policy_id,tracking_mode,unit)
    REFERENCES hcm.leave_policy_version(tenant_id,id,policy_id,tracking_mode,unit),
  FOREIGN KEY(tenant_id,period_id) REFERENCES hcm.leave_period(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  EXCLUDE USING gist(tenant_id WITH =,employment_id WITH =,policy_id WITH =,effective_period WITH &&)
);
CREATE INDEX leave_enrollment_employment ON hcm.leave_enrollment(tenant_id,employment_id,state,id);
CREATE INDEX leave_enrollment_policy ON hcm.leave_enrollment(tenant_id,policy_version_id,period_id,id);

CREATE TABLE hcm.leave_balance_account (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), enrollment_id text NOT NULL,
  tracking_mode text NOT NULL DEFAULT 'Balance' CHECK(tracking_mode='Balance'), unit text NOT NULL,
  posted_units hcm.leave_units NOT NULL DEFAULT 0 CHECK(posted_units>=0),
  reserved_units hcm.leave_units NOT NULL DEFAULT 0 CHECK(reserved_units>=0 AND reserved_units<=posted_units),
  available_units numeric(18,6) GENERATED ALWAYS AS(posted_units-reserved_units) STORED,
  last_posted_at timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,enrollment_id), UNIQUE(tenant_id,id,unit),
  FOREIGN KEY(tenant_id,enrollment_id,tracking_mode,unit)
    REFERENCES hcm.leave_enrollment(tenant_id,id,tracking_mode,unit)
);

-- Hold period and policy read locks during admission so close/retirement cannot
-- race an enrollment. Employment eligibility is evaluated by the owner command.
CREATE FUNCTION hcm.guard_leave_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy hcm.leave_policy_version; period hcm.leave_period;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.revision<>OLD.revision+1 OR
      (to_jsonb(NEW)-ARRAY['revision','state','effective_period']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['revision','state','effective_period']) OR
      NOT ((OLD.state='Pending' AND NEW.state IN ('Active','Ended')) OR
        (OLD.state='Active' AND NEW.state IN ('Suspended','Ended')) OR
        (OLD.state='Suspended' AND NEW.state IN ('Active','Ended'))) THEN
      RAISE EXCEPTION 'Invalid leave enrollment transition' USING ERRCODE='23514';
    END IF;
    IF NEW.state<>'Active' THEN RETURN NEW; END IF;
  ELSIF NEW.state NOT IN ('Pending','Active') OR NEW.revision<>1 THEN
    RAISE EXCEPTION 'Invalid initial enrollment state' USING ERRCODE='23514';
  END IF;
  SELECT * INTO period FROM hcm.leave_period WHERE tenant_id=NEW.tenant_id AND id=NEW.period_id FOR SHARE;
  SELECT * INTO policy FROM hcm.leave_policy_version WHERE tenant_id=NEW.tenant_id AND id=NEW.policy_version_id FOR SHARE;
  IF period.id IS NULL OR policy.id IS NULL THEN
    RAISE EXCEPTION 'Enrollment basis unavailable' USING ERRCODE='23503';
  END IF;
  IF policy.state<>'Published' OR period.state<>'Open' OR
    NOT (period.effective_period @> daterange(NEW.effective_from,NEW.effective_to+1,'[)')) OR
    NOT (policy.effective_period @> daterange(NEW.effective_from,NEW.effective_to+1,'[)')) THEN
    RAISE EXCEPTION 'Enrollment requires a dated published policy and open period' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_enrollment_guard BEFORE INSERT OR UPDATE ON hcm.leave_enrollment
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_enrollment();

CREATE FUNCTION hcm.guard_leave_account_creation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE enrollment_state text;
BEGIN
  SELECT state INTO enrollment_state FROM hcm.leave_enrollment WHERE tenant_id=NEW.tenant_id AND id=NEW.enrollment_id FOR SHARE;
  IF enrollment_state IS DISTINCT FROM 'Active' OR NEW.posted_units<>0 OR NEW.reserved_units<>0 OR NEW.last_posted_at IS NOT NULL OR NEW.revision<>1 THEN
    RAISE EXCEPTION 'A new active account starts without unproven entitlement' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_account_creation_guard BEFORE INSERT ON hcm.leave_balance_account
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_account_creation();

-- Activation and empty account creation commit together; an active Balance
-- enrollment without its account is never a durable partial success.
CREATE FUNCTION hcm.require_leave_enrollment_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM hcm.leave_enrollment e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.id
    AND e.state='Active' AND e.tracking_mode='Balance' AND NOT EXISTS(
      SELECT 1 FROM hcm.leave_balance_account a WHERE a.tenant_id=e.tenant_id AND a.enrollment_id=e.id)) THEN
    RAISE EXCEPTION 'Active balance enrollment requires an account' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER leave_enrollment_account_required AFTER INSERT OR UPDATE ON hcm.leave_enrollment
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_leave_enrollment_account();

CREATE FUNCTION hcm.guard_leave_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Planned' OR NEW.revision<>1 THEN RAISE EXCEPTION 'Create a planned leave period' USING ERRCODE='23514'; END IF;
  ELSE
    IF NEW.revision<>OLD.revision+1 OR
      (to_jsonb(NEW)-ARRAY['revision','state','closed_at','closed_by_account_id','effective_period']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['revision','state','closed_at','closed_by_account_id','effective_period']) OR
      NOT ((OLD.state='Planned' AND NEW.state='Open') OR (OLD.state='Open' AND NEW.state='Closing') OR (OLD.state='Closing' AND NEW.state='Closed')) THEN
      RAISE EXCEPTION 'Invalid leave period transition' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_period_guard BEFORE INSERT OR UPDATE ON hcm.leave_period
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_period();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['leave_period','leave_enrollment','leave_balance_account'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END $policies$;
GRANT INSERT ON hcm.leave_enrollment,hcm.leave_balance_account TO hcm_runtime;
-- PostgreSQL row locks need an UPDATE privilege. Revision alone cannot pass the
-- transition guards and grants no lifecycle command or editable payload.
GRANT UPDATE(revision) ON hcm.leave_period,hcm.leave_enrollment TO hcm_runtime;
-- Lifecycle/account writes are admitted with their obligation/ledger commands,
-- not as standalone row mutation. Period configuration has no implicit generator.
