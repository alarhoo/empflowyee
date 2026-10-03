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

## Durable action authority review

Codex reviewed the implementation against TDD-HCM-3-COMMON WORKLOAD on
2026-10-03. Runtime captures tenant, actor and expiry from its private verified
context into immutable `runtime_action_authorization` rows (migration 56).
The internal reference binds permission, source scope digest and canonical intent
digest. Replaying an intent preserves its original expiry. It is neither a browser
token nor a new authentication trust boundary.

Only verified WorkflowDispatch execution can restore a non-serializable action
capability. Sources must independently derive the exact scope binding, call
Access Control's current whole-grant evaluator, and recheck the action capability
before committing a new decision. Current online and dispatched operations share
that evaluator without constructing a synthetic authenticated human session.
Previously committed result queries remain a separate source-receipt operation;
restoring an expired capability is not permitted for a new decision.

The focused disposable PostgreSQL run passed 3 suites / 19 tests (action authority,
grant scope and workload context). It exercises forged and copied contexts,
mutable public session claims, exact binding, wrong workload, tenant isolation,
missing actor FK, immutable expiry, producer rollback, current permission and
entitlement revocation, account disablement, and expiry-before-commit rollback.
Affected lint, TypeScript (`--allowImportingTsExtensions` for existing seed imports)
and architecture checks pass. This adds no UI or source decision endpoint.
Migration 56 is verified on disposable SQL; the persistent local database remains
at 55 until the next explicit backed-up migration operation.

## Action admission and dispatch protocol

Migration 57 adds immutable action identity, encrypted reason, original retry key,
Runtime authority reference, source/task/slot revisions and receipt-backed task
transitions. Admission rechecks the source's online authorization and current
candidate port. Concurrent identical browser retries recover one operation;
changed input cannot reuse the key. An intent is ActionPending, not a decision.

The fixed dispatch adapter verifies the stored canonical intent, queries the
original source receipt first, and only then asks the source to decide under its
original Runtime authority reference. Only a matching Accepted source receipt
can complete a task. Decision reason never appears in outbox payloads or safe
audit. Attempt recovery uses fresh source read authority, including after completion.
A reconciliation intent is queued after each source outcome; its handler and real
Attendance decision adapter are still required before enabling this lane locally.

The focused planner/action PostgreSQL run passed 2 suites / 13 tests. The explicit
test source proves adapter protocol behavior, concurrent admission, encrypted
storage, immutable expiry, rejected manufactured completion, original-key receipt
recovery after a lost acknowledgement, and one source decision across retry. This
is not Attendance decision or UI acceptance. SQL remains at migration 55 in the
persistent local environment; 56 and 57 have only been applied to disposable tests.

## Source-driven stage reconciliation

Migration 58 and the WorkflowReconcile handler retain current source graph
identity, accepted receipt proofs, stage progress, candidate refresh, exception
state and immutable reconciliation outcomes. An accepted first stage activates
only the next required stage and its elapsed-time timers. Accepted rejection
cancels later requirements; source Rejected is never represented as source Approved.
Terminal reconciliation cancels remaining pending timers. A projection claiming
approval without its matching accepted decision proof becomes SourceProofMissing.
Missing or changed sources disable new task actions while retaining in-flight intent
identity for receipt recovery. No reconciliation code calls the decision port.

The focused real PostgreSQL planner/action/reconciliation run passed 2 suites /
16 tests. Affected lint, TypeScript and architecture checks passed. Source adapter
fixtures in this suite prove coordination only; the Attendance/Leave business
adapters, notification timer delivery and full UI journeys remain outstanding.
Migrations 56–58 are not yet applied to the persistent local database at 55.


## Attendance source dispatch integration

On 2026-10-03 the real Attendance Override source adapter was integrated with
Workflow action admission, dispatch and reconciliation. Source routes resolve
Workflow task identity through the owner port; they do not query Workflow tables.
The dispatch lane restores the original Runtime authority, checks source receipts
before attempting a decision, and uses current Access and dated source rules.
Source effects, immutable source proof, Workflow receipt and reconciliation intent
commit together. Stage reconciliation follows actual accepted source decisions.
The worker now composes these lanes using the API's existing field encryption key;
see the [worker runbook](../operations/WORKER.md). Notification timers and Leave
source decisions remain pending. No broader Workflow or Attendance approval UI is
introduced by this dependency.

The focused real PostgreSQL run passed 33 tests across Attendance work configuration,
Runtime action authority and Leave requests, including actual two-stage source
approval, rejection, revocation, stale-source invalidation, concurrent admission,
receipt recovery, final-decision rollback and dated workday publication. API and
worker builds and affected type/lint checks passed. This is source integration
evidence, not browser or complete-app acceptance.
