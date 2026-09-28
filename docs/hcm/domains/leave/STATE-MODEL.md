# Leave — State Models

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

State transitions are domain commands, not direct status updates. Every command
sets tenant context, checks permission/scope/entitlement, expected version,
policy and state; persists aggregate, ledger/outbox/audit evidence atomically;
and returns the existing durable result when an idempotency key is replayed.

## `PolicyAndEnrollment`

### Policy version

`Draft → Published → Retired`. Draft may be edited/deleted only if never
published. Publish requires a complete typed-rule set, non-overlapping effective
range, impact preview, current session, publication permission/scope, reason and audit. Published content is immutable;
retirement does not erase historical enrollment/calculation references.

Impact preview: `Running → Ready → Consumed` with alternatives `Failed` and
`Expired`. Publish atomically requires a Ready, unexpired preview whose source
versions and digest still match, then marks it Consumed. Preview never mutates
policy, enrollment or balance.

### Leave period

`Planned → Open → Closing → Closed`. Closing blocks new ordinary runs and
requires pending-run/reservation/ledger reconciliation. Carry-forward and expiry
post during Closing. Closed is terminal; late correction uses a governed
adjustment in an allowed current period.

### Worker enrollment

`Pending → Active → Suspended → Ended`.

| Transition                       | Guard                                                                       | Side effect                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Pending → Active                 | eligible employment/published policy/open period; no conflicting enrollment | create account and applicable entitlement/grant command                     |
| Active → Suspended               | temporary employment/policy condition with preserved history                | block new request; retain existing obligations                              |
| Suspended → Active               | eligibility restored and period open                                        | recompute future accrual schedule                                           |
| Pending/Active/Suspended → Ended | eligibility/employment/period ended                                         | release invalid open reservations through subject commands; preserve ledger |

Re-evaluation uses and never changes an enrollment's policy version
in place; a new effective enrollment is created.

## `LeaveRequestAndCancellation`

### Leave request

`Draft → Submitted → PendingApproval → Approved → InProgress → Completed` with
terminal alternatives `Rejected`, `Withdrawn` and `Cancelled`.
`Approved → CancelPending → Approved/Cancelled` supports governed cancellation.

| Command            | From                            | To                   | Guard/side effect                                                              |
| ------------------ | ------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| Submit             | Draft                           | Submitted            | recalculates and atomically reserves units                                     |
| Route              | Submitted                       | PendingApproval      | required approval case opened; otherwise approve/post per policy               |
| Decide approve     | PendingApproval                 | Approved             | all required stages approved; reservation remains/consumes at posting point    |
| Decide reject      | PendingApproval                 | Rejected             | decision durable; reservation released                                         |
| Withdraw           | Draft/Submitted/PendingApproval | Withdrawn            | allowed window; active case cancelled and reservation released                 |
| Start/complete     | Approved/InProgress             | InProgress/Completed | local-date worker; posts consumption exactly once at configured point          |
| Request cancel     | Approved/InProgress/Completed   | CancelPending        | eligible date range and units; cancellation aggregate/case created             |
| Apply cancellation | CancelPending                   | Approved/Cancelled   | target day postings reversed; partial remains Approved/Completed as applicable |

Material edit after submission is not an in-place transition: it creates a new
calculation/request version, invalidates decisions and reroutes. The original
decision evidence survives.

### Cancellation request

`Draft → Submitted → PendingApproval → Approved → Applied` with alternatives
`Rejected`, `Withdrawn` and `Failed`. Approved apply is idempotent. Failed is
recoverable only if no conflicting ledger result exists .

## `ApprovalCase`

`Pending → Approved | Rejected | Cancelled | Invalidated`.

- Pending accepts one immutable decision per required stage/slot.
- Approval advances `CurrentStageNumber` only after every required current-stage
  slot is approved; the final stage approves the subject.
- Any rejection rejects the case/subject and releases applicable reservation.
- Withdrawal/cancellation cancels the case.
- material subject change, lost routing basis or stale policy invalidates it;
  reroute creates a new case, never reuses decisions.
- each decision transaction rechecks authority, request version,
  maker-checker and reservation. Workflow task state has no write authority
  here.

Reminder, escalation and delegation are authority events inside `Pending`; none
of them is a state transition:

| Event                         | Effect                                                                                          | Never                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Reminder due                  | notification only, bounded repeats                                                              | change slot, case or subject state           |
| Escalation due                | adds an eligible authority to the same open slot and records the escalation in routing evidence | approve, reject, reopen or duplicate a case  |
| Slot holder vacant/conflicted | authority walks up the reporting chain, then to the administration exception queue              | auto-approve or silently drop the obligation |
| Delegation expires            | delegated decide attempts deny with `P12_APPROVER_NOT_AUTHORIZED`                               | invalidate an already durable decision       |

## `ReservationAndPosting`

Reservation: `Active → Consumed | Released | Expired`.

- create Active only while the account row is locked and available balance
  remains within the policy floor;
- Consume and related transaction/account update are atomic;
- Release requires rejection, withdrawal, cancellation, invalidation or proven
  terminal failure;
- Expire is a guarded recovery action, never elapsed-time-only guessing.

Transaction rows have no mutable lifecycle. A successful post appends once with
the next account sequence and advances the projection. Correction appends a
linked reversal/adjustment. supplies locking and reconciliation.

The consumption point is the published `ConsumptionPostingPoint`. India-v1 seeds
`OnApproval`: the final approval consumes the reservation and posts each
eligible request day in the same transaction, so no reservation is held for a
future-dated leave. `OnLeaveDayStart` and `OnLeaveDayEnd` keep the reservation
active until a local-date worker posts the day. Cancellation reverses only
posted days; withdrawal before posting only releases.

## `Accrual`

Run: `Planned → Running → Completed | CompletedWithErrors | Failed | Cancelled`.

Item: `Pending → Processing → Posted | Skipped | Failed`.

Workers claim items with lease/fencing. Posted is terminal and references the
transaction. Failed may return to Processing on bounded retry using the same
idempotency key. A run is Completed only when all items are Posted/Skipped;
CompletedWithErrors retains terminal/manual failures. Cancelled blocks new
claims but lets an already posted item remain posted. See [current technical design](TECHNICAL-DESIGN.md).

## `CompOff`

Earning: `PendingClaim → PendingValidation → Available → PartlyUsed → Consumed`,
with `Expired`, `Rejected` and `Reversed` alternatives.

Credit request: `Draft → Submitted → PendingApproval → Approved → Posted`, with
`Rejected`, `Withdrawn` and recoverable `Failed`.

Evidence uniqueness is checked before PendingClaim. Approval posts credit once
and moves earning to Available. Consumption changes remaining units via ledger
sources; expiry posts the unused reversal/expiry effect. Evidence invalidation
after use creates a restricted exception—never deletes history .

An earning left in PendingClaim past the published `ClaimWindowDays` moves to
Expired without a credit; only a governed manual earning can revive it. An
Available or PartlyUsed earning expires at the published expiry basis, posting
an `Expiry` transaction for its remaining units only.

## `Encashment`

Request:
`Draft → Submitted → PendingApproval → Approved → HandoffPending → Accepted → Paid`
with alternatives `Rejected`, `Withdrawn`, `Failed` and `Cancelled`.

Handoff: `Pending → Sent → Accepted → Paid` with `Rejected` or recoverable
`Failed`.

Submit reserves units. Rejection/withdrawal releases. Approved creates one
handoff. Accepted consumes the reservation/posts the unit debit according to the
target contract; Paid records target evidence only. Ambiguous timeout stays
HandoffPending/Failed until reconciliation proves target state. No local salary
or payment computation occurs .

## `Adjustment`

`Draft → Submitted → PendingApproval → Approved → Posted` with `Rejected`,
`Withdrawn` and recoverable `Failed`.

Non-zero units, reason and evidence are required. Requester cannot fill an
independent slot. Posting appends one Adjustment transaction under account lock.
Changing amount/account/effective date after submit invalidates the approval
case. Existing ledger rows are never updated .

## `EvidenceRetention`

Attachment evidence: `Retained → Disposed`.

- Retained is the only state in which Documents bytes are reachable, and only
  through the classified authorization path.
- Disposed is terminal and write-once. It requires the applicable retention
  class to be due, no legal hold, no active reservation, no pending case and no
  unresolved handoff for the subject.
- Disposal deletes the Documents bytes and stamps `DisposedAt`. The attachment
  row, its class and its Audit evidence survive, and authorization stays
  existence-hiding so a disposed document is indistinguishable from one the
  viewer may not see.
- Reason, comment, eligibility and routing snapshots are crypto-erased on the
  same schedule; request, decision and ledger rows are anonymized, never deleted
  .

## Common failure projection

| Condition                             | Domain result                                      | Retry                                    |
| ------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| Expected version differs              | `P12_STALE_VERSION` with current safe version      | Client refresh/review                    |
| Idempotency key same input            | Existing durable command result                    | Safe                                     |
| Idempotency key different input       | `P12_IDEMPOTENCY_CONFLICT`                         | No; new key after review                 |
| Policy/schedule/holiday input missing | `P12_CALCULATION_INPUT_UNAVAILABLE`                | After dependency recovery                |
| Available balance changed             | `P12_INSUFFICIENT_AVAILABLE_BALANCE`               | Re-preview/review                        |
| Decision authority changed            | `P12_APPROVER_NOT_AUTHORIZED`; case may invalidate | Reroute, not blind retry                 |
| Ledger source already posted          | Existing transaction/account result                | Safe success                             |
| Ledger source conflicts               | Restricted reconciliation exception                | Manual investigation                     |
| Handoff target timeout                | Unknown/failed handoff; no guessed callback        | Reconcile by idempotency/reference       |
| Dates cross period/version boundary   | `P12_REQUEST_SPANS_PERIOD_BOUNDARY`                | Split by the employee, never server-side |
| Dates outside backdate/advance window | `P12_REQUEST_OUTSIDE_DATE_WINDOW`                  | On-behalf correction under policy        |

No failed command exposes hidden policy, another worker, full evidence reference
or restricted diagnostics.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.

Unpaid LOP enrollments track request/approval units without a balance account,
reservation or ledger debit/credit. Rules concerning reservations, posting and
allocations apply only to Balance tracking. Encashment contracts/configuration
are admitted; submission, external handoff and payment are disabled.
