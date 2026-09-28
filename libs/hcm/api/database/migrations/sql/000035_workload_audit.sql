-- Ownership: audit. The approved worker ADR permits workload attribution without
-- a fabricated person/account. Existing human events retain their original shape.
ALTER TABLE hcm.audit_event
  ALTER COLUMN actor_account_id DROP NOT NULL,
  ADD COLUMN actor_kind text NOT NULL DEFAULT 'Human' CHECK (actor_kind IN ('Human','Workload')),
  ADD COLUMN workload_code text,
  ADD COLUMN workload_run_id uuid,
  ADD CONSTRAINT audit_event_actor_shape CHECK (
    (actor_kind='Human' AND actor_account_id IS NOT NULL AND workload_code IS NULL AND workload_run_id IS NULL)
    OR (actor_kind='Workload' AND actor_account_id IS NULL AND workload_run_id IS NOT NULL AND workload_code IS NOT NULL
      AND workload_code IN ('LeaveAccrual','LeaveExpiry','AttendanceResolve','AttendanceCalculate',
        'AttendanceReconcile','WorkflowPlan','WorkflowDispatch','WorkflowReconcile','NotificationDispatch')));
CREATE INDEX audit_event_workload_run ON hcm.audit_event(tenant_id,workload_run_id,occurred_at,id)
  WHERE actor_kind='Workload';
-- Existing tenant RLS and INSERT-only runtime grants continue unchanged.
