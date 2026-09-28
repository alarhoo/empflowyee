# HCM-3 SQL and integration design

Status: approved design, 2026-09-28, under
[delegated technical finalization](../roadmap/HCM-3-DESIGN-APPROVAL.md).

## MAPPING

The logical catalogues in the three domain DATA-MODEL documents describe facts,
not executable DDL. Explicit reconciliation: all logical integer PK/FK and
PublicId pairs become the existing opaque text ID with tenant composite key;
do not add duplicate identity columns. OrganizationId refers to the tenant's
organisation_profile; OrgUnitId to organisation; legal employer comes from
employment; worker/person/assignment/reporting_line/location are reused. Audit
timestamps use timestamptz; local work dates use date; wall times use time and
IANA zone plus selected offset. CamelCase logical names become snake_case.
Version concurrency becomes revision integer; immutable version IDs are distinct
from revision counters. Logical minute integer fields gain elapsed_milliseconds
and qualifying_milliseconds bigint where exact evidence is involved; no time is
rounded to fit a logical field. Unit postings use numeric(18,6) after explicit
policy rounding. Logical JSON is accepted only with typed schemaVersion and
validated payload; no arbitrary scripts or unbounded objects.

## TABLES

Physical families and fields are the owning logical catalogue after MAPPING,
plus these explicit deltas. Deferred logical entities are not generated.

| Owner               | Physical additions or restrictions                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attendance          | work_schedule/version/day/segment, shift/version/segment, holiday_calendar/version/holiday, attendance_policy/version/rules, dated scope assignments, override/roster/entry and published_workday/segment. Templates reuse work_schedule.is_template and cannot be assigned. minimum_rest_minutes nullable, null disables validation. Schedule break segments must be configured before publishing a seed draft.                                  |
| Attendance evidence | attendance_event, calculation_run/item, attendance_day/session/anomaly, correction_request/item, adjustment_request, approval_case/slot/decision, period/lock, work_evidence. Event channel enum only OnlineWeb or ApprovedCorrection in this release; no import/device batch tables. Overtime preapproval uses a source case with planned date/interval/cap and is linked by calculation; disabled configuration creates no qualifying evidence. |
| Leave               | leave_type/policy/version and typed child rules, period/enrollment/grant/account/transaction/reservation/allocation, accrual_run/item, request/day/attachment/comment/cancellation, approval_case/slot/decision, adjustment_request, comp_off_earning/credit_request. tracking_mode Balance or Unpaid required on policy version; Unpaid enrollment cannot reference/create account, reservation, grant or posting.                               |
| Leave encashment    | Typed units-only policy configuration and contract schema only. Do not create live submission/handoff/payment tables, routes or jobs until consumer admission. Existing logical payment states describe future scope and are excluded from current DDL.                                                                                                                                                                                           |
| Workflow            | Fixed product registry (no tenant data), definition/version/stage/slot/condition/routing/timer rules/preview; instance/fact/stage/task/candidate/assignment/attempt/dispatch/receipt/timer/event/reconciliation_exception. No pool claim, delegation authority, source business row copies or arbitrary adapters.                                                                                                                                 |
| Each domain         | `<domain>_command_receipt`, `<domain>_outbox`, `<domain>_planner_cursor`, durable preview rows bound to owner/source/input digest. Runtime shares mechanics but never becomes owner of domain facts.                                                                                                                                                                                                                                              |

Source approval slots add tenant/id, case_id, generation, stage_ordinal,
slot_ordinal, requirement_code, candidate_rule_revision, state, revision;
unique (tenant,case,generation,stage_ordinal,slot_ordinal). Decisions add slot_id,
subject_revision, actor_account_id, grant_id, action, encrypted_reason,
command_key, decided_at; one effective decision per slot/generation. Decisions
are immutable. Material change invalidates generation rather than updating it.

Outbox has tenant/id, kind, schema_version, business_key, payload, digest,
state, available_at, attempts, lease_owner, lease_until, fence, receipt_id,
last_error_code and timestamps. Unique tenant/kind/business_key. Receipts have
tenant/id, actor_kind/account/workload, operation, command_key, input_digest,
result_schema/result, source_revision, completed_at; key uniqueness includes
actor and operation as the existing command receipt contract requires. Workflow
dispatch additionally binds a globally unique domain dispatch key under tenant.
Planner cursor unique tenant/workload/rule, last_planned_date and revision.

## CONSTRAINTS

Every tenant table has tenant_id directly, ENABLE and FORCE RLS using the existing
hcm.current_tenant_id() posture, and composite tenant FKs for parents, versions,
employment, actor, blob and consumers. Runtime is non-owner/non-BYPASSRLS. SQL
enforces finite enums, date ordering, positive revisions, nonnegative durations,
nonzero adjustments, unique business keys, exactly-one typed target and valid
state combinations. Scope targets are typed child FKs rather than an unconstrained
polymorphic ID. Use GiST exclusions on tenant/owner/effective daterange for
published policy versions and same-precedence assignment overlaps. Extensions
must follow existing approved database tooling; do not install at API startup.

Indexes: tenant/employment/work_date/revision for workdays and attendance;
tenant/employment/occurred_at for events; tenant/account/sequence for ledger;
tenant/status/due_at/id for work/timers; tenant/actor/state/id for tasks; tenant/
scope/effective range for assignment resolution. Unique enrollment/rule/business
date for accrual, account/request/day/effect for postings, source-evidence/revision/
consumer for comp-off, task/generation/rule/fire_number for timers. Aggregate
availability comes from locked account + ledger/reservations, never a UI balance.

Published payload/child rows, raw events, decisions and ledger rows are immutable
by grants and guarded triggers; only declared lifecycle fields can change. Ledger
reversal appends a linked opposite posting; evidence replacement links prior and
new revision. SQL migrations grant only necessary SELECT/INSERT and narrowly
defined UPDATE, never blanket DELETE on evidence. Account locks serialize spend;
case and subject locks serialize decision; roster scope/range locks serialize
publication; period locking fences new calculation publication. Keep existing
Access Control revocation lock ordering before domain locks to avoid deadlocks.

## CROSS-DOMAIN

PublishedWorkday query returns employment,date,zone,revision,digest,source version
IDs, work/rest/holiday segments with resolved instants/offsets and exact duration.
Leave receives ApprovedWorkday through a port, owns unit conversion and returns
ApprovedAbsence (employment,interval,reconciliation category,revision,reversal)
without sensitive leave category/reason. Attendance never converts absences to
worked time. Dependencies are immutable IDs/digests in each calculation basis.

WorkEvidence v1 contains evidenceId, purpose CompOff, employmentId, workDate, zone,
calculationId/revision/digest, elapsedMilliseconds, qualifyingMilliseconds,
qualifyingMinutes rational, qualification rule version, independent approval IDs,
optional lockId, supersedesId/reversalOfId and businessKey. Only source-approved
qualifying time can publish. Leave acknowledgment is Accepted with earningId and
consumer revision, Duplicate with same proof, or Conflict with safe exception code.
Unique evidence/revision prevents duplicate credit. Reversal appends ledger
reversal; if consumed units make reversal impossible, create a reconciliation
exception and block close/relock until governed adjustment, never erase history.
Replacement reverses old evidence before applying new, linked under one intent.

DomainApprovalManifest v1 is source/case/subject IDs and revisions, generation,
ordered required stages/slots, distinctness predicates, current candidate revision,
safe facts, actions Approve/Reject and registered route code. Workflow cannot
reduce source obligations. Receipt binds intent/digest, source case/slot/generation,
actor, decision ID, source revision and Accepted/Denied/Stale/Conflict/CaseClosed.
Only Accepted proves a source decision; HTTP timeout proves nothing. In-process
adapter provenance and tenant-bound durable dispatch rows establish authenticity.

## MIGRATIONS

Ordered explicit SQL follows runtime/access/audit, document/notification extension,
durable mechanics, Attendance configuration/workdays, Leave policy/accounts,
source cases, Leave requests, Attendance evidence/periods, comp-off, Workflow.
Assign filenames after current maximum at implementation (000033 inspected).
Generate Kysely types from migrated SQL through repository tooling; do not use
TypeScript as schema authority. Downward destructive rollback is not approved:
disable commands/claims and forward-repair while preserving ledger and receipts.
Versioned PostgreSQL development seeds follow dependencies, never fixture arrays.
Local read-only inspection found 000023 applied; explicitly run migration/seed
setup during implementation, not now. HCM-0 validation is historical foundation
evidence, not a claim that these new tables exist.

## TESTS

Prove FK and RLS denial using two tenants, both tenant-setting omission and forged
foreign references; test runtime UPDATE/DELETE denial on immutable rows. Concurrent
reservation, same-key altered payload, duplicate approval, stale preview, event
during period lock, evidence reversal after consumption and worker stale-fence
completion must leave consistent receipts/ledger/outbox. Verify old DTO consumers
and real migrated SQL, not only mocks or generated type checks.
