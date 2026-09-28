# My Schedule — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `MY_SCHEDULE`; owner `attendance`; wave HCM-3.

## SCOPE

Show one selected own employment’s published work/rest/holiday schedule and explain changes.

Actors: Employee with a verified own employment.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Read published schedule.
2. Inspect intervals.
3. Navigate changes.

<a id="req-my-schedule-001"></a>

## REQ-MY-SCHEDULE-001 — Read published schedule

Choose an own employment and date range; display only resolved published workdays with applicable timezone and local start-date grouping.

Acceptance: Foreign employment selection is hidden; missing/conflicted input appears unavailable rather than a fabricated default.

<a id="req-my-schedule-002"></a>

## REQ-MY-SCHEDULE-002 — Inspect intervals

Open a day to inspect work and break intervals, holiday/rest state and effective version/change reference.

Acceptance: Cross-midnight and offset changes display the actual intervals without shifting a calendar date by the viewer’s timezone.

<a id="req-my-schedule-003"></a>

## REQ-MY-SCHEDULE-003 — Navigate changes

Refresh published changes while preserving date selection; links lead only to authorized source detail.

Acceptance: A superseded workday is labelled as history and never displayed as the current plan; no schedule write action is exposed.

<a id="req-my-schedule-004"></a>

## REQ-MY-SCHEDULE-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-my-schedule-005"></a>

## REQ-MY-SCHEDULE-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-my-schedule-006"></a>

## REQ-MY-SCHEDULE-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Date, zone, workday classification, intervals, planned minutes, published revision and change reference.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Read-only current schedule; loading/empty/unresolved/conflicted states remain distinct.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

published workday resolver. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
