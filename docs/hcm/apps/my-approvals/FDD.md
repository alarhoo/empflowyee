# My Approvals — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `MY_APPROVALS`; owner `workflow`; wave HCM-3.

## SCOPE

Consolidate actionable source approval tasks while Leave/Attendance remain decision authorities.

Actors: Current domain approver with Workflow and source entitlement/permission.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/workflow/DOMAIN-MODEL.md),
[business rules](../../domains/workflow/BUSINESS-RULES.md),
[state model](../../domains/workflow/STATE-MODEL.md),
[access model](../../domains/workflow/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Discover actionable approvals.
2. Dispatch an exact decision.
3. Confirm from source proof.

<a id="req-my-approvals-001"></a>

## REQ-MY-APPROVALS-001 — Discover actionable approvals

Show current readable/actionable approval tasks from admitted Leave/Attendance sources with only safe subject facts.

Acceptance: Hidden source cases do not affect visible rows/counts; ordinary queues omit private reasons and evidence.

<a id="req-my-approvals-002"></a>

## REQ-MY-APPROVALS-002 — Dispatch an exact decision

Review the current safe source state and submit approve/reject intent for an exact case/stage/slot and expected revisions.

Acceptance: Source independently rechecks permission/scope/subject distinction/session/version; task claim does not grant authority.

<a id="req-my-approvals-003"></a>

## REQ-MY-APPROVALS-003 — Confirm from source proof

Complete a task only from the matching authenticated accepted receipt; otherwise refresh stale/closed tasks or reconcile unknown delivery.

Acceptance: Direct domain approval racing the inbox causes one durable source decision; retries do not repost leave or attendance effects.

<a id="req-my-approvals-004"></a>

## REQ-MY-APPROVALS-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-my-approvals-005"></a>

## REQ-MY-APPROVALS-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-my-approvals-006"></a>

## REQ-MY-APPROVALS-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Task/case reference, safe source subject/date/unit-or-minute summary, slot, due time, accepted receipt status.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Ready → ActionPending → Completed only with source Accepted; otherwise source-led refresh.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

source cases and reauthorization, Workflow receipt/reconciliation. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
for delivered ports versus required extensions. Prerequisite designs are resolved; their implementation still precedes app delivery.

## EXCLUSIONS

Production monetary Payroll/Finance processing, external notification delivery,
unadmitted source/capture adapters, statutory certification and retention/legal-hold
automation are outside current scope. No Storybook/Theme Lab work, feature styling
or production fixtures. App-specific optional behavior remains disabled
as named above; no approval is inferred from a recommendation.

## DESIGN-HANDOFF

The owning [TDD](TDD.md) records exact route/floorplan, contracts, persistence,
permission/scope and acceptance design. [Traceability](TRACEABILITY.md) covers
every stable requirement. Approval is recorded under the bounded product-owner
delegation; no implementation/test execution is implied.

## RESOLUTIONS

The [approved decision register](../../roadmap/HCM-3-DECISIONS.md#decisions) is
part of this FDD. Current scope uses configurable seed defaults, inactive-unless-
configured minimum rest, online web only, disabled-until-configured overtime,
source-owned approvals, direct/candidate-offer tasks and existing authenticated
sessions with explicit permissions/scopes, reason capture and audit. No new
step-up infrastructure is required. LOP tracks units without a balance or
reservation; encashment configuration/contracts remain disabled for submission
and handoff. These resolutions govern conditional wording in this FDD.
