# Shift Planning — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `SHIFT_PLANNING`; owner `attendance`; wave HCM-3.

## SCOPE

Draft, validate, approve and publish scoped rosters without rewriting published plans.

Actors: Authorized planner/manager and independent roster approver where policy requires.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Draft roster entries.
2. Review and publish impact.
3. Supersede and communicate.

<a id="req-shift-planning-001"></a>

## REQ-SHIFT-PLANNING-001 — Draft roster entries

Select an authorized range and employments; copy or edit entries using published shift versions.

Acceptance: Entries outside employment/planner scope, overlapping shifts and prohibited rest gaps block validation.

<a id="req-shift-planning-002"></a>

## REQ-SHIFT-PLANNING-002 — Review and publish impact

Preview workday changes and locked-period impacts; submit required approval or use an explicitly permitted publish path.

Acceptance: Stale digest cannot publish and required roster approval cannot be skipped by a planner title.

<a id="req-shift-planning-003"></a>

## REQ-SHIFT-PLANNING-003 — Supersede and communicate

Publish a full replacement scope/version, re-resolve permitted workdays and notify affected employees through existing Notifications.

Acceptance: Published entries remain immutable; late changes respect lock/delta rules and failed notification does not invent a second roster.

<a id="req-shift-planning-004"></a>

## REQ-SHIFT-PLANNING-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-shift-planning-005"></a>

## REQ-SHIFT-PLANNING-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-shift-planning-006"></a>

## REQ-SHIFT-PLANNING-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Roster/range, employment/shift/date entries, validation conflicts, impact/approval and published version.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Draft → PendingApproval → Published; Rejected/Cancelled/Superseded.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

published shifts/workdays, roster approval, worker invalidation and notification foundation. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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

## DATED-RESOLUTION

[DEC-HCM3-022 and DEC-HCM3-023](../../roadmap/HCM-3-DECISIONS.md#decisions)
resolve the Step-2 business clarifications. Configured schedule and Attendance
policy minimum-rest rules apply independently with their own Warn/Block modes;
unset rules remain inactive. Employment timezone follows the unique primary
assignment's location. Location timezone follows an explicitly targeted assignment/
location, otherwise that unique primary location. Missing/ambiguous matches remain
unavailable. Fixed timezone remains explicit. These rules govern dated resolution;
this app does not invent a different timezone or minimum-rest fallback.
