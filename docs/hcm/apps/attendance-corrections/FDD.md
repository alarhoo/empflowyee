# Attendance Corrections — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `ATTENDANCE_CORRECTIONS`; owner `attendance`; wave HCM-3.

## SCOPE

Preview, submit, track and withdraw a correction to own attendance evidence.

Actors: Employee with self correction permission.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Preview correction.
2. Submit and track.
3. Apply or withdraw safely.

<a id="req-attendance-corrections-001"></a>

## REQ-ATTENDANCE-CORRECTIONS-001 — Preview correction

Select a day and typed permitted correction items; supply reason/evidence and compare proposed versus existing calculated result.

Acceptance: Outside-window/locked/stale subjects are denied; timezone ambiguities and inconsistent correction items get explicit field errors.

<a id="req-attendance-corrections-002"></a>

## REQ-ATTENDANCE-CORRECTIONS-002 — Submit and track

Submit the exact preview for domain-owned approval; retain the original raw events and source revision.

Acceptance: A material edit invalidates the pending case; an approver cannot apply a stale preview.

<a id="req-attendance-corrections-003"></a>

## REQ-ATTENDANCE-CORRECTIONS-003 — Apply or withdraw safely

Withdraw an eligible pending correction; approved application appends new evidence/disposition and a new calculation revision.

Acceptance: Retry after a crash returns the existing applied result, never a second synthetic event; old result/decision remains available as history.

<a id="req-attendance-corrections-004"></a>

## REQ-ATTENDANCE-CORRECTIONS-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-attendance-corrections-005"></a>

## REQ-ATTENDANCE-CORRECTIONS-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-attendance-corrections-006"></a>

## REQ-ATTENDANCE-CORRECTIONS-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Day/version, correction item types/times, reason/evidence status, before/after preview and application progress.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Draft → Submitted → PendingApproval → Approved → Applying → Applied; Rejected/Withdrawn/Failed/Invalidated.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Attendance calculation/correction and evidence/approval foundations. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
