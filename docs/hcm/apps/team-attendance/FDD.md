# Team Attendance — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `TEAM_ATTENDANCE`; owner `attendance`; wave HCM-3.

## SCOPE

View current scoped team attendance and safe exceptions without exposing capture/security details.

Actors: Manager with explicit team attendance permission.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Read current team status.
2. Inspect safe day context.
3. Navigate source action.

<a id="req-team-attendance-001"></a>

## REQ-TEAM-ATTENDANCE-001 — Read current team status

Filter an authorized team/date range and distinguish provisional clock status from calculated/approved/locked facts.

Acceptance: Current reporting changes alter rows/counts; no manager relationship creates permission.

<a id="req-team-attendance-002"></a>

## REQ-TEAM-ATTENDANCE-002 — Inspect safe day context

Show work/rest/absence/late and safe anomaly classification with authorized workday context.

Acceptance: No IP, location precision, device assertion, private reason or unrelated leave detail enters response/search/export.

<a id="req-team-attendance-003"></a>

## REQ-TEAM-ATTENDANCE-003 — Navigate source action

Link a permitted item to its owning correction or approval experience after independent route and API authorization.

Acceptance: Team visibility alone cannot create an approval or on-behalf correction; unavailable action is not a writable status cell.

<a id="req-team-attendance-004"></a>

## REQ-TEAM-ATTENDANCE-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-team-attendance-005"></a>

## REQ-TEAM-ATTENDANCE-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-team-attendance-006"></a>

## REQ-TEAM-ATTENDANCE-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Authorized identity, date, safe status/minutes, calculation freshness and actionable source link where permitted.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Read-only current team projection with distinct provisional/exception/unavailable states.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Attendance calculations and workforce team scope. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
