# Holiday Calendars — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation acceptance is recorded in [traceability](TRACEABILITY.md).

App `HOLIDAY_CALENDARS`; owner `attendance`; wave HCM-3.

## SCOPE

Publish effective holiday calendars and assign them to authorized workforce scopes.

Actors: Time policy administrator and publisher.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Define calendar versions.
2. Preview and publish.
3. Assign and supersede.

<a id="req-holiday-calendars-001"></a>

## REQ-HOLIDAY-CALENDARS-001 — Define calendar versions

Draft calendars with actual/observed dates, category, priority, regional applicability and optional partial-day intervals.

Acceptance: Invalid partial ranges or unresolved collisions block preview/publication; observed dates are never silently guessed.

<a id="req-holiday-calendars-002"></a>

## REQ-HOLIDAY-CALENDARS-002 — Preview and publish

Review affected employments, dates and locked-period impacts before publishing the exact draft revision.

Acceptance: A changed draft/workforce input makes the preview stale; publication freezes content and leaves historical referenced versions intact.

<a id="req-holiday-calendars-003"></a>

## REQ-HOLIDAY-CALENDARS-003 — Assign and supersede

Assign an effective version to one explicit scope target; retire or supersede for future selection without editing historical holidays.

Acceptance: Equal-precedence overlapping assignments fail and unrelated scopes keep their calendars.

<a id="req-holiday-calendars-004"></a>

## REQ-HOLIDAY-CALENDARS-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-holiday-calendars-005"></a>

## REQ-HOLIDAY-CALENDARS-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-holiday-calendars-006"></a>

## REQ-HOLIDAY-CALENDARS-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Calendar/version, date/category, observed date, partial interval, priority, scope, impact counts and safe conflict explanation.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Draft → Published → Retired; impact Running → Ready → Consumed, or Failed/Expired.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

workforce time context, versioned configuration, impact worker. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
