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

Attendance's disposable `attendance_query_cursor` stores only a random handle
digest, actor/app/query-authority binding, bounded sort continuation and expiry.
It has tenant RLS and composite actor/root FKs; no runtime UPDATE. Its closed
app allowlist selects generated typed schedule/calendar root-reference columns
from the stored last ID, so every cursor retains a real tenant-composite FK
without letting a caller choose an unrelated owner family. DELETE is
limited by the adapter to bounded expired cache cleanup. Its owning TDD defines
authentication and source revision binding; it is never a permission credential.

`work_schedule_seed_default/day` stores the incomplete, configurable draft form
proposal separately from complete work_schedule versions: one tenant default,
revision, suggested code/name/week start and seven typed weekday envelopes with
unplaced unpaid-break minutes. No zone or effective date is guessed. Runtime reads
these seed values only; user edits become a newly validated complete Draft through
the existing command. Seed reset refuses when real Attendance evidence exists.

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

## PERIOD-FENCES

Attendance configuration/workday publication must share a monthly fence with
period state changes before worker handlers can publish dated results. The physical
`attendance_period` has tenant/id, month_start (first calendar day), generated
month_end, state, revision, current_lock_id and timestamps; unique tenant/month.
The tenant's single organization profile is implied by ownership, without a second
organization scope. Period names/codes are derived month labels, not new policy.
`attendance_period_lock` is append-only tenant/id/period_id/lock_number, input,
output and reconciliation digests, supersedes_id, locked_at and locked_by_account_id.
Tenant/period composite references keep both the current and superseded locks in
the same month. Lock status derives from the current pointer; historical lock
payloads never change.

Writers take the existing tenant authority lock first, then ascending monthly
advisory fences, then owner row locks. The fence key is tenant plus the explicit
calendar month. Period insertion/state changes take the exclusive month fence;
configuration/workday publication takes shared month fences over its full affected
range before reading period snapshots. Reading does not take period row locks,
which avoids a row/advisory lock inversion. A missing period is an explicit absent
snapshot and is protected against concurrent insertion by the same fence. Absence
is not an Open period and cannot authorize attendance correction/calculation.
Preview input binds each month and present period ID/revision/state/current lock;
Closing/Locked impact blocks ordinary configuration publication. Revalidation
under the fence detects period creation and lifecycle changes after preview.

SQL accepts only monthly ranges and declared lifecycle transitions, increments
revision exactly once and preserves identity. Lock insertion requires Closing,
sequential numbering and the exact previous current lock. Final Locked state
requires that appended lock. The reopen transition remains fail-closed until the
separately approved Attendance source case/delta adapter is composed; storage alone
must never permit an unapproved reopen. The later source-case migration supplies
its typed authority references. No period/lock endpoint or automatic monthly
closure is implied by this prerequisite storage slice.

## WORKDAY-EVIDENCE

The initial workday persistence slice supports the assigned schedule path. Its
`published_workday` stores tenant/id/employment/work_date, IANA zone, schedule
kind Work/Rest, exact scheduled-work/break/expected-work milliseconds, positive
revision, input/resolution digests, exact schedule version, optional policy version,
supersedes_id, resolved_at and workload_run_id. Unique tenant/employment/date/revision
and tenant/employment/date/resolution_digest prevent forks and duplicate results.
Supersession references the same employment/date and the immediately preceding
revision. Current selection is derived; no historical payload is updated.
The roster/override source references are added by their owning migrations before
those resolution paths are composed, never represented by untyped placeholder IDs.

`published_workday_holiday_source` retains every exact calendar version used,
including a different version for the next civil date of cross-midnight work.
Its composite parent/version identity anchors Holiday segments. `published_work_segment`
stores ordered Work, UnpaidBreak, Holiday and ExpectedWork intervals. ExpectedWork
is the exact interval difference already defined by the domain, stored separately
from original Work/UnpaidBreak evidence so holiday subtraction never erases it.
Each segment retains UTC instants, local timestamps and actual offset seconds;
seconds avoid rounding historical timezone offsets to whole minutes. Holiday
segments reference their exact tenant/calendar-version/holiday identity.

A workday append takes the shared monthly period fence and an exclusive
employment/date fence after tenant authority. Closing/Locked/Reopened periods
reject ordinary append; missing or Planned periods do not authorize attendance
calculation, although future schedule workdays may be materialized. Referenced
configuration must be Published and cover the date when a new workday is appended.
The worker still revalidates all input digests and its lease fence before commit.
This storage does not manufacture current input authority from a supplied digest.

All workday/source/segment rows are insert-only. A server-controlled transaction
identity confines child insertion to the parent's creation transaction. Deferred
SQL checks require a complete contiguous single-shift schedule or a real Rest day,
nonoverlapping intervals per lane, exact totals and ExpectedWork = Work minus Holiday.
Typed holiday references, instant/local/offset consistency and millisecond precision
are enforced. A failed child or invariant rolls back the whole append. Persistence
of successful workday evidence does not replace explicit unavailable/conflict run
outcomes, which must never be stored as a fabricated zero-duration workday.

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
