# Approve Leaves — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `APPROVE_LEAVES`; owner `leave`; wave HCM-3.

## SCOPE

Decide exact current Leave-domain approval slots with the necessary source context.

Actors: Currently authorized Leave approver distinct from maker/subject where required.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/leave/DOMAIN-MODEL.md),
[business rules](../../domains/leave/BUSINESS-RULES.md),
[state model](../../domains/leave/STATE-MODEL.md),
[access model](../../domains/leave/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

The [initial Leave baseline](../../domains/leave/INITIAL-POLICY-BASELINE.md) supplies
only the defaults it explicitly names. Other enabled rule parameters require
explicit tenant configuration; this FDD does not invent statutory entitlements.

## JOURNEY

1. Discover current cases.
2. Decide a source slot.
3. Handle missing authority.

<a id="req-approve-leaves-001"></a>

## REQ-APPROVE-LEAVES-001 — Discover current cases

List only cases with current readable/decidable scope, including safe subject, dates, units, stage and evidence-satisfied status.

Acceptance: Assignment alone never reveals a hidden case; medical/private evidence is absent from ordinary case projections.

<a id="req-approve-leaves-002"></a>

## REQ-APPROVE-LEAVES-002 — Decide a source slot

Approve/reject one current slot after reviewing the current request/calculation version and supplying any required reason. VAC/LOP route to manager, above 3 units HR Operations, above 5 Executive under the baseline.

Acceptance: Recheck authority, independence, slot and subject version in transaction; simultaneous decisions accept at most one result per slot.

<a id="req-approve-leaves-003"></a>

## REQ-APPROVE-LEAVES-003 — Handle missing authority

Walk eligible reporting candidates then route a vacant/conflicted slot to the administration exception queue; show pending state.

Acceptance: Elapsed time never approves; Workflow/direct-screen races share one source decision receipt and cannot duplicate posting.

<a id="req-approve-leaves-004"></a>

## REQ-APPROVE-LEAVES-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-approve-leaves-005"></a>

## REQ-APPROVE-LEAVES-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-approve-leaves-006"></a>

## REQ-APPROVE-LEAVES-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Safe case summary, calculation/units, required slots, current decision affordances and accepted decision history.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Pending → Approved/Rejected/Cancelled/Invalidated; no forced status edit.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Leave cases, current scoped authority, worker/Workflow receipt integration. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
