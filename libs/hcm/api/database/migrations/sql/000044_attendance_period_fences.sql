-- Attendance owns monthly period fences and immutable lock evidence. This is
-- explicit prerequisite storage, not an API close/reopen or scheduling operation.
CREATE TABLE hcm.attendance_period (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  month_start date NOT NULL CHECK (month_start BETWEEN date '0001-01-01' AND date '9999-12-01'
    AND extract(day FROM month_start)=1),
  month_end date GENERATED ALWAYS AS ((month_start+interval '1 month'-interval '1 day')::date) STORED,
  state text NOT NULL DEFAULT 'Planned' CHECK (state IN ('Planned','Open','Closing','Locked','Reopened')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  current_lock_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,month_start),
  CHECK (state NOT IN ('Locked','Reopened') OR current_lock_id IS NOT NULL),
  CHECK (state NOT IN ('Planned','Open') OR current_lock_id IS NULL)
);
CREATE TABLE hcm.attendance_period_lock (
  tenant_id text NOT NULL REFERENCES hcm.tenant(id),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  period_id text NOT NULL,
  lock_number integer NOT NULL CHECK (lock_number>0),
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  output_digest text NOT NULL CHECK (output_digest ~ '^[a-f0-9]{64}$'),
  reconciliation_digest text NOT NULL CHECK (reconciliation_digest ~ '^[a-f0-9]{64}$'),
  supersedes_id text,
  locked_at timestamptz NOT NULL DEFAULT now(),
  locked_by_account_id text NOT NULL,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,period_id,id),
  UNIQUE (tenant_id,period_id,lock_number),
  FOREIGN KEY (tenant_id,period_id) REFERENCES hcm.attendance_period(tenant_id,id),
  FOREIGN KEY (tenant_id,locked_by_account_id) REFERENCES hcm.user_account(tenant_id,id),
  FOREIGN KEY (tenant_id,period_id,supersedes_id) REFERENCES hcm.attendance_period_lock(tenant_id,period_id,id),
  CHECK ((lock_number=1)=(supersedes_id IS NULL)),
  CHECK (id IS DISTINCT FROM supersedes_id)
);
ALTER TABLE hcm.attendance_period ADD CONSTRAINT attendance_period_current_lock_fk
  FOREIGN KEY (tenant_id,id,current_lock_id) REFERENCES hcm.attendance_period_lock(tenant_id,period_id,id);

-- Source producers take shared fences before reading; state changes take the
-- exclusive fence. Even an absent period is protected against concurrent creation.
-- This invoker function preserves tenant RLS; it cannot select another tenant.
CREATE FUNCTION hcm.fence_attendance_month(p_tenant text,p_month date,p_write boolean)
RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
  IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM hcm.current_tenant_id()
    OR p_month IS NULL OR p_month<date '0001-01-01' OR p_month>date '9999-12-01'
    OR extract(day FROM p_month)<>1 OR p_write IS NULL THEN
    RAISE EXCEPTION 'Invalid attendance period fence' USING ERRCODE='42501';
  END IF;
  IF p_write THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant||':attendance-period:'||to_char(p_month,'YYYY-MM'),0));
  ELSE
    PERFORM pg_advisory_xact_lock_shared(hashtextextended(p_tenant||':attendance-period:'||to_char(p_month,'YYYY-MM'),0));
  END IF;
END
$body$;
REVOKE ALL ON FUNCTION hcm.fence_attendance_month(text,date,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hcm.fence_attendance_month(text,date,boolean) TO hcm_runtime,hcm_migrator;

-- SQL repeats the fence and lifecycle checks. Application transactions acquire
-- their monthly fences before owner row locks to preserve a single lock order.
CREATE FUNCTION hcm.guard_attendance_period() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE selected_lock hcm.attendance_period_lock%ROWTYPE;
BEGIN
  PERFORM hcm.fence_attendance_month(NEW.tenant_id,NEW.month_start,true);
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'Planned' OR NEW.revision<>1 OR NEW.current_lock_id IS NOT NULL THEN
      RAISE EXCEPTION 'Period must start Planned' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.revision<>OLD.revision+1
    OR (to_jsonb(NEW)-ARRAY['state','revision','current_lock_id','updated_at','month_end'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','current_lock_id','updated_at','month_end']) THEN
    RAISE EXCEPTION 'Period identity is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.state='Locked' AND NEW.state='Reopened' THEN
    -- The independently approved source case and linked delta are mandatory.
    -- Their later owning migration supplies typed references and this transition.
    RAISE EXCEPTION 'Approved reopen integration unavailable' USING ERRCODE='23514';
  END IF;
  IF NOT ((OLD.state='Planned' AND NEW.state='Open')
    OR (OLD.state='Open' AND NEW.state='Closing')
    OR (OLD.state='Closing' AND NEW.state IN ('Open','Locked'))
    OR (OLD.state='Reopened' AND NEW.state='Closing')) THEN
    RAISE EXCEPTION 'Invalid period transition' USING ERRCODE='23514';
  END IF;
  IF NEW.state='Locked' THEN
    SELECT * INTO selected_lock FROM hcm.attendance_period_lock
      WHERE tenant_id=NEW.tenant_id AND period_id=NEW.id AND id=NEW.current_lock_id;
    IF selected_lock.id IS NULL OR selected_lock.supersedes_id IS DISTINCT FROM OLD.current_lock_id THEN
      RAISE EXCEPTION 'Matching appended period lock required' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.current_lock_id IS DISTINCT FROM OLD.current_lock_id THEN
    RAISE EXCEPTION 'Period lock pointer is immutable outside locking' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_period_lifecycle BEFORE INSERT OR UPDATE ON hcm.attendance_period
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_period();

CREATE FUNCTION hcm.guard_attendance_period_lock() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE period hcm.attendance_period%ROWTYPE;
DECLARE prior_number integer;
BEGIN
  SELECT * INTO period FROM hcm.attendance_period WHERE tenant_id=NEW.tenant_id AND id=NEW.period_id;
  IF period.id IS NULL THEN RAISE EXCEPTION 'Period unavailable' USING ERRCODE='23503'; END IF;
  PERFORM hcm.fence_attendance_month(NEW.tenant_id,period.month_start,true);
  SELECT * INTO period FROM hcm.attendance_period WHERE tenant_id=NEW.tenant_id AND id=NEW.period_id;
  IF period.state<>'Closing' OR NEW.supersedes_id IS DISTINCT FROM period.current_lock_id THEN
    RAISE EXCEPTION 'Closing period and exact prior lock required' USING ERRCODE='23514';
  END IF;
  SELECT lock_number INTO prior_number FROM hcm.attendance_period_lock
    WHERE tenant_id=NEW.tenant_id AND period_id=NEW.period_id AND id=period.current_lock_id;
  IF NEW.lock_number<>coalesce(prior_number,0)+1 THEN
    RAISE EXCEPTION 'Sequential lock number required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER attendance_period_lock_guard BEFORE INSERT ON hcm.attendance_period_lock
  FOR EACH ROW EXECUTE FUNCTION hcm.guard_attendance_period_lock();

-- A lock cannot commit as orphan evidence: its period transition and pointer
-- must commit in the same transaction as the immutable basis.
CREATE FUNCTION hcm.require_attendance_lock_pointer() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM hcm.attendance_period WHERE tenant_id=NEW.tenant_id
    AND id=NEW.period_id AND state='Locked' AND current_lock_id=NEW.id) THEN
    RAISE EXCEPTION 'Lock must commit with its period' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END
$body$;
CREATE CONSTRAINT TRIGGER attendance_lock_commit AFTER INSERT ON hcm.attendance_period_lock
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hcm.require_attendance_lock_pointer();

DO $policies$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['attendance_period','attendance_period_lock'] LOOP
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',relation);
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',relation);
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',relation);
  END LOOP;
END
$policies$;
GRANT UPDATE(state,revision,current_lock_id,updated_at) ON hcm.attendance_period TO hcm_runtime;
