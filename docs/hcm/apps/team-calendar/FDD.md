# Team Calendar — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `TEAM_CALENDAR`; owner `leave`; wave HCM-3.

## SCOPE

Show current scoped team availability through a privacy-safe absence agenda.

Actors: Manager with explicit team calendar permission.

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

1. Discover team absences.
2. Protect absence privacy.
3. Navigate dates accessibly.

<a id="req-team-calendar-001"></a>

## REQ-TEAM-CALENDAR-001 — Discover team absences

Choose a date range and view approved current team absence intervals using current effective report relationships.

Acceptance: Revoking team permission or changing the reporting line removes rows and counts immediately; no tenant-wide manager fallback.

<a id="req-team-calendar-002"></a>

## REQ-TEAM-CALENDAR-002 — Protect absence privacy

Show authorized employee identity, absence interval and a neutral absence label, together with work/rest context where needed.

Acceptance: No reason, medical label, approval reason, attachment, balance or hidden leave type can be inferred from search, counts, sorting or detail.

<a id="req-team-calendar-003"></a>

## REQ-TEAM-CALENDAR-003 — Navigate dates accessibly

Use native date/range selection and an accessible agenda; preserve filters on return from an independently authorized source route.

Acceptance: Keyboard/date selection works at phone width; no generic detail endpoint grants more data than the team projection.

<a id="req-team-calendar-004"></a>

## REQ-TEAM-CALENDAR-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-team-calendar-005"></a>

## REQ-TEAM-CALENDAR-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-team-calendar-006"></a>

## REQ-TEAM-CALENDAR-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Authorized team identity, date/interval, neutral absence state and safe workday context.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Read-only approved absence; pending/private requests are not calendar events.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

approved Leave requests, workforce team scope, published workdays. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
