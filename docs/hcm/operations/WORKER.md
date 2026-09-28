# HCM worker operation

The accepted [background-work ADR](../adr/ADR-HCM-BACKGROUND-WORK.md) defines
`hcm-worker`, independently started from `hcm-api`. The thin Node root composes
Runtime's bounded scheduler and source-owned transactional handlers. There are no
durable scheduling loops in the API and no migrations during worker startup.

## Delivery status

The runtime root and mechanics build locally. Domain handlers are being delivered;
the current root has no registered business handlers and deliberately exits with
an unavailable diagnostic if execution is requested. Do not treat this as a
completed Leave accrual, Attendance calculation or Workflow processing service.
See [implementation status](../roadmap/HCM-3-IMPLEMENTATION-STATUS.md).

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
