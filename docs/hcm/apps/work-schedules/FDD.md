# Work Schedules — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `WORK_SCHEDULES`; owner `attendance`; wave HCM-3.

## SCOPE

Configure and publish shifts, schedules, attendance policies and effective assignments that resolve an explainable workday.

Actors: Time policy administrator and authorized publisher.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Configure typed time rules.
2. Resolve scope and precedence.
3. Publish with impact.
4. Inspect a resolved workday.

<a id="req-work-schedules-001"></a>

## REQ-WORK-SCHEDULES-001 — Configure typed time rules

Draft shifts, work/break segments, weekly patterns, timezone mode and attendance rules. Every enabled rule needs complete explicit parameters.

Acceptance: Derived planned minutes agree with resolved segments; unsupported variants and incomplete overtime/capture rules cannot publish.

<a id="req-work-schedules-002"></a>

## REQ-WORK-SCHEDULES-002 — Resolve scope and precedence

Resolve approved override before published roster before ordinary schedule, then employment/assignment/location/department/unit/legal-entity/organization specificity.

Acceptance: Equal-precedence conflicts block the day; a missing schedule is distinct from a deliberately unscheduled day.

<a id="req-work-schedules-003"></a>

## REQ-WORK-SCHEDULES-003 — Publish with impact

Preview affected workdays, Leave calculations and locked attendance before publishing immutable versions and assignments.

Acceptance: Changed source digests reject publication; open days receive new resolution revisions while locked history is preserved.

<a id="req-work-schedules-004"></a>

## REQ-WORK-SCHEDULES-004 — Inspect a resolved workday

Explain selected source versions, local date/zone, work/break/holiday intervals and exceptions.

Acceptance: A cross-midnight shift belongs to the start date and DST ambiguity never silently guesses an instant.

<a id="req-work-schedules-005"></a>

## REQ-WORK-SCHEDULES-005 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-work-schedules-006"></a>

## REQ-WORK-SCHEDULES-006 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-work-schedules-007"></a>

## REQ-WORK-SCHEDULES-007 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Schedule/shift/policy versions, rules, assignments, impact results and selected workday basis.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Configuration Draft → Published → Retired; workday Published/Superseded/Invalid.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

holiday foundation, workforce time context, impact worker. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
