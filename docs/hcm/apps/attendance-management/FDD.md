# Attendance Management — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `ATTENDANCE_MANAGEMENT`; owner `attendance`; wave HCM-3.

## SCOPE

Operate scoped evidence, calculation, anomalies, corrections, periods and non-monetary handoffs.

Actors: Time administrator, independent checker and permitted recovery operator.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Inspect evidence and runs.
2. Resolve anomalies and adjustments.
3. Lock and reopen periods.
4. Publish work evidence.

<a id="req-attendance-management-001"></a>

## REQ-ATTENDANCE-MANAGEMENT-001 — Inspect evidence and runs

Inspect authorized raw event envelopes and calculation input/result revisions; schedule/retry bounded calculation work.

Acceptance: Events cannot be edited/deleted; run totals reflect failed items and identical input-digest retry does not duplicate results.

<a id="req-attendance-management-002"></a>

## REQ-ATTENDANCE-MANAGEMENT-002 — Resolve anomalies and adjustments

Acknowledge/review anomalies and propose governed corrections, nonzero minute adjustments or waivers with reason/evidence.

Acceptance: Blocking waiver/adjustment follows independent approval; internal capture diagnostics stay in restricted views.

<a id="req-attendance-management-003"></a>

## REQ-ATTENDANCE-MANAGEMENT-003 — Lock and reopen periods

Lock only reconciled terminal inputs; reopen only with current permission, approval, reason and retained downstream impact plan.

Acceptance: Late events never mutate a locked basis; relock retains old/new/delta references and unresolved handoff remains a named exception.

<a id="req-attendance-management-004"></a>

## REQ-ATTENDANCE-MANAGEMENT-004 — Publish work evidence

Publish admitted purpose-specific approved/locked evidence and track acknowledgement/reversal without monetary fields.

Acceptance: Duplicate acknowledgement returns existing outcome; conflicting consumer/digest is quarantined and Payroll is not fabricated.

<a id="req-attendance-management-005"></a>

## REQ-ATTENDANCE-MANAGEMENT-005 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-attendance-management-006"></a>

## REQ-ATTENDANCE-MANAGEMENT-006 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-attendance-management-007"></a>

## REQ-ATTENDANCE-MANAGEMENT-007 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Events, runs/items, day/session/anomaly, correction/adjustment cases, lock digests and evidence delivery status.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Run planned/running/terminal; period Planned/Open/Closing/Locked/Reopened; evidence Pending/Published/Acknowledged/Rejected/Superseded.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Attendance foundations, durable worker, authority/evidence and consumer contract. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
