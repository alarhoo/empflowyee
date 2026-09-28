# My Attendance — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `MY_ATTENDANCE`; owner `attendance`; wave HCM-3.

## SCOPE

View own provisional clock state and calculated attendance, and capture time through admitted channels.

Actors: Employee selecting one own employment.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Capture truthful evidence.
2. Inspect calculated days.
3. Request correction.

<a id="req-my-attendance-001"></a>

## REQ-MY-ATTENDANCE-001 — Capture truthful evidence

Clock In/Out and permitted break events through the published allowed source/channel. Preserve occurrence and receipt separately and identify provisional state.

Acceptance: Replay returns the same event; changed payload under source key conflicts; unsupported/revoked channels are denied.

<a id="req-my-attendance-002"></a>

## REQ-MY-ATTENDANCE-002 — Inspect calculated days

Read exact/countable minutes, work/break intervals, leave reconciliation, anomalies and approval/lock state for a selected day.

Acceptance: Ambiguous pairing creates an anomaly instead of guessed work; approved leave never becomes worked minutes.

<a id="req-my-attendance-003"></a>

## REQ-MY-ATTENDANCE-003 — Request correction

Navigate from a day/anomaly to an authorized correction draft with source references and expected revision.

Acceptance: Navigation never submits automatically or mutates raw events; locked-day limitations are explicit.

<a id="req-my-attendance-004"></a>

## REQ-MY-ATTENDANCE-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-my-attendance-005"></a>

## REQ-MY-ATTENDANCE-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-my-attendance-006"></a>

## REQ-MY-ATTENDANCE-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Own clock state, source event/time, workday/zone, calculated totals, safe anomaly and revision/approval/lock states.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Provisional clock; day Calculated/PendingApproval/Approved/Exception/Locked/Superseded.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

schedule resolver, capture/calculation/worker and source authorization foundations. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
