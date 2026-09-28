# HCM-3 foundation design review

Status: approved reconciliation record, 2026-09-28. The owning
[common TDD](../architecture/TDD-HCM-3-COMMON.md) and
[SQL/integration TDD](../architecture/TDD-HCM-3-DATA-MODEL.md) finalize the implementation
design under [delegated approval](HCM-3-DESIGN-APPROVAL.md). No implementation exists.

## RECONCILIATION

| Existing authority inspected                                                                                                                                                                                               | Reuse and required delta                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `libs/hcm/api/database/migrations/sql/000004_workforce_identity_spine.sql`, `000018_workforce_structure.sql`, `000019_workforce_people.sql`, `000020_workforce_employment.sql`, `000027_workforce_assignment_position.sql` | Reuse `organisation_profile`, `legal_entity`, `organisation`/`organisation_version`, `department`, `location`, `person`, `worker`, `employment`, `assignment`, `reporting_line`. Organization configuration is tenant-level; OrgUnit maps to `organisation`, not a new organization aggregate. `assignment.organisation_id` is the unit; `employment.legal_entity_id` is the legal employer.                                     |
| `libs/hcm/api/workforce-foundation/application/src/lib/workforce-ports.ts`                                                                                                                                                 | `WorkforcePortBinder`, `WorkforceReadPort.currentAssignments`, `primaryManager`, `directReports`, and established-record rules already exist. Add a minimal employment/time-context read projection with hire/service dates, worker type, assignment revision, location zone and workforce digest. Current `AssignmentFact` lacks several of these inputs. Do not import Employee's repositories or create another worker table. |
| `libs/hcm/api/access-control/infrastructure/src/lib/hcm-api-access-control-infrastructure.ts`                                                                                                                              | Reuse `HcmAccessDatabase`, transaction authorization, current grants/entitlements, protected-admin invariant and audit. Current `account_role` grants do not carry HCM-3's configurable scoped grant/delegation model. Add scope evaluation under Access Control ownership, not Workflow candidate rows.                                                                                                                         |
| `libs/hcm/api/runtime/application/src/lib/hcm-api-runtime-application.ts`                                                                                                                                                  | Verified interactive context is a private WeakMap with tenant/account/expiry. The existing authenticated session is sufficient for current human actions. The accepted [runtime ADR](../adr/ADR-HCM-BACKGROUND-WORK.md) and common TDD define the planned internal workload context; no step-up infrastructure is required.                                                                                                      |
| `libs/hcm/api/documents/application/src/lib/import-source-storage.ts`, migrations `000015`, `000016`, `000030`                                                                                                             | `DocumentStoragePort` currently supports Employee Import/HR service attachments. Extend a purpose-bound evidence port and blob consumer types for Leave/Attendance. Reuse blobs and storage; do not blindly pass a logical `DocumentId` into a worker-document row. Add classification, clean/blocked outcome and authorized open/disposition contracts.                                                                         |
| `libs/hcm/api/notifications/application/src/lib/document-notifications.ts`, migrations `000010`–`000012`                                                                                                                   | Existing producer is document-specific and records outcomes transactionally. Extend Notifications' allowed event/recipient contracts for the three new domains and consume their durable outbox post-commit. Keep inbox/preference/template/intent ownership. There is no existing generic event broker to claim reused.                                                                                                         |
| `libs/hcm/api/audit/infrastructure`, `libs/hcm/api/runtime/application/src/lib/command-receipts.ts`                                                                                                                        | Reuse `TransactionalAudit`/`AppendAudit`, `CommandReceiptStore`, `runIdempotent`, UUID command keys. Add domain receipt tables following the existing adapter pattern; receipt responses must remain safe after current authorization is checked.                                                                                                                                                                                |
| `libs/hcm/api/runtime/application/src/lib/field-cipher.ts`, migration `000025`                                                                                                                                             | Reuse `FieldCipher` bound to tenant/table/column/row, ciphertext plus key version. Current tenant-level keys do not establish per-record crypto-erasure. Do not promise deletion of one record by deleting a shared tenant key. Production retention/crypto-erasure remains a separate design.                                                                                                                                   |
| Repository migrations and live local inspection                                                                                                                                                                            | Repository contains `000001` through `000033_employee_hr_service.sql`. Read-only local inspection found 23 applied, latest `000023_employee_self_service.sql`; employment/assignment/reporting/document_blob/audit have ENABLE/FORCE RLS. Local prerequisites are behind repository delivery; explicitly migrate/seed in a later authorized implementation setup, never during API startup.                                      |

The live inspection used metadata only (`hcm.schema_migrations`, `pg_tables`,
`pg_class`), not employee records. It proves the inspected local state, not cloud
state or HCM-2 application acceptance. HCM-2's existing delivery/validation records
remain the evidence for its implemented slices.

## CONFLICTS — resolved explicitly

Logical integer/PublicId identity maps to existing opaque tenant-scoped text IDs
as specified in the physical TDD. Encashment remains disabled units-only
configuration/contracts; LOP uses Unpaid tracking without accounts/reservations.
Existing session plus explicit authority replaces proposed step-up. Source slots
constrain Workflow; All/Any/MinimumCount cannot weaken them. One shared worker is
accepted under DEC-HCM3-021 and the amended topology/taxonomy. Dangling historical
state-model references are replaced with current technical/test references.

## DATA — Reviewed physical mapping

All new business tables use direct `tenant_id`, composite primary/reference keys,
`revision` for mutable aggregates, inclusive API dates and half-open SQL ranges.
Business codes are unique within their declared tenant/owner, never global by
accident. UUID-generated opaque text IDs meet the current 1–200 ID constraint;
existing IDs are not recast to UUID. Timestamps are `timestamptz`; date/time/zone
and actual offset are retained where schedule resolution requires them.

Use `numeric(18,6)` for leave units and decimal-string DTOs; the owning policy
defines rounding/increments before publish. Intermediate calculations retain
exact rational/minute inputs. Reject overflow/unsupported precision. Minute
quantities use checked integers; exact elapsed seconds can be retained to avoid
an implicit rounding rule. Never use JavaScript floating arithmetic for ledger
postings. Currency and payroll rates do not belong in these domains.

| Owner / migration slice       | Tables and read models to add                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attendance configuration      | `work_schedule`, `work_schedule_version`, `work_schedule_day`, `work_schedule_segment`, `shift`, `shift_version`, `shift_segment`, `holiday_calendar`, `holiday_calendar_version`, `holiday`, `attendance_policy`, `attendance_policy_version`, `attendance_approval_rule`, `schedule_assignment`, `attendance_policy_assignment`, `holiday_calendar_assignment`, `time_configuration_impact_preview`. Templates reuse `work_schedule.is_template`; they cannot be assigned as live schedules. |
| Attendance resolution         | `schedule_override`, `shift_roster`, `shift_roster_entry`, `published_workday`, `published_work_segment`. Retain immutable revision payload and mutable selection/lifecycle metadata separately where necessary.                                                                                                                                                                                                                                                                               |
| Leave policy and accounts     | `leave_type`, `leave_policy`, `leave_policy_version`, typed eligibility/assignment/accrual/carry-forward/restriction/approval/comp-off/encashment rules, `leave_policy_impact_preview`, `leave_period`, `worker_leave_enrollment`, `leave_entitlement_grant`, `leave_balance_account`, `leave_balance_transaction`, `leave_balance_reservation`, `leave_balance_allocation`, `leave_accrual_run`, `leave_accrual_run_item`.                                                                    |
| Leave requests/decisions      | `leave_request`, `leave_request_day`, `leave_request_attachment`, `leave_request_comment`, `leave_cancellation_request`, `leave_approval_case`, **`leave_approval_slot`**, `leave_decision`, `leave_balance_adjustment_request`. Explicit slot rows preserve source authority; they are missing from the logical catalogue and must be added in the approved physical TDD.                                                                                                                     |
| Attendance evidence/decisions | `attendance_capture_source`, `attendance_event`, `attendance_calculation_run`/`item`, `attendance_day`, `attendance_session`, `attendance_anomaly`, `attendance_correction_request`/`item`, `attendance_adjustment_request`, `attendance_approval_case`, **`attendance_approval_slot`**, `attendance_decision`, `attendance_period`/`lock`, `work_evidence`. Import batch/row tables only if that channel is admitted by DEC-HCM3-005.                                                         |
| Leave evidence consumers      | `comp_off_earning`, `comp_off_credit_request`; encashment request/handoff tables only in the admitted bounded capability, not automatic payment plumbing. Unique consumed Attendance evidence, linked reversal/replacement, exception after already-used credit.                                                                                                                                                                                                                               |
| Workflow                      | Product-owned read-only subject/action/fact registry (explicitly global; no tenant business content), tenant definition/version/stage/task/condition/routing/escalation/preview; instance/fact/stage/task/candidate/assignment/action-attempt/dispatch/receipt/timer/task-event/reconciliation-exception. Add domain receipt/outbox tables. No copies of requests, ledgers or raw attendance evidence.                                                                                         |
| Existing foundation owners    | Access Control scoped-grant extension if approved; Runtime workload authorization; Audit actor-kind extension; Documents evidence-purpose extension; Notifications event/recipient additions. These remain in their owners, not new HCM-3 copies.                                                                                                                                                                                                                                              |

RLS is ENABLE/FORCE with `hcm.current_tenant_id()` on every tenant-owned table,
using the existing runtime posture. Every foreign key contains tenant scope;
actor, employment, assignment, blob, parent and version references cannot cross
tenants. Scope-target assignment checks require exactly one selected target and
valid discriminator. Case checks require exactly one subject matching type.
Define typed JSON schemas for any retained snapshot; arbitrary condition scripts
are forbidden. SQL constraints defend nonnegative quantities, ordered segments,
valid date ranges and exactly-once ownership.

Indexes: tenant/owner/effective-range GiST exclusion for published versions and
same-precedence assignments; tenant/employment/work-date/revision B-tree for
workdays/days; tenant/source/event-key uniqueness and tenant/employment/occurred-at
for events; tenant/account/sequence and business-key uniqueness for ledger;
tenant/case/stage/slot uniqueness for decisions; partial unique tenant/task active
assignment and source-case open generation; tenant/status/due-at/id for due work;
tenant/recipient/status/date/id for inbox projections. Row-count/query-plan tests
decide later event partitioning; no speculative partitioning now.

Published content and child rows require database immutability enforcement,
not only UI read-only state. Give runtime SELECT/INSERT only on ledger/evidence
rows; narrowly allow lifecycle/lease columns. Mutable draft/published tables
need guarded transitions/triggers preventing edits to published payload.
Serialize account reservation/posting on the account row, source decisions on
case/subject, roster publication on its scope/range, and period locks against
event/calculation publication. Retain existing tenant administration locking
initially; optimize only with measured contention and equivalent revocation tests.

## CONTRACTS — Reviewed shared interfaces

All HTTP prefixes are `/api/v1/{leave|attendance|workflow}`. Transport rejects
unknown properties; tenant/actor/workload identity never comes from the body.
Self queries accept an `employmentId` only as a selector among server-verified
own employments. GET collections are cursor-paged (default 25, maximum 100),
with allow-listed sort fields and a stable ID tie-break. Cursors bind actor,
scope/filter and sort. Sensitive values are excluded from cursors and errors.

| Contract / owner                                             | Minimum fields and behavior                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkforceTimeContext` / workforce-foundation                | employmentId, workerId, effective assignment IDs/revisions, legalEntityId, orgUnitId, departmentId, locationId/timezone, employment/service dates, worker type, inputDigest. Missing/incomplete facts return explicit unavailable; no fabricated schedule.                                                                                                                                                                                                            |
| `PublishedWorkdayDto` / attendance                           | employmentId, workDate, timezone, revisionId, source version IDs, work/rest/holiday classification, work/break/holiday segments with instants/offsets, planned minutes, resolutionDigest. Query bounded date range; unavailable/conflict is distinct from legitimately unscheduled. Leave consumes it through an owner port.                                                                                                                                          |
| `LeaveCalculationPreviewDto` / leave                         | enrollmentId, policy/period revisions, day rows with portions/minutes/decimal units, exact summed total, workday version refs, warnings, digest and expiry. Submit rechecks all references and atomically reserves. Missing schedule is not permission to use fallback.                                                                                                                                                                                               |
| `ApprovedAbsenceProjection` / leave                          | employmentId, local interval, reconciliation category, source version and reversal reference. Attendance subtracts expectations; never invents worked time. No private leave category/reason.                                                                                                                                                                                                                                                                         |
| `WorkEvidenceDto` / attendance                               | evidenceId, schemaVersion, purpose CompOff, employmentId, workDate, timezone, calculation ID/revision/digest, exact and approved qualifying minutes, qualification condition, optional lockId, reversal/replacement references, business key. Leave returns a durable acknowledgement/reference or conflict. No units enter the Attendance payload. DEC-HCM3-010 approves the qualification/status boundary; the physical TDD specifies exact-time rational encoding. |
| `DomainApprovalManifest` / source domain                     | case/subject IDs, case and subject revisions, generation, stage/slot requirements, distinctness constraints, safe facts, allowed actions and registered route code. Workflow accepts only a compatible registry version and cannot relax source obligations.                                                                                                                                                                                                          |
| `DomainActionIntent` / workflow transport, source validation | intent/key, tenant-bound origin, audience/schema, actor, source case/stage/slot, expected task/source/subject revisions, action, encrypted reason reference, authority reference, server-recorded session validity, issued/expiry instants, canonical digest and trusted in-process adapter provenance. Source verifies origin, session validity and current authority; dispatch never grants permission.                                                             |
| `DomainActionReceipt` / source domain                        | command key/digest, source event ID, outcome Accepted/Denied/Stale/Conflict/CaseClosed/RetryableFailure, resulting source revision/state and authenticated digest. Query-by-key recovers unknown delivery; unique matching accepted receipt completes a mirror task.                                                                                                                                                                                                  |
| `EncashmentUnitHandoff` / leave                              | request/enrollment/policy references, approved units/unit, version and business key only. Disabled until consumer admission; future callbacks bind consumer/digest/reference. No amount, rate, bank, tax or locally fabricated payment result.                                                                                                                                                                                                                        |

Use the current runtime error envelope with additive approved error codes for
stale-preview, schedule conflict, insufficient balance, locked period and unknown
delivery. The source domain owns safe errors; raw database/domain rows are never
serialized. Existing `P12/P13/P14` logical codes are not evidence of installed DTOs.
Creates return 201; synchronous commands 200; durable asynchronous commands 202
with an operation ID and status URL. 400 validation, 401 expired identity, 403
missing operation authority, 404 hidden target, 409 stale/business conflict,
413/415 evidence bounds/type, 503 unavailable dependency. No success on timeout.

## OWNERSHIP — Nx and NestJS

For each `d` in leave, attendance, workflow:

| Project                      | Root                              | Tags                                                      |
| ---------------------------- | --------------------------------- | --------------------------------------------------------- |
| `hcm-{d}-contract`           | `libs/hcm/contracts/{d}`          | product:hcm, runtime:universal, domain:{d}, type:contract |
| `hcm-api-{d}-domain`         | `libs/hcm/api/{d}/domain`         | product:hcm, runtime:api, domain:{d}, type:domain         |
| `hcm-api-{d}-application`    | `libs/hcm/api/{d}/application`    | product:hcm, runtime:api, domain:{d}, type:application    |
| `hcm-api-{d}-infrastructure` | `libs/hcm/api/{d}/infrastructure` | product:hcm, runtime:api, domain:{d}, type:infrastructure |
| `hcm-api-{d}-transport`      | `libs/hcm/api/{d}/transport`      | product:hcm, runtime:api, domain:{d}, type:transport      |
| `hcm-api-{d}-module`         | `libs/hcm/api/{d}/module`         | product:hcm, runtime:api, domain:{d}, type:module         |
| `hcm-web-{d}-data-access`    | `libs/hcm/web/{d}/data-access`    | product:hcm, runtime:web, domain:{d}, type:data-access    |
| `hcm-web-{d}-feature-{slug}` | canonical catalogue featurePath   | product:hcm, runtime:web, domain:{d}, type:feature        |

These are future declarations, not generated projects. Kysely rows, queries and
mapping belong in domain infrastructure; physical SQL remains in the ordered
database migrations library. Nest controllers validate/map DTOs; application
use cases depend on ports; modules/root wire them. Cross-domain owner application
ports and universal contracts avoid reciprocal implementation dependencies.
Workflow adapters dispatch to Leave/Attendance ports, never source repositories.
Leave does not import Attendance infrastructure. Features import their own data
access/contracts and approved UX; browser code never imports API projects.

## UX — Installed capability evidence

Inspected local package manifests and type declarations on 2026-09-28:
Fundamental Core/Platform/UI5 wrappers `0.64.3`; UI5 `2.26.0`. FCL is NATIVE;
the maintained HCM Dynamic Page and tabbed Object Page are COMPOSED wrappers.
Imports: `FlexibleColumnLayout` from `@fundamental-ngx/ui5-webcomponents-fiori/flexible-column-layout`,
`HcmDynamicPage` and `HcmObjectPage` from the existing HCM UX libraries.

`@fundamental-ngx/ui5-webcomponents/calendar` exposes `Calendar` with
Single/Multiple/Range selection, `ui5SelectionChange`, selected/disabled/special
date slots and calendar legend. Core's `calendar` declarations also provide
date selection and keyboard date views. Platform's `table` exposes maintained
columns, data-source, sorting and selection. Inspection supports a date selector
plus server-backed agenda/table, not a claim that a resource scheduler exists.
No custom grid is justified by this review. A future requirement for resource
lanes or drag scheduling needs a specific capability assessment and UX approval.

Calendar apps use a Dynamic Page with native Calendar/DatePicker and a
date-range agenda. Shift Planning uses FCL roster list/detail and a dedicated
entry editor using native table/Select/DatePicker. Native FCL columns have headers;
detail Close and Maximize/Minimize use native title navigation. Server lists use
whole-row/keyboard navigation and HcmViewSettings for sorting; no local sorting
of partial server pages. Focused dialogs confirm decision/reason or one action.
The app TDDs finalize these compositions; runtime acceptance remains mandatory during implementation.

<a id="order"></a>

## ORDER — Dependency and migration sequence

Assign numeric migration filenames at implementation, after the then-current
maximum; `000034` is the present next candidate, not a reserved promise.

1. Implement accepted runtime/trust ADR and approved shared scope/session/evidence contracts.
2. Extend Access Control/Runtime/Audit, Documents and Notifications in separate
   owner slices; preserve current grants and existing consumer contracts.
3. Add durable work plumbing and tenant-scoped outbox/receipt foundations.
4. Attendance configuration, holidays, assignments, then published workday resolver.
5. Leave policies/enrollments/accounts/ledger/reservations/accrual foundation.
6. Source-domain approval cases/slots and receipts; generic Workflow intake and
   dispatch contracts can be implemented against contract tests first.
7. Leave requests/cancellation/adjustments and absence projection.
8. Attendance capture/calculation/corrections/period locks, then WorkEvidence;
   comp-off consumer follows the agreed evidence contract.
9. Workflow definitions/inbox/timers/operations and end-to-end source adapters.
10. Encashment bounded capability only after DEC-HCM3-019; external consumer/payment
    activation remains separately blocked. No Payroll adapter is invented.

Create all constraints, indexes, RLS and narrowly scoped grants with each table.
Add circular references only after both tables exist in that migration/slice.
Versioned development seeds follow dependencies and never change applied seeds.
Rollback prefers disabling commands/workers and forward repair; do not drop
ledger/evidence to roll back an app. Review old artifact/schema compatibility.

App sequence: WORK_SCHEDULE_TEMPLATES → HOLIDAY_CALENDARS → WORK_SCHEDULES →
MY_SCHEDULE → LEAVE_POLICIES → LEAVE_ADMINISTRATION → LEAVE_BALANCE → APPLY_LEAVE →
APPROVE_LEAVES → TEAM_CALENDAR → MY_ATTENDANCE → ATTENDANCE_CORRECTIONS →
APPROVE_ATTENDANCE → ATTENDANCE_MANAGEMENT → SHIFT_PLANNING → TEAM_ATTENDANCE →
COMP_OFF_ADMINISTRATION → COMP_OFF_ENCASHMENT → WORKFLOW_DEFINITIONS → MY_TASKS →
MY_APPROVALS → WORKFLOW_OPERATIONS → LEAVE_ENCASHMENT. Workflow foundations precede
source app delivery where task coordination is required; the order above is UI
delivery order, not permission to ship an absent foundation.

## DELIVERY

Preparation branch: `codex/hcm-3-prepare`. Suggested review commits: foundation
reconciliation/runtime proposal; Leave FDD/decisions; Attendance FDD/decisions;
Workflow FDD/decisions; readiness evidence. No user-owned input files are staged
automatically. Subsequent implementation branches: `codex/hcm-3-access-foundation`,
`codex/hcm-3-evidence-foundation`, `codex/hcm-3-notification-foundation`,
`codex/hcm-3-background-foundation`, `codex/hcm-3-schedule-foundation`,
`codex/hcm-3-leave-foundation`, `codex/hcm-3-attendance-foundation`,
`codex/hcm-3-workflow-foundation`, and `codex/hcm-3-{app-slug}` per app.
Each foundation/app uses coherent contract, SQL/RLS/API, UI and acceptance/docs
slices as applicable. Merge dependencies through PRs; no giant wave feature
branch, direct main push, deploy or promotion is authorized by this plan.
