-- Leave grant evidence and its posting are immutable. This slice admits only
-- source-backed Grant credits; accrual, request debits, reversals and adjustments
-- acquire their typed source references with their respective command slices.
CREATE TABLE hcm.leave_entitlement_grant (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200), enrollment_id text NOT NULL,
  tracking_mode text NOT NULL DEFAULT 'Balance' CHECK(tracking_mode='Balance'), unit text NOT NULL,
  grant_type text NOT NULL CHECK(grant_type IN ('Opening','Annual','Prorated','CarryForward','Statutory','Event')),
  granted_units hcm.leave_units NOT NULL CHECK(granted_units>0),
  grant_date date NOT NULL, expires_on date CHECK(expires_on>=grant_date),
  source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 200),
  input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by_account_id text NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,enrollment_id,idempotency_key),
  FOREIGN KEY(tenant_id,enrollment_id,tracking_mode,unit) REFERENCES hcm.leave_enrollment(tenant_id,id,tracking_mode,unit),
  FOREIGN KEY(tenant_id,created_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE TABLE hcm.leave_balance_transaction (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id), id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
  account_id text NOT NULL, unit text NOT NULL, sequence_number bigint NOT NULL CHECK(sequence_number>0),
  transaction_type text NOT NULL CHECK(transaction_type='Grant'),
  units_delta hcm.leave_units NOT NULL CHECK(units_delta<>0), balance_after_units hcm.leave_units NOT NULL CHECK(balance_after_units>=0),
  effective_date date NOT NULL, entitlement_grant_id text NOT NULL,
  idempotency_key uuid NOT NULL, input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  posted_at timestamptz NOT NULL, posted_by_account_id text NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,account_id,sequence_number),
  UNIQUE(tenant_id,account_id,idempotency_key), UNIQUE(tenant_id,entitlement_grant_id),
  FOREIGN KEY(tenant_id,account_id,unit) REFERENCES hcm.leave_balance_account(tenant_id,id,unit),
  FOREIGN KEY(tenant_id,entitlement_grant_id) REFERENCES hcm.leave_entitlement_grant(tenant_id,id),
  FOREIGN KEY(tenant_id,posted_by_account_id) REFERENCES hcm.user_account(tenant_id,id)
);
CREATE INDEX leave_grant_expiry ON hcm.leave_entitlement_grant(tenant_id,expires_on,enrollment_id,id) WHERE expires_on IS NOT NULL;

-- A period share lock fences close before an account is locked; callers use the
-- same order. The account lock serializes sequence and exact balance projection.
CREATE FUNCTION hcm.prepare_leave_grant_posting() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account hcm.leave_balance_account; enrollment hcm.leave_enrollment;
  period hcm.leave_period; grant_row hcm.leave_entitlement_grant; next_sequence bigint;
BEGIN
  SELECT e.* INTO enrollment FROM hcm.leave_enrollment e JOIN hcm.leave_balance_account a
    ON a.tenant_id=e.tenant_id AND a.enrollment_id=e.id WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.account_id;
  SELECT * INTO period FROM hcm.leave_period WHERE tenant_id=NEW.tenant_id AND id=enrollment.period_id FOR SHARE;
  SELECT * INTO account FROM hcm.leave_balance_account WHERE tenant_id=NEW.tenant_id AND id=NEW.account_id FOR UPDATE;
  SELECT * INTO grant_row FROM hcm.leave_entitlement_grant WHERE tenant_id=NEW.tenant_id AND id=NEW.entitlement_grant_id;
  IF account.id IS NULL OR enrollment.id IS NULL OR period.id IS NULL OR grant_row.id IS NULL THEN
    RAISE EXCEPTION 'Leave posting basis unavailable' USING ERRCODE='23503';
  END IF;
  IF enrollment.state<>'Active' OR NOT (period.state='Open' OR (period.state='Closing' AND grant_row.grant_type='CarryForward')) OR NOT (enrollment.effective_period @> NEW.effective_date)
    OR grant_row.enrollment_id<>account.enrollment_id OR grant_row.unit<>NEW.unit OR account.unit<>NEW.unit
    OR grant_row.granted_units<>NEW.units_delta OR grant_row.grant_date<>NEW.effective_date
    OR grant_row.idempotency_key<>NEW.idempotency_key OR grant_row.input_digest<>NEW.input_digest
    OR grant_row.created_by_account_id<>NEW.posted_by_account_id THEN
    RAISE EXCEPTION 'Leave posting does not match its immutable source grant' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(max(sequence_number),0)+1 INTO next_sequence FROM hcm.leave_balance_transaction
    WHERE tenant_id=NEW.tenant_id AND account_id=NEW.account_id;
  NEW.sequence_number:=next_sequence;
  NEW.balance_after_units:=account.posted_units+NEW.units_delta;
  NEW.posted_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER leave_grant_posting_prepare BEFORE INSERT ON hcm.leave_balance_transaction
  FOR EACH ROW EXECUTE FUNCTION hcm.prepare_leave_grant_posting();

-- Runtime cannot overwrite balance history or create an unproven projection.
-- The AFTER INSERT trigger sees the appended row before updating the account.
CREATE FUNCTION hcm.guard_leave_account_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE posted numeric; latest timestamptz;
BEGIN
  IF NEW.revision<>OLD.revision+1 OR
    (to_jsonb(NEW)-ARRAY['posted_units','last_posted_at','revision','available_units']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['posted_units','last_posted_at','revision','available_units']) THEN
    RAISE EXCEPTION 'Invalid leave account projection change' USING ERRCODE='23514';
  END IF;
  SELECT coalesce(sum(units_delta),0),max(posted_at) INTO posted,latest FROM hcm.leave_balance_transaction
    WHERE tenant_id=NEW.tenant_id AND account_id=NEW.id;
  IF NEW.posted_units<>posted OR NEW.last_posted_at IS DISTINCT FROM latest OR NEW.posted_units=OLD.posted_units THEN
    RAISE EXCEPTION 'Leave account must reconcile to immutable postings' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER leave_account_projection_guard BEFORE UPDATE ON hcm.leave_balance_account
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_account_projection();
CREATE FUNCTION hcm.project_leave_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE hcm.leave_balance_account SET posted_units=NEW.balance_after_units,last_posted_at=NEW.posted_at,revision=revision+1
    WHERE tenant_id=NEW.tenant_id AND id=NEW.account_id;
  RETURN NULL;
END $$;
CREATE TRIGGER leave_posting_project AFTER INSERT ON hcm.leave_balance_transaction
  FOR EACH ROW EXECUTE FUNCTION hcm.project_leave_posting();

CREATE FUNCTION hcm.require_leave_grant_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM hcm.leave_balance_transaction WHERE tenant_id=NEW.tenant_id AND entitlement_grant_id=NEW.id) THEN
    RAISE EXCEPTION 'A leave grant must commit with its posting' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER leave_grant_posting_required AFTER INSERT ON hcm.leave_entitlement_grant
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_leave_grant_posting();

CREATE FUNCTION hcm.guard_leave_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Leave grant and ledger evidence is immutable' USING ERRCODE='23514';
END $$;
DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['leave_entitlement_grant','leave_balance_transaction'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING(tenant_id=hcm.current_tenant_id()) WITH CHECK(tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('CREATE TRIGGER leave_ledger_immutable BEFORE UPDATE OR DELETE ON hcm.%I FOR EACH ROW EXECUTE FUNCTION hcm.guard_leave_ledger_immutable()',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END $policies$;
GRANT UPDATE(posted_units,last_posted_at,revision) ON hcm.leave_balance_account TO hcm_runtime;
