# Attendance & Work Schedule — State Models

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

Transitions are domain commands, not direct status updates. Every command sets
tenant context; checks principal/source, entitlement, permission, one scope,
state, expected version and policy; persists aggregate/result, outbox and audit
atomically; and returns the existing durable result when an idempotency key is
replayed with identical normalized input.

## `TimeConfiguration`

Schedule, shift, holiday-calendar and attendance-policy versions share:
`Draft → Published → Retired`.

| Transition          | Actor/permission                                        | Guards                                                                                                                                                 | Persisted result and side effects                                       |
| ------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Create/edit Draft   | Policy administrator / matching draft-manage permission | Typed ranges/segments/rules, expected version, entitlement limits                                                                                      | Draft/version increment and audit; no worker result changes             |
| Draft → Published   | Authorized publisher / matching publish permission      | Complete valid draft, matching impact digest/source versions, non-overlap, current session, permission/scope, reason/audit and configured independence | Immutable Published version, outbox/config epoch, affected-workday jobs |
| Published → Retired | Authorized publisher                                    | Replacement/consumer impact understood; no history deletion                                                                                            | Selection ends for new dates; historical references remain              |

Published content cannot return to Draft, update or delete. A correction creates
a new Draft with `Supersedes...Id`. Effective assignments are separately
version-checked commands. A scoped assignment requires exactly one scope target;
equal-specificity/priority overlap is rejected. Ending/superseding an assignment
re-resolves only authorized open/future dates unless controlled reopen applies.
See and.

## `RosterAndOverride`

Roster: `Draft → PendingApproval → Published`, with `Rejected`, `Cancelled` and
`Superseded` alternatives.

| Command                 | From → To                         | Guards/transaction                                                                        | Side effects                                                         |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Edit/copy/bulk validate | Draft → Draft                     | planning scope, employment/date, published shift, overlap/rest/coverage, expected version | per-entry result and new impact digest                               |
| Submit                  | Draft → PendingApproval           | stable matching preview; required approval route                                          | domain case/task outbox; draft becomes read-only except withdraw     |
| Auto-publish            | Draft → Published                 | policy permits; matching preview and publisher permission                                 | entries Published, workday invalidation jobs, employee notifications |
| Decide approve          | PendingApproval → Published       | final required case decision and current planner/subject/version checks                   | same atomic publication effects                                      |
| Decide reject           | PendingApproval → Rejected        | current decision authority                                                                | immutable decision/outbox; no workday selection                      |
| Cancel                  | Draft/PendingApproval → Cancelled | no Published entries selected                                                             | pending case cancelled and draft retained as evidence                |
| Supersede               | Published → Superseded            | a new Published roster explicitly replaces range/subjects                                 | affected workdays re-resolve; old communication retained             |

Published roster entries are immutable. A partial material change is a new
roster/version containing its full authoritative replacement scope, not an edit.

Schedule override: `Draft → Approved → Superseded | Cancelled`. Approval may be
automatic only under policy and exact override permission. Once selected by a
locked attendance day, cancellation/supersession produces a late exception or
controlled adjustment; it never rewrites the locked source. See [current technical design](TECHNICAL-DESIGN.md).

## `CaptureAndImport`

### Capture source

`Draft → Active → Suspended → Active`, and
`Draft | Active | Suspended → Retired`. Retired is terminal. Activation requires
configured type/location/provider, valid Identity Access credential where applicable,
allowed assertions and successful connection/signature check.
Suspension/revocation takes effect before new event authorization and does not
alter historical events.

### Attendance event ingestion

An attendance event is inserted once with terminal ingestion outcome `Accepted`,
`PendingReview` or `Rejected`. Its source/subject/key, occurred/received
instant, timezone/offset and assertion facts do not transition. A later governed
correction adds a superseding event or applied exclusion item; it does not
update the raw envelope.

| Condition                                                    | Outcome                                                  |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| New valid source key/payload                                 | Insert one event with policy outcome and outbox          |
| Replay same source key/digest                                | Return existing durable event/outcome                    |
| Same source key, different digest                            | `P13_IDEMPOTENCY_CONFLICT`; quarantine/security evidence |
| Revoked/suspended source or wrong credential                 | Existence-hiding denial; no event                        |
| Valid but review-triggering location/offline/order assertion | `PendingReview` plus anomaly/calculation job             |

### Import batch and row

Batch:
`Received → Validating → Processing → Completed | CompletedWithErrors | Failed | Cancelled`.
Row: `Pending → Processing → Accepted | Rejected | Failed`.

Rows use lease/fencing and source event idempotency. Accepted/Rejected are
terminal; recoverable Failed may return to Processing with the same key/digest.
Batch status is derived from terminal row outcomes. Cancellation stops new
claims and never removes accepted events. See [current technical design](TECHNICAL-DESIGN.md).

## `CalculationAndAnomaly`

Calculation run:
`Planned → Running → Completed | CompletedWithErrors | Failed | Cancelled`.
Item: `Pending → Processing → Calculated | Skipped | Failed`.

Workers claim item with lease/fencing, fix a PublishedWorkday and normalized
event/leave/correction input digest, pair sessions and atomically create the
AttendanceDay revision, sessions, anomalies and outbox. `Calculated` is terminal
for that item/digest. Retry returns the existing result. Recalculation creates a
new item/result revision, marks the old day `Superseded` and never updates old
sessions. A period lock blocks ordinary new current revisions.

Attendance day progression is
`Calculated → PendingApproval → Approved → Locked`, with `Exception` and
`Superseded` alternatives:

- Calculated with blocking pairing/input anomaly becomes Exception or remains
  Calculated under explicit policy; it cannot silently be Approved.
- required overtime/correction routing moves the current result/subject to
  PendingApproval. Final decision produces Approved or a new recalculated result
  with non-approved classification as specified.
- an Approved current day becomes Locked only through its period transaction;
  all inputs/results referenced by lock digest are frozen.
- an open-period material input change creates a new revision and Supersedes the
  old result. Locked changes use reopen/adjustment.

Anomaly: `Open → Acknowledged → Resolved`, or `Open | Acknowledged → Waived`.
Resolved/Waived is terminal for that calculation revision. New calculation may
produce a new anomaly; it does not reopen the old row. Blocking waiver requires
the configured approval/SoD. See [current technical design](TECHNICAL-DESIGN.md).

## `CorrectionAndAdjustment`

Correction request:
`Draft → Submitted → PendingApproval → Approved → Applying → Applied`, with
`Rejected`, `Withdrawn`, `Failed` and `Invalidated` alternatives.

| Command            | From → To                                        | Guard/side effect                                                                           |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Submit             | Draft → Submitted                                | typed items/reason/evidence, correction window, expected subject version and preview digest |
| Route/auto-approve | Submitted → PendingApproval/Approved             | policy snapshot and case, or authorized auto path                                           |
| Decide             | PendingApproval → Approved/Rejected              | current authority and subject/period recheck                                                |
| Withdraw           | Draft/Submitted/PendingApproval → Withdrawn      | requester/window; pending case cancelled                                                    |
| Apply              | Approved → Applying → Applied                    | append superseding event/applied disposition exactly once; calculate new revision           |
| Recover            | Failed → Applying                                | prove no existing applied event/revision conflict; same idempotency key                     |
| Invalidate         | Submitted/PendingApproval/Approved → Invalidated | material subject/config/period change; case invalidated, reroute requires new version       |

Adjustment request: `Draft → Submitted → PendingApproval → Approved → Applied`,
with `Rejected`, `Withdrawn`, `Failed` and `Invalidated`. Non-zero delta,
classification, reason and evidence are mandatory. Maker cannot satisfy
independent checker. Apply adds the delta to a new approved result/evidence
basis; it never updates an old total. A locked-day adjustment follows
period/downstream delta rules. See and.

## `ApprovalCase`

`Pending → Approved | Rejected | Cancelled | Invalidated`.

- Pending accepts one immutable decision per required stage/slot.
- Approval advances stage only after every required current-stage slot approves;
  final approval invokes the subject command atomically or by an idempotent
  outbox continuation as contract specifies.
- any rejection rejects the case and subject under the subject state contract;
- withdrawal/cancellation cancels the case;
- material subject/config/result/period/authority-routing basis change
  invalidates it; reroute creates a new case and never reuses old decisions;
- decide rechecks exact function, one current scope grant, manager/delegation or
  function source, self/maker-checker, session validity, slot and subject version.

Workflow may mirror the case as tasks and send a signed/idempotent decide
command. Task state has no direct Attendance write authority. See [current technical design](TECHNICAL-DESIGN.md).

## `Period`

`Planned → Open → Closing → Locked`, with controlled
`Locked → Reopened → Closing → Locked`.

| Transition         | Guard                                                                                                                                                   | Transaction/side effect                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Planned → Open     | no overlapping organization period; configuration coverage known                                                                                        | allow ordinary calculation/correction                                                             |
| Open → Closing     | close permission, expected version                                                                                                                      | block new ordinary run planning; finish existing items                                            |
| Closing → Locked   | no unresolved blocking input/event/anomaly, failed run item, pending approval/evidence or unacknowledged required output; reconciliation digest matches | append immutable period lock, point period to it, lock current days and publish downstream outbox |
| Closing → Open     | lock attempt cancelled before downstream publication                                                                                                    | record reason; ordinary operation resumes                                                         |
| Locked → Reopened  | explicit reopen permission/approval, reason/evidence, downstream impact/acknowledgement plan                                                            | supersede old lock with reopen evidence; open approved scope and create correction-delta plan     |
| Reopened → Closing | approved late work complete                                                                                                                             | reconcile old/new/delta basis; relock appends the next lock number                                |

Lock is not elapsed-time automation alone. An ambiguous downstream handoff
blocks final success or remains a named exception according to the ratified
consumer contract. See [current technical design](TECHNICAL-DESIGN.md).

## `WorkEvidence`

`Pending → Published → Acknowledged`, with `Rejected` and `Superseded`
alternatives. A reversal is a new WorkEvidence row of type `Reversal`, linked to
one prior item, and follows the same lifecycle.

- create Pending only from an Approved/Locked calculation appropriate to the
  purpose and unique evidence basis;
- publish signs/version-envelopes the minimum consumer payload and uses the row
  idempotency key;
- authenticated duplicate acknowledgement returns existing outcome; mismatched
  consumer/payload/reference is rejected and quarantined;
- correction never changes Published/Acknowledged content. It creates linked
  reversal and, where applicable, replacement evidence;
- CompOff evidence contains employment/date/exact and approved qualifying
  minutes plus calculation/version reference. It contains no leave units;
- Payroll evidence contains locked classified minutes/reference only. It
  contains no rate, amount, currency, tax or payment status.

See [current technical design](TECHNICAL-DESIGN.md).

## Common failure projection

| Condition                                 | Domain result                                      | Retry/recovery                             |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| Expected version differs                  | `P13_STALE_VERSION` with safe current version      | Refresh/review, never blind retry          |
| Idempotency key same normalized input     | Existing durable command result                    | Safe success                               |
| Idempotency key different input           | `P13_IDEMPOTENCY_CONFLICT`                         | New key only after review                  |
| Source unavailable/revoked                | `P13_CAPTURE_SOURCE_UNAVAILABLE`                   | After authorized recovery/rotation         |
| Schedule/calendar/policy conflict/missing | `P13_WORKDAY_INPUT_MISSING/CONFLICT`               | Correct/publish configuration; recalculate |
| Ambiguous event pairing                   | `P13_EVENT_PAIRING_AMBIGUOUS` and anomaly          | Correction/review, no guessed session      |
| Decision authority changed                | `P13_APPROVER_NOT_AUTHORIZED`; case may invalidate | Reroute, not blind retry                   |
| Period locked                             | `P13_PERIOD_LOCKED`                                | Approved adjustment/reopen path            |
| Existing calculation/evidence matches     | Existing result/evidence                           | Safe success                               |
| Existing basis conflicts                  | Restricted reconciliation exception                | Manual investigation                       |
| Consumer timeout                          | Pending/failed unknown outcome                     | Query/reconcile by idempotency/reference   |

No failure response exposes another employment, hidden configuration, precise
location, source-security assertion, private narrative or restricted diagnostic.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
