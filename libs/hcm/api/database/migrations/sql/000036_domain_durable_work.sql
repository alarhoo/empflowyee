-- Ownership: each named business domain. Runtime shares mechanics only; it does
-- not own a global business queue. Intent is inserted atomically by its producer.
DO $tables$
DECLARE owner_name text;
DECLARE workloads text;
BEGIN
  FOREACH owner_name IN ARRAY ARRAY['leave','attendance','workflow','notification'] LOOP
    workloads := CASE owner_name
      WHEN 'leave' THEN '''LeaveAccrual'',''LeaveExpiry'''
      WHEN 'attendance' THEN '''AttendanceResolve'',''AttendanceCalculate'',''AttendanceReconcile'''
      WHEN 'workflow' THEN '''WorkflowPlan'',''WorkflowDispatch'',''WorkflowReconcile'''
      ELSE '''NotificationDispatch''' END;
    EXECUTE format('CREATE TABLE hcm.%I (
      tenant_id text NOT NULL REFERENCES hcm.tenant(id),
      id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
      workload text NOT NULL CHECK (workload IN (%s)),
      kind text NOT NULL CHECK (kind ~ ''^[a-z][a-z0-9.-]{0,99}$''),
      schema_version integer NOT NULL CHECK (schema_version > 0),
      business_key text NOT NULL CHECK (length(business_key) BETWEEN 1 AND 200),
      payload jsonb NOT NULL CHECK (jsonb_typeof(payload)=''object'' AND octet_length(payload::text)<=65536),
      digest text NOT NULL CHECK (digest ~ ''^[a-f0-9]{64}$''),
      state text NOT NULL DEFAULT ''Pending'' CHECK (state IN (''Pending'',''Leased'',''Completed'',''Exception'')),
      available_at timestamptz NOT NULL DEFAULT now(),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
      fence bigint NOT NULL DEFAULT 0 CHECK (fence BETWEEN 0 AND 9007199254740991),
      lease_owner uuid,
      lease_until timestamptz,
      completed_at timestamptz,
      last_error_code text CHECK (last_error_code ~ ''^[a-z0-9][a-z0-9.-]{0,79}$''),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id,id),
      UNIQUE (tenant_id,workload,kind,business_key),
      CHECK ((state=''Leased'' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL)
        OR (state<>''Leased'' AND lease_owner IS NULL AND lease_until IS NULL)),
      CHECK ((state=''Completed'') = (completed_at IS NOT NULL))
    )', owner_name || '_outbox', workloads);
    EXECUTE format('CREATE INDEX %I ON hcm.%I(tenant_id,workload,state,available_at,id)', owner_name || '_outbox_due',owner_name || '_outbox');
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',owner_name || '_outbox');
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',owner_name || '_outbox');
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',owner_name || '_outbox');
    EXECUTE format('GRANT SELECT,INSERT ON hcm.%I TO hcm_runtime',owner_name || '_outbox');
    -- Runtime cannot rewrite intent, business identity or delete evidence during recovery.
    EXECUTE format('GRANT UPDATE(state,available_at,attempts,fence,lease_owner,lease_until,completed_at,last_error_code,updated_at) ON hcm.%I TO hcm_runtime',owner_name || '_outbox');

    EXECUTE format('CREATE TABLE hcm.%I (
      tenant_id text NOT NULL REFERENCES hcm.tenant(id),
      workload text NOT NULL CHECK (workload IN (%s)),
      rule_key text NOT NULL CHECK (length(rule_key) BETWEEN 1 AND 200),
      last_planned_date date NOT NULL,
      revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
      PRIMARY KEY (tenant_id,workload,rule_key)
    )', owner_name || '_planner_cursor', workloads);
    EXECUTE format('ALTER TABLE hcm.%I ENABLE ROW LEVEL SECURITY',owner_name || '_planner_cursor');
    EXECUTE format('ALTER TABLE hcm.%I FORCE ROW LEVEL SECURITY',owner_name || '_planner_cursor');
    EXECUTE format('CREATE POLICY tenant_scope ON hcm.%I TO hcm_runtime,hcm_migrator USING (tenant_id=hcm.current_tenant_id()) WITH CHECK (tenant_id=hcm.current_tenant_id())',owner_name || '_planner_cursor');
    EXECUTE format('GRANT SELECT,INSERT,UPDATE(last_planned_date,revision) ON hcm.%I TO hcm_runtime',owner_name || '_planner_cursor');
  END LOOP;
END
$tables$;
