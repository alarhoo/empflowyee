# HCM-3 — Domain Integration Guardrails

## Existing authority to reuse

Claude must inspect the current repository before writing migrations. HCM-3 reuses and references, rather than recreates:

- Tenant/Organization/Location and HCM-2 workforce/employment/assignment/reporting data.
- HCM-1 Access Control permissions/scopes.
- HCM-1 Notifications for safe post-commit notifications.
- HCM-1 Documents for leave/attendance evidence files.
- HCM-1 Audit for security/business audit evidence.
- Current runtime/session/entitlement contracts.

## Leave <-> Attendance

Attendance owns schedules, holiday calendars, roster/override resolution, worked-time evidence and WorkEvidence. Leave consumes only the minimum versioned schedule/holiday inputs necessary to calculate a leave request and the explicit WorkEvidence contract for comp-off.

Leave never creates worked time. Attendance never creates leave units.

## Domain approvals <-> Workflow

Leave and Attendance own their approval cases/slots/decisions and must reauthorize every accepted action. Workflow owns the consolidated task/coordination mirror and durable dispatch/reconciliation evidence.

```text
Domain case/slot
   -> Workflow task/candidate/assignment
       -> signed/idempotent action intent
           -> Domain reauthorization + decision
               -> authenticated receipt
                   -> Workflow mirror update
```

A task being assigned to a user is not sufficient authority to approve.

## Payroll/compensation boundary

HCM-3 may publish bounded, versioned, non-monetary evidence. It does not calculate salary rates, taxable amounts, payroll payments or financial settlement.

- Leave encashment: units + references only; monetary valuation/payment remains deferred.
- Attendance/Overtime: exact/approved time evidence only; monetary valuation/payment remains deferred.

## Background processing/runtime topology

HCM-3 introduces concrete background workloads: leave accrual/expiry, attendance calculation/reconciliation, workflow timers/dispatch/reconciliation and possibly import processing.

During Step 1, Claude must create/confirm the runtime-topology ADR for these workloads. Do not silently embed durable schedulers or long-running workers in `hcm-api`. Choose the smallest reliable current architecture that works locally and can map to GCP later; create a new deployable/runtime only when the ADR justifies it.

## Database rules

- Evolve the current `hcm_db` / `hcm` namespace through forward SQL migrations.
- No duplicate Worker/Employment/Assignment/Reporting/Location/Document/Notification/Audit aggregates.
- Every tenant-owned table has direct tenant scope and tenant-safe FK patterns.
- Create RLS with the table and test denied cross-tenant access.
- Published/versioned objects and append-only evidence/ledger/decision rows are not updated in place.
- API DTOs remain independent from persistence rows.
- High-volume attendance-event paths need indexes/partitioning decisions in the TDD; do not add speculative partitioning without measured/query-driven design.
