# Workflow & Approvals — State Models

Current-release applicability: the [approved decisions](../../roadmap/HCM-3-DECISIONS.md#decisions) and [owning technical design](TECHNICAL-DESIGN.md) explicitly exclude future logical entities/transitions for offline/device/geofence capture, auto-close, pooled claim/release, delegation creation, new step-up and encashment payment/handoff. Broader logical state/table catalogues below are not permission to implement those capabilities. Physical identity and exact-duration mappings are specified by the SQL TDD; Unpaid tracking is an explicit exception to account/reservation transitions.

These are coordination transitions, never direct source-domain status updates.
Every command sets tenant context; authenticates user/workload; checks
entitlement, function, one grant's scope, source contract, expected versions and
idempotency; writes aggregate/outbox/task-event/audit correlation atomically;
and returns the existing result for same-key/same-input replay.

## `Definition`

### Definition version

`Draft → Published → Retired`.

| From        | To          | Actor/permission                                           | Guard and transaction                                                                                                                                 | Side effects/contracts/tests                               |
| ----------- | ----------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| —           | `Draft`     | Process administrator / `WORKFLOW_DEFINITION_DRAFT_MANAGE` | Active registered subject type; code/version unique; entitled scope                                                                                   | Empty draft graph;;                                        |
| `Draft`     | `Draft`     | Process administrator / draft manage                       | Expected version; registered facts/actions/routes; valid typed edits                                                                                  | Recompute draft digest;, `002`                             |
| `Draft`     | `Published` | Publisher / `WORKFLOW_DEFINITION_PUBLISH`                  | Current authenticated session; matching Ready unexpired preview/digest; complete satisfiable graph; non-overlap; optional author/publisher separation | Freeze graph, consume preview, emit publish/audit;; –`005` |
| `Published` | `Retired`   | Publisher / definition publish                             | Expected version; retirement effective date does not rewrite open instances                                                                           | Stop future selection; event/audit;                        |

Published/Retired graph rows cannot be updated or deleted. A correction creates
a new Draft with `SupersedesWorkflowDefinitionVersionId`.

### Impact preview

`Running → Ready → Consumed`, with `Failed` and `Expired` alternatives.

- Start fixes definition digest, subject-contract/configuration versions,
  as-of/candidate input cursor and expiry.
- Worker lease/fence evaluates all items and records aggregate no-candidate,
  invalid-route and in-flight impact. Restricted drill-through is derived.
- Any changed digest/config/source cursor makes the preview stale. Publish alone
  atomically moves matching Ready to Consumed.
- Failed can be retried as a new preview; Expired/Consumed are terminal.

## `Instance`

`Open → Completed | Cancelled | Invalidated | Failed`.

| From   | To            | Actor/command                      | Guard and transaction                                                                                                                | Side effects/contracts/tests                                           |
| ------ | ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| —      | `Open`        | Registered source / OpenWorkflow   | Source case/subject/contract/version authenticated; accepted manifest digest; no current open generation; same key/input replay-safe | Create facts/stages/tasks/candidates/timers/outbox atomically;; –`010` |
| `Open` | `Open`        | Source / SynchronizeWorkflow       | Expected workflow/source version; non-material safe projection update only                                                           | Advance version/display; append event;                                 |
| `Open` | `Completed`   | Receipt/projector                  | Authenticated source result/state says case completed and every active task reconciled                                               | Cancel live timers/tasks not needed; completion event;;                |
| `Open` | `Cancelled`   | Registered source / CancelWorkflow | Source case cancelled/closed; expected source version/idempotency                                                                    | Cancel nonterminal tasks/timers; retain evidence;                      |
| `Open` | `Invalidated` | Source / InvalidateWorkflow        | Material subject/manifest/routing-basis change or explicit source invalidation                                                       | Invalidate tasks/timers; new generation uses new Open command/key;     |
| `Open` | `Failed`      | Intake/reconciliation              | Unrecoverable contract/graph/source identity inconsistency proven; no action accepted                                                | Restricted blocking exception/alert;                                   |

Completed, Cancelled and Invalidated are terminal mirrors. They are never
reopened. Failed may be repaired only by resynchronizing proof into a new
generation or cancelling the proven orphan; no status flip preserves the old
generation as actionable.

## `Stage`

`Blocked → Active → Completed | Rejected`, with `Cancelled` and `Invalidated`
terminal alternatives.

| From               | To                    | Actor/command            | Guard/effect                                                                              | Side effects/contracts/tests                                                          |
| ------------------ | --------------------- | ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| —                  | `Active` or `Blocked` | Intake                   | Accepted manifest; first included stage Active, later included stages Blocked             | Create slot tasks; only Active tasks available;                                       |
| `Blocked`          | `Active`              | Source receipt/projector | Authenticated source case version authorizes exact next stage; prior stage result matches | Activate tasks/candidates/timers atomically;, `007`;                                  |
| `Active`           | `Completed`           | Source receipt/projector | Source accepted action/result and reports stage complete for expected generation          | Close/cancel remaining optional tasks/timers; request/await next source state;, `025` |
| `Active`           | `Rejected`            | Source receipt/projector | Source accepted rejection and reports stage/case rejected                                 | Cancel other stage/later tasks/timers;                                                |
| `Blocked`/`Active` | `Cancelled`           | Instance cancellation    | Authoritative source cancelled/closed case                                                | Terminal child transition;                                                            |
| `Blocked`/`Active` | `Invalidated`         | Instance invalidation    | Material source/manifest version change                                                   | Terminal child transition;                                                            |

Workflow completion thresholds help coordinate tasks and validate the manifest,
but never authorize Active/Completed/Rejected without an authenticated source
version/result (, `007`).

## `Task`

`Blocked → Ready → Claimed → ActionPending → Completed` with terminal
`Cancelled`, `Invalidated`, `Expired` and recoverable `Failed`. A Ready task may
go directly to `ActionPending` for direct/candidate-offer action where claim is
not required.

| Command           | From                        | To                        | Guard and transaction                                                                                                    | Side effects/contracts/tests                                                                               |
| ----------------- | --------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Activate          | `Blocked`                   | `Ready`                   | Parent stage Active; candidates resolved or explicit no-candidate behavior applied                                       | Schedule timers, task event/notify;, `008`;, `015`, `028`                                                  |
| Claim             | `Ready`                     | `Claimed`                 | ClaimFromPool; active candidate; current read/claim/source eligibility; expected version                                 | One active assignment; event;;                                                                             |
| Release           | `Claimed`                   | `Ready`                   | Active assignee or authorized operations action; no dispatch pending                                                     | End assignment; keep candidate/event;                                                                      |
| Begin action      | `Ready`/`Claimed`           | `ActionPending`           | Exact actor/task/slot/action; current source authority/session validity; expected versions; idempotent attempt persisted | Dispatch outbox; pause/cancel conflicting timers as configured;, `007`; –`023`                             |
| Confirm accepted  | `ActionPending`             | `Completed`               | Matching authenticated source receipt Accepted for this attempt/generation                                               | Complete assignment, cancel timers, event/notification;                                                    |
| Confirm nonaccept | `ActionPending`             | `Ready`/`Claimed`         | Denied/stale/conflict/retryable result and source says task remains actionable                                           | End attempt with safe result; refresh candidates/version as required;, `025`                               |
| Cancel/invalidate | Any nonterminal             | `Cancelled`/`Invalidated` | Matching authoritative instance/source transition                                                                        | End assignment/timers; retain attempts/events;, `013`                                                      |
| Expire            | `Ready`/`Claimed`           | `Expired`                 | Published policy allows expiry and source adapter accepts expiry/case result                                             | Source-confirmed terminal only;                                                                            |
| Fail              | `Blocked`/`Ready`/`Claimed` | `Failed`                  | Unrecoverable routing/contract error with no pending action                                                              | Exception/operations queue; repair may create new candidate/task generation, not direct completion;, `036` |

Overdue is derived from `DueAt`; it is not a task status. A source timeout keeps
`ActionPending`, never returns the task to Ready for a second action.

## `Assignment`

`Active → Released | Completed | Revoked`.

| Transition             | Guard/effect                                                                                                               | Tests   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------- |
| — → `Active`           | Direct/reassignment candidate is active, or claim actor is active candidate; task lock/version; no other Active assignment | , `019` |
| `Active` → `Released`  | Assignee/authorized operator releases before action dispatch; reason retained                                              |         |
| `Active` → `Completed` | Matching task receives accepted source result                                                                              |         |
| `Active` → `Revoked`   | Candidate/account/authority expires, source invalidates, or authorized reroute; reason retained                            | , `018` |

Ended assignments never reactivate. Candidate refresh creates a later assignment
only when the published assignment mode and routing rule permit it. Revoking an
assignment while its action is pending does not cancel the dispatch; the source
result is reconciled.

## `ActionDelivery`

### Action attempt

`Accepted → Dispatching → Confirmed | Rejected | Failed | Unknown`.

- Accepted is written after full interactive/source preflight and binds actor,
  task/slot/action, authority reference, session validity, expected source version,
  normalized digest and idempotency key .
- Dispatching starts when the transactional outbox creates/claims its one
  dispatch. Same-key replay returns this attempt.
- Confirmed requires an authenticated `Accepted` source receipt.
- Rejected projects `Denied`, `Stale`, `Conflict` or `CaseClosed` source result;
  the safe next state is driven by source synchronization.
- Failed is only a proven terminal/non-ambiguous failure. Unknown means delivery
  may have occurred and must be queried by the same key.

### Dispatch

`Pending → Sent → Acknowledged`, with `Failed`, `Unknown` and `DeadLetter`.

| Transition                        | Guard/effect                                                                                    | Tests   |
| --------------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| — → `Pending`                     | One per Accepted attempt; signed envelope digest/audience/version/key fixed                     |         |
| `Pending`/`Failed` → `Sent`       | Claimed with lease/fence; compatible healthy adapter; same key/command                          |         |
| `Sent` → `Acknowledged`           | Verified source receipt persisted uniquely; attempt/task projection in same consume transaction |         |
| `Sent` → `Unknown`                | Timeout/connection loss after possible delivery                                                 |         |
| `Pending`/`Sent` → `Failed`       | Proven pre-delivery/retryable failure                                                           |         |
| `Failed`/`Unknown` → `DeadLetter` | Bounded policy exhausted with no accepted proof; blocking exception remains                     | , `036` |

An Unknown dispatch can move to Acknowledged after query-by-key. It cannot be
resent under a new key. Receipts are immutable and unique by dispatch/source
event; duplicates return the durable projection.

## `Timer`

`Scheduled → Processing → Fired`, with `Cancelled` and recoverable `Failed`.

| Transition                          | Guard/effect                                                              | Tests   |
| ----------------------------------- | ------------------------------------------------------------------------- | ------- |
| — → `Scheduled`                     | Task activated; due instant derived from retained basis/calendar/rule     | , `028` |
| `Scheduled`/`Failed` → `Processing` | Due/retry time reached; task still eligible; lease/fencing claim          |         |
| `Processing` → `Fired`              | Allow-listed effect and outbox/task event written with business fire key  | , `030` |
| `Processing` → `Failed`             | Classified retryable effect failure; next attempt bounded                 |         |
| `Scheduled`/`Failed` → `Cancelled`  | Task/stage/instance terminal or rule no longer applies to this generation | , `024` |

Repeating reminder rules create/schedule the next fire only while below maximum
count and task remains eligible. Escalation can add candidates/reassign/notify/
queue or send a source expiry request; it never creates authority or marks a
task complete .

## `Reconciliation`

Exception: `Open → Investigating → Resolved | AcceptedRisk`.

| From                   | To              | Actor/permission                               | Guard/effect                                                                                    | Tests  |
| ---------------------- | --------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| —                      | `Open`          | Reconciler                                     | Durable source/workflow/delivery/timer comparison found drift; deduplicate finding              | –`036` |
| `Open`                 | `Investigating` | Operator / `WORKFLOW_OPERATIONS_READ`          | Claim assignment; no state repair implied                                                       |        |
| `Open`/`Investigating` | `Resolved`      | Worker/operator with exact recovery permission | Authenticated source proof and post-repair invariant/digest agree                               | –`038` |
| `Open`/`Investigating` | `AcceptedRisk`  | Independent authorized accepter                | Warning only; current session/permission/scope/reason/audit; expiry/review date external policy |        |

Unknown action outcome, cross-tenant/identity inconsistency and blocking source
state drift cannot be AcceptedRisk. Resolution may resync/cancel the workflow
mirror, retry/query the same dispatch, refresh candidates or repair a timer. It
may never edit source domain state or fabricate a receipt .

## Common failure projection

| Condition                               | Result                                                  | Retry/recovery                               |
| --------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Task or source expected version differs | `P14_STALE_TASK_VERSION` / `P14_STALE_SOURCE_VERSION`   | Refresh/resynchronize and human review       |
| Same idempotency key/input              | Existing durable instance/attempt/dispatch/timer effect | Safe                                         |
| Same key/different input                | `P14_IDEMPOTENCY_CONFLICT`                              | No; new legitimate command only after review |
| Current authority missing               | Existence-hiding `P14_ACTION_NOT_AUTHORIZED`            | Candidate refresh/reroute; never blind retry |
| No valid candidate                      | `P14_NO_CANDIDATE` safe operations condition            | Configured fail/escalate/queue only          |
| Source unavailable before dispatch      | `P14_SOURCE_UNAVAILABLE`                                | Retry same pending dispatch                  |
| Source delivery ambiguous               | `P14_ACTION_OUTCOME_UNKNOWN`                            | Query by same key/reconcile; no new action   |
| Source rejects stale/closed action      | Safe stale/closed result; task refresh/invalidation     | Source synchronization                       |
| Timer worker race                       | Existing fire business result                           | Safe via lease/fence/key                     |
| Workflow/source drift                   | `P14_RECONCILIATION_REQUIRED`                           | Source-authoritative repair                  |

No failure exposes a hidden task/source/candidate, encrypted reason/summary,
authority details, signing material or restricted reconciliation evidence.

## HCM3-SCOPE

The [approved HCM-3 resolutions](../../roadmap/HCM-3-DECISIONS.md#decisions)
and [owning technical design](TECHNICAL-DESIGN.md) define the admitted release.
Minimum rest is inactive unless tenant policy configures it. Existing authenticated
sessions plus current permissions/scopes, reason capture and audit satisfy
current action assurance; no step-up infrastructure is required. Offline/device
capture, pooling, delegation creation and external monetary handoffs are not
activated by enum values present in this logical model.
