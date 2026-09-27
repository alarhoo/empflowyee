# Workforce changes foundation validation

Branch: `codex/hcm-2-employee-workforce-changes-foundation`, started from
`codex/hcm-2-employee-records`. It carries the foundation part of delivery step 14 of the
[HCM-2 implementation order](../roadmap/HCM-2-DESIGN-REVIEW.md#order); the Employment Changes app
follows on its own branch.

## Behavior and review

- **Migration `000029_employee_workforce_changes.sql`** (planned as `000025`; see the
  [delivery record](../roadmap/HCM-2-DELIVERY.md)) adds the employee-owned
  `workforce_change_request`, `workforce_change_approval` and `workforce_change_execution_step`
  tables from the [HCM-2 data model](../tdd/TDD-HCM-2-DATA-MODEL.md#mapping), with tenant RLS
  (ENABLE and FORCE) on each.
  - A request records the worker, the employment (none for a Rehire, which starts one), the
    assignment, the change type, the effective date, the expected revisions and typed target facts,
    including `target_position_id`. A null target keeps the current value; `cleared_fields` names
    the optional facts a request sets to none.
  - Business rule 17: one nonterminal request (Draft, PendingApproval, Approved, Executing or
    Failed) per employment and effective date, and per worker and date for a Rehire.
  - The approval policy is snapshotted at submission, never before; cancellation, completion and
    failure carry their timestamp, reason or safe failure code.
  - DEC-HCM2-002: one approver fills one slot, one slot per approver per request, and a deferred
    constraint trigger refuses the requester as approver.
  - Approvals and execution steps are append-only: the runtime has INSERT and SELECT only. No
    table grants DELETE.
- **Seed `workforce.foundation@4`** adds the worker event types of the change types that
  `workforce.foundation@3` did not cover: `LOCATION_CHANGED`, `MANAGER_CHANGED`, `HOURS_CHANGED`,
  `EMPLOYMENT_TYPE_CHANGED`, `SUSPENDED` and `RETURNED_TO_WORK`. Applied modules are immutable, so
  they arrive as a forward module.
- **`WorkforceFactsPort`** gains what execution needs, still as the sole writer of workforce facts:
  - assignments carry an optional position, checked to exist; capacity stays the calling
    command's decision through `PositionReadPort.capacityDecision` (DEC-HCM2-007);
  - employment facts change the employment type and continuous service start;
  - `establishAssignment` establishes an incomplete assignment from a date and closes the
    incomplete row with its successor, so it stays in history (REQ-EMPLOYMENT-CHANGES-004);
  - `endPrimaryReportingLine` closes the primary manager line the day before a date;
  - `setWorkerType` changes a worker's type, for example on rehire.
- **`WorkforceChangeContextPort`** reads a worker's current employments and open or incomplete
  assignments on a date, with revisions, placement, position and primary manager, so a request
  records expected revisions (Employment Changes TDD#READ). It also locks employments and
  assignments and resolves a manager's primary assignment.

## Verification

Recorded on 2026-09-27 against disposable PostgreSQL 17.

- `libs/hcm/api/workforce-foundation/module/src/lib/workforce-changes-foundation.database.spec.ts`:
  6 tests pass. They cover the change context (revisions, position, manager, and nothing for an
  unknown worker or another tenant); a position, employment type, worker type and ended manager
  line through the facts port, a new event type, and an unknown position refused; establishing an
  incomplete assignment with the row kept in history, and an established row refused; one open
  request per employment and date, cancellation releasing it, the Rehire subject rule, the policy
  snapshot and the cleared-field vocabulary; and independent, append-only approvals and steps
  with no DELETE.
- The workforce foundation, database, employee and job architecture suites pass: 131 tests,
  after updating two expectations the change legitimately moves (the worker event type count is
  now 15, and the approved object inventory lists the three tables).
- `pnpm hcm:db:seed:check`, lint for the changed projects and the `hcm-api` build pass.

## Reproduction

```bash
pnpm hcm:db:test libs/hcm/api/workforce-foundation libs/hcm/api/database libs/hcm/api/employee libs/hcm/api/job-architecture
pnpm hcm:db:seed:check
```
