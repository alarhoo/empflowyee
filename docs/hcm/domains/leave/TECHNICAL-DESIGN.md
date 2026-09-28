# Leave — owning technical design

Status: approved, 2026-09-28, under [bounded delegated finalization](../../roadmap/HCM-3-DESIGN-APPROVAL.md).
The [common TDD](../../architecture/TDD-HCM-3-COMMON.md) defines transport,
authorization, forms, UX and worker mechanics. The [physical TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md)
explicitly reconciles this domain's [logical facts](DATA-MODEL.md) with existing SQL.
Implementation remains planned. DTO names below are contract designs, not claims
that exported TypeScript types or endpoints already exist.

## ALGORITHM

Policies are immutable effective versions with typed eligibility, accrual,
rounding, restrictions and source approval rules. Enrollment selects a dated
eligible policy and employment; don't create workforce or schedule copies.
The initial policy baseline remains configurable seed, not legal certification.
LOP uses TrackingMode Unpaid: requests carry calculated units and approval
history but never create balance accounts, grants, reservations or ledger rows.
Balance mode serializes availability under account lock. Availability is posted
credits minus debits minus pending reservations, never negative by implicit grant.

Preview queries published workdays and policy/period versions for every date.
Cross-period/version requests reject rather than split. Compute requested overlap
with work intervals excluding unpaid breaks/holidays; denominator is scheduled
duration. A legitimately unscheduled day may use only an explicitly published
standard-day fallback, never a failed resolver. Half day uses midpoint of scheduled
working duration excluding breaks; Hourly uses configured increment. Keep rational
duration inputs, round once per day under policy and sum exact decimal row units.
Return day explanation/warnings and digest of all inputs. Submission revalidates
digest under current authorization and reserves balance only for Balance mode.

Source case selects ordered required slots from policy: baseline line manager,
HR above three units, executive above five units for VAC/LOP. Vacant/conflicted
manager slots walk the reporting chain only through currently authorized
candidates, then exception. Every required slot must approve; any rejection is
terminal. Final approval consumes the reservation and posts day debits under the
baseline. Withdraw/reject releases once; approved cancellation appends per-day
reversal after its own independent decision. Material edits invalidate old case
generation. Unpaid approval/cancellation records units/history without postings.

Accrual and expiry worker uses tenant-local business dates, enrollment/rule/date
uniqueness and durable planner cursor. Seeds include VAC24/year and2/month only
as drafts. Catchup plans missed dates; successful postings, receipt, audit and
cursor/item result commit together. Manual adjustments are nonzero, independently
approved, reason/evidence bound and never overwrite balances. Period close
requires reconciled run items/reservations/decisions and evidence exceptions.

Attendance WorkEvidence is the sole approved automatic CompOff source. Leave
owns conversion rules, credit ledger, claim window and expiry. Capability stays
disabled without a published policy. Configured baseline may use240/480-minute
thresholds, one unit per date,30-day claim window,90-day credit expiry; those are
explicit config, not implicit statutory rights. Manual earning requires separate
evidence and independent approval; it never creates Attendance raw worked time.
Reversal/replacement follows the physical integration TDD and preserves consumed
units as reconciliation exceptions until corrected under authority.

Encashment this release is configuration and units-only DTO design plus honest
availability. ConsumerAdmission is false and cannot be set by tenant config.
Policy can record intended annual-type units limits, but cannot enable monetary
submission, reservations, approval, payment or handoff. No request/handoff routes
or fake Paid callbacks are mounted. Future contract activation requires separate
consumer/security review. App controls link to policy configuration and explain
unavailability without implying delivery of that future flow.

## SCHEMAS

Common scalars, reason, fields and command envelope use the shared TDD. Arrays
reject duplicate dates/IDs; all referenced IDs are authorized tenant resources.

| DTO                             | Exact business fields and validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LeavePolicyDraft                | code,name,description?,leaveTypeId,effectiveFrom,effectiveTo?,trackingMode Balance/Unpaid,unit Day/Hour,eligibility{workerTypes[],legalEntityIds[],minimumServiceDays?},standardDayMinutes?,hourlyIncrementMinutes?,rounding{scale0..6,mode Up/Down/Nearest},accrual{enabled,unitsPerYear?,unitsPerMonth?},carryForward{enabled,capUnits?,expiryDays?},noticeDays?,noticeMode Warning/Block,evidenceAfterConsecutiveDays?,approvalRules[stage,roleCode,minimumUnits?,independent],compOff{enabled,halfUnitMinutes?,unitMinutes?,maxUnitsPerDate?,claimWindowDays?,expiryDays?},encashment{configured,annualOnly:true,maxUnits?,minimumRetainedUnits?}. Enabled rule parameters required and positive; Unpaid rejects accrual/carry-forward/comp-off/encashment funding. Statutory packs are not inferred. |
| PolicyPreview                   | expectedRevision,effectiveFrom,effectiveTo? -> previewId,digest,affectedEnrollmentCount,conflicts,sourceRevisions,expiresAt. Publish requires previewId,digest,expectedRevision,reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| EnrollmentCommand               | employmentId,policyVersionId,effectiveFrom,effectiveTo?,reason; overlapping same-type enrollment rejected. Balance account created only for Balance tracking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| LeaveRequestDraft               | employmentId,enrollmentId,days[workDate,portion Full/FirstHalf/SecondHalf/Hourly,startTime?,endTime?,offset?],reason,evidenceIds[]. Hourly requires both times and valid zone offset for overlap; other portions reject explicit times. No cross-period/version.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| LeavePreview                    | LeaveRequestDraft -> previewId,digest,policyVersionId,periodId,dayRows[workDate,workdayRevision,elapsedMilliseconds,units,explanation],totalUnits,warnings,evidenceRequired,expiresAt. Missing schedules return unavailable, not fallback defaults.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| RequestView                     | id,revision,employmentId,policyVersionId,periodId,days,totalUnits,state,trackingMode,approvalProgress,allowedActions; reason/evidence only with separate field authorization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| SubmitCommand                   | expectedRevision,previewId,digest,reason; current staged clean evidence must match the draft. No client units override.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| CancellationCommand             | expectedRevision,days[workDate,units],reason,evidenceIds[],previewId,digest. Units positive, at most previously approved un-reversed day units and policy increment; own cancellation preview checks same revisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| BalanceView                     | enrollmentId,policyId,periodId,trackingMode,postedUnits?,reservedUnits?,availableUnits?,revision. Unpaid omits the three numeric balances and exposes trackedUnits separately; cannot masquerade as zero entitlement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| LedgerView                      | transactionId,date,type,units,sourceReference,reversalOfId?,runningUnits; no encryption metadata or other employment fields. ReservationView exposes source request/date/units/state only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| TeamCalendarView                | employmentId,displayName,workDate,availability Away/Available/Partial/Unavailable,intervals,sourceRevision; private category, narrative and attachment omitted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CaseView / DecisionCommand      | id,subjectType,subjectId,subjectRevision,generation,stage,slots,unitDelta,allowedActions,safeHistory. Decision has expectedRevision,expectedSubjectRevision,generation,action Approve/Reject,reason; route slotId exact and source-authorized.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| AccrualCommand                  | enrollmentIds[],from,to,reason; plans bounded durable run, returns operationId and item counts. Retry preserves run input/business keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AdjustmentDraft                 | accountId,effectiveDate,deltaUnits nonzero,reason,evidenceIds[],previewId,digest,expectedRevision. No Unpaid account; requester cannot approve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| EarningView                     | earningId,evidenceId,workDate,qualifyingMinutes,policyVersionId,creditedUnits,remainingUnits,expiryDate,state,revision. Employees see no raw capture diagnostics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ManualEarningDraft              | employmentId,workDate,qualifyingMinutes rational,reason,evidenceIds[],policyVersionId,previewId,digest. Explicit manual evidence provenance; independent approval required before ledger credit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CompOffClaimDraft               | employmentId,earningId,units,reason; positive configured unit increment within remaining/window, no user-entered work time. Submission expectedRevision,previewId,digest,reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| EncashmentAvailability          | state Unavailable,code ConsumerContractMissing or PolicyNotConfigured,policyId?,configuredUnitLimits?,consumerAdmission:false,allowedActions[ConfigurePolicy only for authorized admin]. No amount/payment state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| OperationView / RecoveryCommand | Typed enrollment/account/run/exception projection with source revision, safe error code and reconciliation proof references; recovery expectedRevision,reason. Period close also previewId,digest; unresolved blocking work rejects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## STORAGE

Kysely lives in Leave infrastructure and maps SQL to safe DTOs. Domain owns pure
calculations/transitions; application owns transactions/ports. Source approval,
reservation/ledger and outbox changes are atomic. Use command receipts and
account/case locks from the physical TDD. Documents keeps blob ownership;
notifications carry only safe source references. Audit includes request/approval/
effect references and input/result digests without plaintext narrative. Worker
accrual/expiry has workload attribution; deferred human decisions retain actors.

## TESTS

Verify scheduled denominator, unpaid breaks, partial holidays, half-day midpoint,
hourly increment, rounding-per-day sum, legitimate fallback versus unavailable,
period/version boundary denial, disabled optional rules, Unpaid no-account/no-
reservation/no-posting, concurrent spend, withdraw/approve race, partial cancellation
retry, source slot independence, lost receipt recovery, comp-off duplicate/reversal
after consumption, and encashment unavailable/no payment endpoints. Test scope
changes on calendar counts and current field authorization on evidence opens.

## SUPPLEMENT

| DTO                                  | Definition                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VersionDraftCommand                  | sourceVersionId,expectedRevision,reason; creates a new policy Draft version preserving published source reference.                                                                                                             |
| ReasonCommand / RecoveryCommand      | expectedRevision,reason; operation chosen by exact route, no client desired-state override.                                                                                                                                    |
| PublishCommand                       | expectedRevision,previewId,digest,reason.                                                                                                                                                                                      |
| Preview                              | previewId,digest,state,inputRevisions,before,after,conflicts,expiresAt,operationId?; source and policy changes invalidate.                                                                                                     |
| PeriodCommand                        | expectedRevision,previewId,digest,reason; close only after unresolved counts are zero.                                                                                                                                         |
| PolicyOptions / LeaveOptions         | authorized leaveTypes/policyVersions/ownEmployments/periods with id,label,state and revision; LeaveOptions additionally describes eligible portions/increments and evidence requirement, never account rows or private fields. |
| EnrollmentView                       | id,revision,employmentId,policyVersionId,effectiveFrom,effectiveTo?,trackingMode,state,accountId? only Balance.                                                                                                                |
| ReservationView                      | id,sourceRequestId,workDate,units,state,revision.                                                                                                                                                                              |
| TeamOptions                          | authorized employmentId/displayName and permitted date-range metadata; no inferred out-of-scope counts.                                                                                                                        |
| ClaimView                            | id,revision,earningId,employmentId,units,state,approvalProgress,allowedActions.                                                                                                                                                |
| AdjustmentInput / ManualEarningInput | respective Draft schema excluding previewId,digest; preview never credits or reserves.                                                                                                                                         |
| CancellationInput                    | CancellationCommand excluding previewId,digest; eligible approved unreversed dates only.                                                                                                                                       |
| AttachmentCommand                    | expectedRevision,stagedBlobId; clean purpose/subject-bound evidence, classification server-derived.                                                                                                                            |
| DecisionReceipt                      | commandKey,inputDigest,caseId,slotId,generation,decisionId?,outcome,sourceRevision; current source read authority required.                                                                                                    |

GET /previews/{id} and GET /operations/{id} are shared domain routes guarded by
the originating app read permission and original subject scope; status contains
id,state,itemCounts,safeFailureCode,resultId? only. POST /evidence/staged and
GET /evidence/{id}/content invoke the Documents owner port under explicit
originating app evidence write/read permission and current subject/field scope.
Upload max10MiB, PDF/PNG/JPEG; clean status required to bind, no arbitrary blob read.
Medical classifications are server-derived, never selectable downwards.

LeavePolicyDraft additionally includes typed eligibilityRules with priority,
effect Include/Exclude and optional statutoryFloorReference, datedAssignments,
maximumRequestUnits?,bridgeRule None/CountIntervening,blackoutDates[],
allowOverlap:false,negativeBalanceAllowed:false,postingPoint OnApproval for the
current baseline. Unknown policy packs are unavailable. Typed matching follows
BUSINESS-RULES eligibility precedence; Exclude wins equal priority. Absence of a
required approval slot means configured immediate source completion, not timed
auto-approval; adjustment/manual comp-off always require an independent slot.
