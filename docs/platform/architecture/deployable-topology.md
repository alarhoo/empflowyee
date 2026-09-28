# Deployable Topology

## Decision

empFLOWyee uses four frontend identities and three APIs.

```text
empflowyee.com                   -> marketing-web
account.empflowyee.com           -> account-web -> account-api
*.empflowyee.com                 -> hcm-web     -> hcm-api
console.empflowyee.com           -> console-web -> console-api
```

The HCM wildcard is one deployment. `acme.empflowyee.com` and `globex.empflowyee.com` do not create separate HCM builds.

## Cloud direction

The target cloud is GCP. Deployment implementation is intentionally deferred until application/runtime requirements are established. The initial design assumes independent frontend/API deployables behind host-based routing.

## API ownership

- `account-api` owns commercial/customer account lifecycle.
- `hcm-api` owns workforce/HCM lifecycle.
- `console-api` owns platform operations and support metadata.
- Console does not receive unrestricted SQL access to HCM tenant data.

## Database direction

Initial production direction:

```text
Cloud SQL PostgreSQL instance per environment
├── account_db
├── hcm_db
└── console_db
```

HCM tenants share `hcm_db`; tenant-owned rows are scoped by `tenant_id`. Separate customer databases/schemas are not the default SaaS tenancy model.

## HCM background runtime

The [accepted HCM background-work ADR](../../hcm/adr/ADR-HCM-BACKGROUND-WORK.md)
authorizes one additional planned composition, `hcm-worker`, for Leave accrual
and expiry, Attendance calculations/reconciliation and Workflow timers/dispatch/
reconciliation. It shares `hcm_db` with explicit tenant RLS and has no public
HTTP routes. `hcm-api` does not host durable scheduling loops. Local finite-drain/
poll mode is the initial runtime target; future Cloud Run Job and Cloud Scheduler
provisioning require the normal infrastructure/IAM review. The seven existing
web/API deployables remain the current implemented topology.
