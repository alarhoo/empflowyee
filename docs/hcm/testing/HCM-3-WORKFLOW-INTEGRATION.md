# HCM-3 internal Workflow integration

This record describes the internal coordination dependency needed by Work Schedules
and the requested Leave journey. It does not admit any additional Workflow UI app.

## DomainManifest planning review

Codex reviewed the technical integration on 2026-10-03 under the existing
[delegation](../roadmap/HCM-3-DESIGN-APPROVAL.md). The owning
[Workflow design](../domains/workflow/TECHNICAL-DESIGN.md) supplies the registry,
safe facts, graph/candidate bounds, all-required/any-reject semantics and elapsed
timer defaults. The [logical model](../domains/workflow/DATA-MODEL.md) explicitly
permits DomainManifest instances without a WorkflowDefinition version. No implicit
definition, new business rule, human approval or app acceptance is claimed.

Official Nx generators materialized only the universal contract, application ports
and infrastructure needed for this dependency. Source identity and a canonical
closed-manifest digest enter the existing durable Workflow outbox inside the source
transaction. The planner runs through Runtime's verified workload, immutable intent
reload and lease-fenced completion transaction. Its source adapter must return
fresh tenant-owned case and candidate projections; stored candidates never confer
decision authority.

Migration 54 adds tenant-owned instance, stage, task, candidate, timer, restricted
exception and immutable planning receipt storage, with forced RLS and composite
tenant foreign keys. Source case/slot references are opaque contract identities,
not authorization scope targets. The planner creates every required slot, activates
only the first stage and retains the approved 48-hour due, three reminders and
72-hour escalation instants. No candidate produces a restricted NoCandidates
exception; it does not select an administrator. Stale, unavailable, closed or
already-decided source intake cannot manufacture completed tasks. Existing source
decisions and changed generations require receipt reconciliation.

## Verification

On 2026-10-03, the focused manifest suite passed six tests and the disposable
PostgreSQL intake/planner suite passed five tests. The latter uses the real runtime
role and leased worker, with an explicitly test-owned source adapter. It proves
transaction rollback, deterministic duplicate recovery, changed-key rejection,
later-stage blocking, persisted timer identities, no-candidate handling, stale and
closed-source refusal, negative tenant reads and denied direct task completion.
It does not prove production Attendance candidate selection or end-user approval.

Reproduce from the repository root with Docker available:

```sh
pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts libs/hcm/contracts/workflow/src/lib/approval-manifest.spec.ts
pnpm hcm:db:test libs/hcm/api/workflow/infrastructure/src/lib/intake.database.spec.ts
```

## Remaining delivery

Action authority/dispatch, immutable source receipt reconciliation, timer execution
and notifications remain required. This initial planner schema does not grant
runtime transition or delete privileges. The worker root now registers WorkflowPlan
for Attendance source intake, and required-approval Override submit produces real
intake atomically with its case. Local PostgreSQL was explicitly migrated through
55 after a verified backup on 2026-10-03; the rebuilt API and worker are running.
Work Schedules remains incomplete and no requested milestone is complete.

## Attendance source and candidate review

Codex reviewed the source-owner integration on 2026-10-03 under the same delegation.
Attendance now implements the source projection for stored Override cases and exact
published policy rules. It locks the source case while reading its required slots,
retains source revisions and returns only registry-approved safe fields. The SQL
rule's global ordinal is converted to a contiguous per-stage Workflow ordinal;
source slot and policy-rule identity are preserved. Foreign and changed pending
sources remain unavailable.

Two narrow owner ports reuse the existing Access and Workforce libraries. Workforce
returns the selected employment's beneficiary and unique primary reporting chain
at the current civil date in the override's explicit timezone. It follows the
existing active-chart employment statuses and primary reporting semantics, never
selects another employment, and terminates missing or cyclic chains without a
hierarchy fallback. Access resolves linked beneficiary accounts and discovers
enabled accounts with current entitlement, business operation and one complete
grant across every source-resolved scope member. It does not issue a human session.
Attendance applies its policy selector, maker/requester/beneficiary independence
and prior distinct-actor exclusions. The approved logical function
ATTENDANCE_APPROVAL_ACT maps to the exact Attendance decision permission; unknown
function codes return no candidates.

The Access/Workforce PostgreSQL suites passed 17 tests. The Attendance configuration
suite passed 13 tests, including stored source cases composed with the real owner
ports and leased Workflow planner. That scenario verifies missing decision grants,
account revocation, tenant isolation, safe projection, exact slots and a ready first
task with a blocked second stage. Source-case insertion and temporary decision
grants are explicit test fixtures; production submission and browser acceptance are
were still pending at that checkpoint. Required-approval submission is subsequently
covered by the [submission review](HCM-3-WORK-SCHEDULES-INTEGRATION.md#override-submission-technical-review).
No applied migration or canonical seed was rewritten. Forward migration 55 aligns
Workflow identities with the approved opaque text mapping while retaining rows,
unique keys and tenant-composite foreign keys.

```sh
pnpm hcm:db:test libs/hcm/api/access-control/infrastructure/src/lib/grant-scope.database.spec.ts libs/hcm/api/workforce-foundation/module/src/lib/workforce-time-context.database.spec.ts
pnpm hcm:db:test libs/hcm/api/attendance/module/src/lib/work-configurations.database.spec.ts
```

## Local runtime verification

On 2026-10-03 a new custom-format backup of the persistent local database was
created and its restore inventory checked before explicitly running `pnpm hcm:db:up`.
The backup contained 1,238,337 bytes; prior backups and the existing field-encryption
key were retained. Six forward migrations applied, leaving 55 total and no changed
seed version. The rebuilt API reports readiness HTTP 200 on port 4402, the tenant
web root responds HTTP 200 on port 4302, and the restarted worker polls the explicit
AttendanceResolve/WorkflowPlan allowlist with no tenant failures. These checks do
not constitute Work Schedules browser acceptance.

The latest combined Attendance/Workflow PostgreSQL run passed 19 tests, including
HTTP-created source case intake executed by the leased planner. The Work Schedules
readiness gate passes. Broader admitted-app readiness is 59/61; My Profile and Org
Chart retain unrelated stale FDD/TDD/traceability approval hashes. Those ledgers
were not changed to clear the broader gate.

The fresh production-web regression on 2026-10-03 passed 7 suites / 62 tests,
including the existing Work Schedule Templates and Holiday Calendars browser
journeys (`tools/milestones/hcm-3/browser.config.mts`). This is regression
evidence for those apps, not Work Schedules browser acceptance.
