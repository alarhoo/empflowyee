# HCM worker operation

The accepted [background-work ADR](../adr/ADR-HCM-BACKGROUND-WORK.md) defines
`hcm-worker`, independently started from `hcm-api`. The thin Node root composes
Runtime's bounded scheduler and source-owned transactional handlers. There are no
durable scheduling loops in the API and no migrations during worker startup.

## Delivery status

The runtime root registers AttendanceResolve with the assigned-workday handler
`attendance.workday.resolve` (schema 1). It accepts source-owned durable intents
with employmentId, workDate and the accepted inputDigest, then publishes exact
immutable workdays or explicit unavailable outcomes. Its receipt, workload audit
and lease completion share the publication transaction. The same lane also runs
`attendance.holiday.preview` (schema 1), produced by the Holiday preview API. It
validates explicit employment/timezone context and completes Ready/Failed review
evidence; it never publishes a calendar. The lane also handles dated schedule and
shift publication previews. WorkflowPlan now registers `workflow.source.intake`
(schema 1) for Attendance's required-approval Override submissions. It reloads the
source manifest and current candidates, stores all required stages/tasks and timer
instants, and retains explicit stale/unavailable/no-candidate outcomes. Planning
does not decide the source or execute timers. Leave accrual/expiry, Attendance
calculation/reconciliation, Workflow dispatch/timers/reconciliation and recovery
commands are still being delivered; unregistered workloads fail startup.
See [worker validation](../testing/HCM-3-RESOLVE-WORKER-VALIDATION.md) and
[implementation status](../roadmap/HCM-3-IMPLEMENTATION-STATUS.md).

## Prerequisites

Use the repository Node/pnpm versions and PostgreSQL setup. Explicitly run
`pnpm hcm:db:up`, `pnpm hcm:db:migrate` and `pnpm hcm:db:seed` when preparing local
development. These commands are independent of ordinary API/worker startup.
The database must have the local target marker and the restricted `hcm_runtime`
role, with all canonical migrations applied. Never use the migrator connection
for worker execution. Existing developer data is preserved by forward migrations.

Build with `pnpm nx run hcm-worker:build`. The output is
`dist/apps/hcm/worker/main.js`. Execution requires `APP_ENVIRONMENT=local`,
`NODE_ENV=development`, `HCM_LOCAL_TENANTS=true`, and `HCM_DATABASE_URL` supplied
privately with the loopback runtime connection. Cloud markers and production mode
are rejected until the separate infrastructure/runtime activation is delivered.

## Operational configuration

`HCM_WORKER_WORKLOADS` is an explicit comma-separated allowlist. Exact approved
codes are LeaveAccrual, LeaveExpiry, AttendanceResolve, AttendanceCalculate,
AttendanceReconcile, WorkflowPlan, WorkflowDispatch, WorkflowReconcile and
NotificationDispatch. A selected code must also have an implemented handler in
the composition; an approved code alone is insufficient to enable processing.

| Setting                     | Default | Bounds / meaning                                          |
| --------------------------- | ------- | --------------------------------------------------------- |
| HCM_WORKER_MODE             | drain   | drain or poll; same artifact                              |
| HCM_WORKER_MAX_ITEMS        | 100     | 1–10000 claims per drain                                  |
| HCM_WORKER_MAX_TENANTS      | 100     | 1–10000 active tenants per drain                          |
| HCM_WORKER_ITEMS_PER_TENANT | 10      | 1–1000 claims per tenant, round-robin across lanes        |
| HCM_WORKER_MAX_MS           | 30000   | 100–1800000 ms; checked before each new claim             |
| HCM_WORKER_LEASE_MS         | 60000   | 1000–300000 ms; expired holders cannot publish            |
| HCM_WORKER_MAX_ATTEMPTS     | 5       | 1–100; exhaustion creates Exception                       |
| HCM_WORKER_RETRY_BASE_MS    | 1000    | 1–3600000 ms; exponential backoff with jitter             |
| HCM_WORKER_RETRY_MAX_MS     | 300000  | base–86400000 ms                                          |
| HCM_WORKER_POLL_MS          | 5000    | 100–60000 ms; abortable idle wait                         |
| HCM_WORKER_AFTER_TENANT     | empty   | resume from the previous finite result's nextTenantCursor |

For workday resolution set `HCM_WORKER_WORKLOADS=AttendanceResolve`. To additionally
plan admitted pending Override cases after migrations through 55, set
`HCM_WORKER_WORKLOADS=AttendanceResolve,WorkflowPlan`. This does not enable source
decisions, notifications or timer delivery. See the [Workflow integration record](../testing/HCM-3-WORKFLOW-INTEGRATION.md).
A schema-1
resolution intent is source-owned evidence; do not manually insert or modify its
payload in ordinary development. The Holiday preview API produces its own intent;
the Holiday assignment command produces exact workday intents for its explicit
resolution window when all dated inputs are Available. Other configuration
producers remain separate delivery slices. With no due intents,
finite drain exits normally with zero completed work.
Unavailable outcomes also count as completed jobs; inspect the domain receipt's
state/result code before treating a workday as published. The handler allows 366
historical schedule reads; exhaustion returns ResolutionBudgetExceeded, never an
assumed minimum-rest pass. Cloud activation and production SLOs remain pending.

These are operational bounds, not business policy or production SLOs. A drain
returns aggregate claim/completion/retry/unsettled/failure counters and a tenant
continuation. Preserve the continuation between finite invocations; poll mode
carries it automatically and wraps to the first page at the directory end.
Tenant-limit exhaustion reports Budget even when the directory pass ended.
Time limits are cooperative: a current transaction can finish beyond the claim
deadline and remains constrained by the SQL statement timeout and lease fence.

SIGINT/SIGTERM stop new claims, interrupt idle polling and close pools after the
current transaction settles. Abrupt termination leaves a recoverable lease;
the next worker can reclaim it after expiry. No operator should clear an outbox
or rewrite its immutable payload to recover a failed run. Disable claims and
forward-repair through the owning domain's governed recovery commands.

## Verification and activation

[Background validation](../testing/HCM-3-BACKGROUND-FOUNDATION-VALIDATION.md)
records actual SQL/fencing tests. Worker scheduler/configuration tests additionally
cover fair quotas, continuation, shutdown and bounded retries. Domain business
receipts, timer lag/queue-age metrics and source recovery acceptance are required
when each handler is delivered. Cloud Run Job/Scheduler/IAM, images and promotion
remain future reviewed infrastructure work; no cloud deployment is implied here.
