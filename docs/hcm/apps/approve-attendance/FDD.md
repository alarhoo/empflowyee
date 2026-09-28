# Approve Attendance — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `APPROVE_ATTENDANCE`; owner `attendance`; wave HCM-3.

## SCOPE

Decide current Attendance cases for correction, adjustment, overtime, roster, override, anomaly waiver and reopen where admitted.

Actors: Current independent Attendance approver within exact scope.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Review exact subject.
2. Approve or reject a slot.
3. Respect source authority.

<a id="req-approve-attendance-001"></a>

## REQ-APPROVE-ATTENDANCE-001 — Review exact subject

Read a privacy-safe case and authorized before/after minute/schedule effect for its current revision and period.

Acceptance: Hidden capture assertions/private narrative are excluded from ordinary queue rows and counts.

<a id="req-approve-attendance-002"></a>

## REQ-APPROVE-ATTENDANCE-002 — Approve or reject a slot

Recheck permission, one scope grant, stage/slot, independence, result version, period and authenticated-session validity before recording an immutable decision.

Acceptance: Self/maker decision, revoked authority, stale result or changed period fails without applying the subject.

<a id="req-approve-attendance-003"></a>

## REQ-APPROVE-ATTENDANCE-003 — Respect source authority

Final approval invokes the owning subject command or durable continuation; material change invalidates the case.

Acceptance: Workflow and direct-screen races cannot decide twice; no timer, task or operator marks a domain case approved.

<a id="req-approve-attendance-004"></a>

## REQ-APPROVE-ATTENDANCE-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-approve-attendance-005"></a>

## REQ-APPROVE-ATTENDANCE-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-approve-attendance-006"></a>

## REQ-APPROVE-ATTENDANCE-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Safe case/subject summary, source revision, minute delta/impact, current slots and accepted history.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Pending → Approved/Rejected/Cancelled/Invalidated; application may remain explicitly pending.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Attendance source cases, current scoped authority/session, dispatch receipts. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
