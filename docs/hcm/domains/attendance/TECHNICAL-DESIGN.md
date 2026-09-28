# Attendance — owning technical design

Status: approved, 2026-09-28, under [bounded delegated finalization](../../roadmap/HCM-3-DESIGN-APPROVAL.md).
The [common TDD](../../architecture/TDD-HCM-3-COMMON.md) defines transport,
authorization, forms, UX and worker mechanics. The [physical TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md)
explicitly reconciles this domain's [logical facts](DATA-MODEL.md) with existing SQL.
Implementation remains planned. DTO names below are contract designs, not claims
that exported TypeScript types or endpoints already exist.

## ALGORITHM

Resolve one employment/work-date using effective workforce context, explicit
override, published roster then assigned schedule (specific Employment, Assignment, Location,
Department, OrgUnit, LegalEntity, Tenant precedence). Reject equal-precedence
overlap instead of choosing by insertion order. Snapshot every input ID/revision.
Weekly rest follows that pattern. Holiday matching uses regional/location scope,
explicit observed date and partial intervals; highest priority wins, equal
priority overlap is a conflict. No computed substitute day. Work on a holiday
remains evidence, never assumed overtime or leave entitlement.

Resolve local segments to instants using the stored IANA timezone. A nonexistent
DST wall time yields `DstGap` and requires an explicit corrected schedule/override;
never shift silently. A repeated time requires chosen earlier/later offset and
retains that choice; if missing return `DstOverlap`. Verify offset is possible
for that zone/time. Cross-midnight end day offset is 0 or 1, end instant after
start; split shifts are rejected. Compare minimum rest using instants only when
minimumRestMinutes is non-null under its explicit minimumRestMode Warn/Block; null disables the check, with no 11-hour fallback.
DEC-HCM3-022 applies schedule and policy minimum-rest rules independently. A Block
outcome from either prevents publication; Warn outcomes remain explicit evidence
and do not become a Block. Neither source overrides the other and an unset source
adds no default threshold. Each comparison uses the same exact prior-end/current-
start instants while retaining its source version, threshold and mode.

DEC-HCM3-023 resolves Employment mode from the unique effective primary assignment's
location. Location mode resolves the explicitly targeted workforce assignment or
location in the selected schedule assignment; other target kinds fall back to the
unique effective primary assignment's location. Missing/ambiguous matches return
unavailable. Fixed uses its explicit zone. User display preferences never supply
schedule timezone authority. Multiple workforce assignments at the same explicitly
targeted location refer to that single location's facts; they do not select another
employment or an arbitrary different location.

Compute half-open intervals and exact milliseconds; subtract configured unpaid
break/absence overlaps once. Retain planned work and break segments separately.

Seed defaults: Mon–Fri 09:00–18:00 with 60 unpaid minutes, Sat/Sun rest, no grace
or rounding. Incomplete template defaults are persisted as draft form proposals
in `work_schedule_seed_default/day`, not as complete ScheduleDraft versions.
The create form lets the administrator change those defaults and requires explicit
break segment placement, dates and timezone mode before saving a complete Draft.
The proposal has no timezone or dated duration and cannot be assigned, copied as
a reusable version or published. This reconciles incomplete editable seed values
with the closed, complete ScheduleDraft contract without inventing a midday break
or timezone. A saved Draft still requires its explicit preview/publication flow.
Other day/holiday/rest/rounding values require published tenant configuration.

Online capture derives occurredAt from server receive time, employment from own
selection and source OnlineWeb. Browser cannot backdate or supply trusted device,
location or offline assertions. Client-generated request key prevents retries
creating a second event. Capture ClockIn/ClockOut/BreakStart/BreakEnd is append-only;
invalid order remains an anomaly without invented matching punches. No auto-close.
Corrections append approved linked evidence, never edit raw events. Pair events
in instant order, preserve original order/key, deduplicate only exact known keys,
and classify overlapping/missing events. Provisional clock state is distinguished
from calculated, approved and locked results.

Overtime stays disabled until qualification, caps and preapproval fields are
complete. Qualification evaluates exact intervals under published rules; caps
classify excess separately without deleting it. If preapprovalRequired, require
a prior independent source approval covering date/interval/cap; otherwise do not
qualify excess retrospectively by assumption. Qualifying actual evidence also
requires independent manager approval. Keep all raw/exact duration; no money.

Self correction admission compares selected workDate to tenant-local current date:
today and the preceding six local dates, in an Open/Reopened monthly period.
This is the approved seven-calendar-day window, not 168 elapsed hours. On-behalf
changes require separate permission and reason/evidence. Approved corrections,
adjustments and waivers have independent source cases and revision-bound preview.
Applying creates a new calculation revision, with durable continuation if needed.
Source case guards include subject date/period state and evidence classification.

Period close first fences new applications, resolves all blocking anomalies,
pending decisions, calculation work and WorkEvidence reconciliation, then admin
lock stores basis digest. Late evidence creates an exception, not a basis edit.
Reopen is a separate independently approved case with reason, affected dates and
downstream impact. New results link old/new/delta; relock reconciles that delta.
Only approved qualifying evidence can feed Leave CompOff; Payroll is not a source
or consumer adapter. Reconciliation cannot manufacture an acknowledgment.

## SCHEMAS

Shared scalar rules are in COMMON CONTRACTS/FORMS. `?` means optional, arrays are
bounded by scope/date range and no duplicate keys. Enums are closed; nested objects
reject unknown fields. Read DTOs add id/revision/state and contain no DB-only keys.

| DTO                             | Exact business fields and validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ScheduleDraft                   | code,name,description?,isTemplate, effectiveFrom,effectiveTo?,timezoneMode Employment/Location/Fixed,fixedZone? required only Fixed,weekStartsOn 1–7,minimumRestMinutes? >=0,minimumRestMode? Warn/Block required when rest configured,days[exactly seven: weekday,kind Work/Rest,segments[startTime,endTime,endDayOffset,kind Work/UnpaidBreak,overlapOffset?]]. Work segments cover working intervals and unpaid break segments cover gaps within a single shift envelope; ordered nonoverlapping segments, one shift with internal breaks; no split shifts. |
| ShiftDraft                      | code,name,description?,effectiveFrom,effectiveTo?,timezoneMode,fixedZone?,segments (ScheduleDraft segment shape),minimumRestMinutes?.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| AttendancePolicyDraft           | code,name,effectiveFrom,effectiveTo?,graceInMinutes>=0,graceOutMinutes>=0,rounding None/Configured,roundingIncrementMinutes? required only Configured,roundingDirection? Down/Up/Nearest only Configured,minimumRestMinutes?,minimumRestMode? Warn/Block required when rest configured,overtime {enabled,qualification? ScheduledExcess/RestDay/Holiday,capMinutes?,preapprovalRequired?},approvalRules[subjectType,stage,independent,candidateRule]. Enabling requires all overtime parameters; no default cap. Zero grace/None in seed.                      |
| HolidayDraft                    | code,name,effectiveFrom,effectiveTo?,entries[date,observedDate,category Public/Company/Regional/Substitute,name,priority integer,regionCode?,locationId?,startTime?,endTime?]. Both times or neither; partial intervals ordered. No automatic observedDate. Equal-priority intersecting assignment/date/interval rejected.                                                                                                                                                                                                                                     |
| AssignmentCommand               | employmentId? / assignmentId? / locationId? / departmentId? / orgUnitId? / legalEntityId? exactly one or explicit tenantScope=true,versionId,effectiveFrom,effectiveTo?,expectedRevision?,reason. Tenant target inferred from context. Version published, template denied, date coverage and same-precedence overlap validated.                                                                                                                                                                                                                                |
| ConfigurationPreview            | expectedRevision,effectiveFrom,effectiveTo? -> previewId,digest,inputRevisions,affectedEmploymentCount,conflicts,lockedImpact,state,expiresAt. PublishCommand adds previewId,digest,expectedRevision,reason.                                                                                                                                                                                                                                                                                                                                                   |
| WorkdayView                     | employmentId,workDate,zone,revision,digest,sourceVersionIds,kind Work/Rest/Holiday,segments[startInstant,endInstant,kind,offset],elapsedMilliseconds,unavailableCode?. Never fake zero for unavailable.                                                                                                                                                                                                                                                                                                                                                        |
| RosterDraft                     | code,name,from,to,entries[employmentId,workDate,shiftVersionId,overlapOffset?],supersedesId?. Unique employment/date; every row in planner scope, published shift and active employment. RosterView adds conflicts,approvalState,publishedRevision.                                                                                                                                                                                                                                                                                                            |
| ClockCommand                    | employmentId,kind ClockIn/ClockOut/BreakStart/BreakEnd. Server adds event time/source/key; unknown timestamp/location/device input rejected.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AttendanceDayView               | employmentId,workDate,zone,workdayRevision,calculationRevision,elapsedMilliseconds,breakMilliseconds,qualifyingMilliseconds,state,anomalyCodes,provisionalClockState,allowedActions. Ordinary views omit raw capture/security diagnostics and private reasons.                                                                                                                                                                                                                                                                                                 |
| CorrectionDraft                 | employmentId,dayId,expectedDayRevision,items[type AddMissingPunch/DisregardEvent/ReplacePunch,eventId? required for latter two,kind?,instant? required for added/replaced punch,zone,offset],reason,evidenceIds[]. Corrected instant must match zone/offset/date; original remains immutable.                                                                                                                                                                                                                                                                  |
| CorrectionPreview               | CorrectionDraft -> previewId,digest,before/after AttendanceDayView,conflicts,expiresAt. Submission requires unchanged input and expectedRevision.                                                                                                                                                                                                                                                                                                                                                                                                              |
| AdjustmentDraft                 | employmentId,dayId,expectedDayRevision,deltaMilliseconds nonzero integer string,reason,evidenceIds[],previewId,digest. Before/after cannot imply negative actual duration; independent approval required.                                                                                                                                                                                                                                                                                                                                                      |
| CalculationCommand              | employmentIds[],from,to,reason; all subjects scope-authorized. Result operationId,planned/failed/completed counts. Existing run retry takes expectedRevision,reason and retains original input keys.                                                                                                                                                                                                                                                                                                                                                           |
| PeriodCommand                   | periodId,expectedRevision,reason,previewId,digest; reopen adds affectedDates[],evidenceIds[],downstreamImpactReference and opens separate case. PeriodView includes month,basisDigest,lockId,blockingCounts,linkedDeltaId.                                                                                                                                                                                                                                                                                                                                     |
| CaseView / DecisionCommand      | CaseView: id,subjectType,subjectId,subjectRevision,generation,stage,slots,safe before/after,allowedActions. Decision: expectedRevision,expectedSubjectRevision,generation,action Approve/Reject,reason. Route slotId must be current and independent.                                                                                                                                                                                                                                                                                                          |
| OperationView / RecoveryCommand | Typed run/anomaly/event/evidence projection as selected by route; bounded safe fields, source revision and outcome. Recovery: expectedRevision,reason; no source status/body override. Waiver requires evidenceIds,previewId,digest and source approval.                                                                                                                                                                                                                                                                                                       |

## STORAGE

Configuration roots are tenant-level shared master data, distinct from their
dated scope assignments. Root curation requires one current tenant-wide operation
grant; an employment-scoped grant does not authorize global templates or policies.
Assignment/publication impact and employee workday reads additionally evaluate
their actual dated workforce subjects. Human draft commands use the existing
exclusive tenant mutation/revocation lock, exact source revision and an
actor/operation/key receipt. Replays recheck current read authority. Session
expiry is rechecked after awaited effects before returning the transaction.

Schedule read projections may include `copiedFromVersionId`. Copy selects an
immutable Published template version and creates an independent ordinary Draft;
new versions derive from Published/Retired source content and preserve supersession.
Root code/type cannot change through whole-draft replacement. Private reasons for
copy/version/publication/retirement live encrypted in `attendance_command_receipt`
with a key version and typed configuration-version reference; shared audit contains
only action, source ID, field names and lifecycle states. Draft create/update have
no extra reason field beyond their declared request schemas.

`time_configuration_impact_preview` stores actor, exactly one typed version,
source revision/digest, bounded date range, input revisions, result metrics/digest,
expiry and lifecycle. Inputs and Ready results are immutable. Publication locks
the source, revalidates all inputs/authority, consumes the still-current Ready
preview, then advances the version in the same transaction. Expired, conflicting,
locked-impact or changed-source previews cannot be consumed. Receipt, reason,
audit and all business effects roll back together on any failure.

Schedule/template and holiday-calendar list continuation uses an opaque, server-stored random
256-bit handle, not unsigned browser-encoded sort data. Calendar lists follow the
same latest-version-before-filter rule and closed code/name/state/id sort contract;
exact calendar detail remains the declared root/version path without query. Only its SHA-256 digest
is stored in `attendance_query_cursor`, with tenant/actor, allowlisted app,
binding digest, last sort value/root ID and a 15-minute expiry. Binding covers
the current authorized tenant-wide grant, permission, every normalized filter,
sort/direction/limit and collection revision. The latter is the exact integer sum
of all version revisions in that tenant's selected schedule/template family;
runtime cannot delete versions and every insert/update increases the sum. Any
source mutation invalidates continuation, requiring a fresh first page. Cursors
never grant authority; authorization is reloaded before lookup/count on every page.
Bounded opportunistic deletion of at most 100 expired cursor rows on issuance
is technical cache cleanup, not a durable API scheduling loop. Different app,
actor, scope, filter, sort, limit or revision cannot reuse a handle. This needs no
new signing secret, authentication service or process-local key.

Configuration representation: `candidateRule` is a closed union of
`{source: LineManager}`, `{source: ManagerLevel,managerLevel}`,
`{source: Function,functionCode}` and `{source: NamedUser,accountId}` from
AttendanceApprovalRule's logical selector fields. Manager levels and stages are
positive integers; stage numbers are contiguous per subject, and array order
identifies slots within a stage. These selectors never grant authority. Correction,
Adjustment, Overtime, AnomalyWaiver and PeriodReopen rules must be independent.
An enabled overtime policy requires an independent LineManager/ManagerLevel rule;
missing rules for any required case yield an unavailable configuration, never an
implicit approval. Disabled overtime has only `{enabled:false}`; changing to enabled
requires explicit qualification, nonnegative cap and preapproval boolean. Monetary,
offline, device, location-capture and auto-close fields are not accepted.

Holiday partial endpoints support the same optional `overlapOffset` object as
schedule endpoints. Partial wall intervals remain ordered within one observed
date; actual instants must also be ordered. Missing choices at a repeated endpoint
block resolution. Both dates are explicit; only observedDate determines applicability
and must lie within the version's effective dates. Actual dates may differ across
the year boundary. Optional regionCode is an exact workforce region selector,
maximum 120 characters, without jurisdiction inference; an optional locationId
is tenant-owned. Both selectors, when supplied, must match. Names and function
codes have a 120-character bound; priority is a signed 32-bit integer. Higher
priority wins each intersecting interval; any matching equal-priority intersection
is rejected even if a higher-priority entry also covers it. Adjacent half-open
intervals do not collide. Scope/zone-dependent collision checks run in preview
and dated resolution, not solely in browser field validation.

Implementation precision for the existing segment contract: `overlapOffset` is
`{start?: Earlier|Later,end?: Earlier|Later}` so the two endpoints can identify
different occurrences of a repeated wall-clock hour. It never authorizes shifting
a nonexistent time. The first segment starts on workDate; each later contiguous
segment starts on the preceding segment's end day. `endDayOffset` is relative to
workDate (0 or 1). This supports breaks after midnight without a guessed date.
Local continuity is checked in the shared parser; actual instant ordering and
continuity are checked during dated resolution. A fold-crossing interval may have
an earlier end wall time only with explicit Earlier start/Later end and a positive
resolved duration. Missing ambiguity choices block dated resolution.

The server domain uses pinned `@js-temporal/polyfill` 0.5.1 because the repository
Node 24 runtime does not expose native Temporal. It compares both disambiguated
occurrences back to the requested wall time, rejects gaps, requires overlap
selection and retains actual endpoint offsets. No global Temporal replacement,
timezone sampling heuristic or browser/server implementation import is used.
The dependency and semantics were checked against the
[maintainer release](https://github.com/js-temporal/temporal-polyfill/releases/tag/v0.5.1)
and [Temporal timezone specification](https://tc39.es/proposal-temporal/docs/timezone.html).
Integer millisecond parsing, interval union/subtraction and BigInt totals preserve
sub-minute evidence. These are technical representations of DEC-HCM3-003/004,
not additional business policy or an implementation acceptance claim.

The physical TDD defines fields/constraints/RLS/indexes and immutable publication.
Queries use Kysely only in Attendance infrastructure. One command transaction
locks current authorization then subject/period, validates preview/input digest,
appends changes, audit, receipt and outbox. Calculation writes a new immutable
revision keyed by all inputs; latest selection is separate from historical payload.
Worker resolves published schedules, calculates, reconciles and delivers evidence.
No durable scheduler in hcm-api. Notifications report approved roster/correction/
period state with safe IDs only. Evidence uses the Documents purpose-bound port.

## ASSIGNED-WORKDAY-RESOLUTION

The first resolver path composes assigned Published schedule, policy and calendar
inputs for one employment/start date in the caller's tenant transaction. Missing
configuration remains unavailable; an explicitly empty published calendar and
explicitly inactive policy rules are real configuration, not inferred defaults.
Internal calendar projections retain holiday entry/version IDs for typed evidence;
public calendar DTOs continue to omit storage identity. For cross-midnight work,
select the next civil date's calendar against the start-date Workforce scope,
retaining both selection dates/digests. Filter each calendar's entries to its
selected observed date before combining them, so a version switch cannot leak a
non-selected date or duplicate the same entry. The workday location is the explicit
Location-mode assignment/location, otherwise the unique primary location; Fixed
continues to use its explicit timezone while regional/location holiday applicability
uses that dated location's facts. Missing or ambiguous holiday scope is unavailable.

Configured minimum-rest evaluation looks backwards through current dated schedule
inputs to the nearest preceding Work envelope, stopping at this employment's hire
date. Every examined Rest/Work input digest is retained; missing history, ambiguous
zone or DST errors remain unavailable rather than presumed rest. Both rules compare
the exact previous envelope end and current start. No preceding employment work is
an explicit boundary result, not fabricated elapsed time. When both rules are unset,
or the current pattern is Rest, no minimum-rest history is needed. A positive
caller-supplied history-read budget limits execution; exhaustion returns unavailable
and never a truncated successful result. It is an operational bound, not a business
minimum-rest or eligibility rule. An internal caller can retry with an appropriate
budget. Preserve each rule's source/version/threshold/mode and outcome, including Warn
when another rule Blocks. Source digest covers all selections, location, interval
resolution and rest evidence. Only Available may reach immutable workday publication.

This path does not yet select rosters/overrides. Their typed owning storage and
approved priority checks must be composed before those producers become available.

## TESTS

Required boundary fixtures: DST spring gap; both fall overlap offsets; cross-
midnight month/year transition; leap date; partial holiday overlap and equal
priority collision; null minimum rest versus configured threshold; missing break
placement in seed publication; unclosed punch; duplicate event key and out-of-order
events; exact sub-minute time; disabled/enabled overtime with independent manager;
day seven/day eight correction; two actors racing decision; event at period fence;
reopen/relock delta and CompOff reversal. Test real SQL/HTTP and native UI at narrow
and desktop sizes. App traceability selects concrete acceptance cases.

## SUPPLEMENT

DTO aliases used by app TDDs are closed shapes, not unresolved types:

| DTO                            | Definition                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VersionDraftCommand            | sourceVersionId,code? only for copy to new owner,expectedRevision,reason. Copy creates a new Draft child; old published version is unchanged.                                                                                   |
| CopyCommand                    | code,name,sourceVersionId,expectedRevision,reason; creates independent non-template schedule draft and source reference.                                                                                                        |
| ReasonCommand                  | expectedRevision,reason. Preview uses expectedRevision against current source; no hidden business input.                                                                                                                        |
| PublishCommand / SubmitCommand | expectedRevision,previewId,digest,reason. Publish checks required approval first; submit opens the source case.                                                                                                                 |
| Preview                        | previewId,digest,state,inputRevisions,before,after,conflicts,expiresAt,operationId?; async large preview is persisted and read through GET /previews/{id}, with the originating app's read permission and scope.                |
| OverrideDraft                  | employmentId,workDate,workdayRevision,segments (ScheduleDraft segment shape),zone,reason,evidenceIds[]. Independent source approval required when selected published policy requires override approval; no edit to old workday. |
| ClockView / EventReceipt       | ClockView: employmentId,state In/Out/OnBreak/Unknown,lastEventId,lastReceivedAt,provisional:true. EventReceipt: id,receivedAt,occurredAt,kind,revision,calculationPending:true.                                                 |
| CorrectionView                 | id,revision,employmentId,dayId,expectedDayRevision,items,state,beforeRevision,afterRevision?,approvalProgress,allowedActions; reason/evidence require field access.                                                             |
| AdjustmentInput                | AdjustmentDraft excluding previewId,digest; preview evaluates nonnegative resulting classifications and period openness.                                                                                                        |
| WaiverCommand                  | expectedRevision,previewId,digest,reason,evidenceIds[]; opens independent anomaly waiver case, never directly clears a blocking anomaly.                                                                                        |
| ReopenInput                    | expectedRevision,affectedDates[],reason,evidenceIds[],downstreamImpactReference; preview returns locked basis and proposed delta scope.                                                                                         |
| OvertimeAuthorizationDraft     | employmentId,workDate,startInstant,endInstant,zone,capMilliseconds,reason,evidenceIds[]; must precede start instant, fit configured qualification/cap and current scope; independent manager case. No monetary values.          |
| AttachmentCommand              | expectedRevision,stagedBlobId; content already staged under correct subject/purpose and clean classification.                                                                                                                   |
| DecisionReceipt                | commandKey,inputDigest,caseId,slotId,generation,decisionId?,outcome,sourceRevision; safe source proof, not a copied persistence row.                                                                                            |
| PeriodView                     | id,revision,month,state,basisDigest?,lockId?,blockingCounts,linkedDeltaId?.                                                                                                                                                     |

GET /previews/{id} and GET /operations/{id} are shared domain routes, guarded by
the originating operation's app read grant and original subject scope. Operation
status returns id,state,itemCounts,safeFailureCode,resultId? only. Evidence staging
uses the Documents owner port via POST /evidence/staged and GET /evidence/{id}/content
with originating app field permission; upload max10MiB, purpose and subject are
required and rechecked. These routes do not permit arbitrary blob opening.
