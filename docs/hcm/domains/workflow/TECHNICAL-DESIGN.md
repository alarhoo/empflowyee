# Workflow — owning technical design

Status: approved, 2026-09-28, under [bounded delegated finalization](../../roadmap/HCM-3-DESIGN-APPROVAL.md).
The [common TDD](../../architecture/TDD-HCM-3-COMMON.md) defines transport,
authorization, forms, UX and worker mechanics. The [physical TDD](../../architecture/TDD-HCM-3-DATA-MODEL.md)
explicitly reconciles this domain's [logical facts](DATA-MODEL.md) with existing SQL.
Implementation remains planned. DTO names below are contract designs, not claims
that exported TypeScript types or endpoints already exist.

## ALGORITHM

The fixed source registry contains Leave and Attendance approval cases only,
schemaVersion1, actions Approve/Reject. Safe facts are subjectType, dateFrom,
dateTo, units (Leave) or qualifyingMilliseconds (Attendance), legalEntityId,
orgUnitId and sourceState. Types/operators are registered, never arbitrary
property paths: enum Equals/In, date Before/After/Equals, numeric GreaterThan/
GreaterOrEqual/LessThan/LessOrEqual/Equals. IDs allow Equals/In only within scope.
No private reasons, medical/evidence content, raw captures, Employee/HR Service/
Payroll or arbitrary-script adapter. Route codes resolve only approved source
app routes; no input URLs. Conditions cannot omit required source slots.

Compile draft into ordered stages/slots and immutable typed conditions/routes/
timer rules. Bounds are5stages,5slots per stage,20conditions per definition,
100candidates per slot. Reject overflow; never truncate. Source required slots
and distinctness constrain graph; HCM-3 source decisions are all-required/any-
reject, with no configurable threshold that weakens the source manifest. Preview
binds graph, registry version, source/config revisions and as-of; publication
consumes unchanged preview and creates nonoverlapping immutable effective version.
Existing instances retain their version; material source change invalidates old
generation rather than copying decisions. Deterministic digest prevents duplicates.

Task mode is Direct or CandidateOffer only. Direct target and reassignment must
be in the current source candidate set; offered tasks remain visible to current
candidates. First valid action wins under task/source case locks. There is no
claim/release/pool or delegation-creation endpoint. Candidate refresh rechecks
current authority and removes stale discovery. Reassignment before dispatch
retains history; ActionPending only reconciles its already issued intent.

Every inbox page/detail/action invokes current source discovery/field/action
authorization before row/count construction. A stored safe summary is not proof
of current read permission. Online action validates source/task revisions, current
session, explicit permission/scope, distinctness and reason; creates durable intent
then dispatches only through fixed source adapters. Source independently rechecks
and returns immutable receipt. Unknown stays ActionPending; Accepted alone permits
Completed. Denied/stale/closed refresh source truth without invented approval.

Coordination defaults: UTC due instant from accepted availableAt+48elapsed hours,
reminders+24/+48/+72hours (maximum3), escalation+72hours. Tenant may configure
positive due/escalation/reminder cadence and bounded reminder count; no production
SLO promise. Timer identity task/generation/rule/fire_number yields once-per-effect
delivery. At due/escalation recheck current task/source state and recipients.
No candidate creates immediate restricted exception, never hidden admin authority.
Escalation can notify current candidates/operations only, not auto-decide. Planner
cursor and worker recover missed time; timer completion is not source completion.

Operators investigate and query original keys, resynchronize mirrors/candidates
or replan valid timers. They cannot force-complete, alter source status or resend
unknown work with a new key. Resolving requires matching authoritative source and
coordination proof. AcceptedRisk is only a nonblocking warning, requires separate
independent review, reason and current permission. Unknown outcome, identity
mismatch and blocking drift cannot be accepted as risk.

## SCHEMAS

All contracts use shared scalar/envelope/error rules. Registry fact operands have
exactly one matching typed value; unknown keys/types fail transport validation.

| DTO                 | Exact business fields and validation                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SubjectContractView | source Leave/Attendance,schemaVersion:1,subjectTypes[],actions[Approve,Reject],factDefinitions[code,type,operators],routeCodes[],sensitivityCeiling Safe. Read-only product registry.                                                                                                                                                                                                                                                 |
| DefinitionDraft     | code,name,description?,source,schemaVersion,effectiveFrom,effectiveTo?,stages[ordinal,slots[code,sourceRequirementCode,mode Direct/CandidateOffer,candidateRuleCode]],conditions[factCode,operator,value],routes[conditionRefs,stageOrdinal,slotCode],timers{dueHours,firstReminderHours,repeatReminderHours,maxReminders,escalationHours}. Bounds5/5/20/100; route destinations existing, graph satisfiable, no freeform URL/script. |
| DefinitionPreview   | expectedRevision,sourceCaseIds[] -> previewId,digest,sourceRevisionSet,candidateCounts,noCandidateCodes,conflicts,inFlightImpactCount,expiresAt. Publish requires expectedRevision,previewId,digest,reason.                                                                                                                                                                                                                           |
| TaskView            | id,revision,source,caseId,sourceRevision,generation,stage,slotId,title,safeFacts,availableAt,dueAt,state,mode,allowedActions,registeredRouteCode,attemptId?. No private reason/evidence or invented claim status.                                                                                                                                                                                                                     |
| ActionCommand       | expectedRevision,expectedSourceRevision,expectedSubjectRevision,generation,action Approve/Reject,reason. Actor/session from authenticated context; route taskId and source slot retained in intent. Result attemptId,state ActionPending or accepted receipt,revision,statusUrl.                                                                                                                                                      |
| AttemptView         | id,taskId,state Pending/Unknown/Accepted/Denied/Stale/Conflict/CaseClosed,sourceReceiptId?,sourceRevision?,safeFailureCode,retryAfter?. Never disclose encrypted intent or session token.                                                                                                                                                                                                                                             |
| ReassignCommand     | expectedRevision,candidateAccountId,reason; currently authorized source candidate, pre-dispatch only. Reassignment is discovery, not delegation.                                                                                                                                                                                                                                                                                      |
| OperationView       | id,revision,source,instanceId?,taskId?,exceptionCode?,severity?,state,dueAt?,leaseState?,attemptCount?,sourceProofReference?,safeMetrics. No unrestricted case payload.                                                                                                                                                                                                                                                               |
| RecoveryCommand     | expectedRevision,reason; command route fixes investigate/query-source/resynchronize/refresh-candidates/replan-timers/resolve. Query-source always uses original dispatch key. Resolve requires server proof, not body status.                                                                                                                                                                                                         |
| RiskReviewCommand   | expectedRevision,reason,action Approve/Reject; separate authorized reviewer, not investigator/proposer; only nonblocking warning. Source decision is unchanged.                                                                                                                                                                                                                                                                       |

## STORAGE

Workflow infrastructure uses Kysely for its own rows only. Registry is typed
product code in the universal contract with database version reference; tenant
definitions and all work are RLS protected. Definition preview, immutable graph,
intake manifest and action digests are retained. Source versions are references,
not copied domain rows. Runtime outbox mechanics are reused, but Workflow owns
timers/dispatch/reconciliation state. Source receipts and events are append-only.
Sensitive action reason is encrypted and purpose-bound; notifications are safe
references. Audit records both requesting actor and worker execution correlation.

## TESTS

Compile bounds at and beyond5/5/20/100, reject arbitrary facts/actions/URLs, prove
required-source-slot preservation, immutable graph and stale preview, Direct/
CandidateOffer races, reassignment authorization/revocation, no claim/delegation
routes, cross-tenant source reference, hidden counts, expired session before
dispatch, source accepted then lost response, duplicate/mismatched receipt,
direct-screen versus inbox race, no-candidate immediate exception, three reminder
identities, restart catchup, stale timer generation, no auto-approve, restricted
recovery, independent risk review and blocking-warning rejection. These are test
plans; real worker/source/database acceptance is required during implementation.

## SUPPLEMENT

| DTO                             | Definition                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VersionDraftCommand             | sourceVersionId,expectedRevision,reason; copy current graph to a new Draft, never mutate a published version.                                             |
| ReasonCommand / RecoveryCommand | expectedRevision,reason; route fixes operation.                                                                                                           |
| PublishCommand                  | expectedRevision,previewId,digest,reason.                                                                                                                 |
| Preview                         | DefinitionPreview result: previewId,digest,state,sourceRevisionSet,candidateCounts,noCandidateCodes,conflicts,inFlightImpactCount,expiresAt,operationId?. |

GET /previews/{id} and GET /operations/{id} use originating app read grant plus
current source scope; bounded status is id,state,itemCounts,safeFailureCode,
resultId?. No blob upload or source evidence opening endpoint exists in Workflow.
Deep links reauthorize in the source app. Registry safe fact comparison uses exact
decimal/rational arithmetic and bounded typed arrays; operators do not evaluate
freeform expressions. Configuration validates positive due/cadence/escalation
hours and maxReminders as a nonnegative safe integer, default 3. The reminder
count is configurable coordination policy, not a fixed production SLO. Worker
budgets bound each drain without truncating planned reminders. Changing config never alters
an already accepted instance's timer basis.
