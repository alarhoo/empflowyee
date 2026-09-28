# Work Schedule Templates — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation accepted locally; see [acceptance evidence](../../testing/HCM-3-TEMPLATE-UI-VALIDATION.md).

App `WORK_SCHEDULE_TEMPLATES`; owner `attendance`; wave HCM-3.

## SCOPE

Curate reusable schedule patterns that seed drafts without assigning a live work schedule.

Actors: Time policy administrator with organization scope.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/attendance/DOMAIN-MODEL.md),
[business rules](../../domains/attendance/BUSINESS-RULES.md),
[state model](../../domains/attendance/STATE-MODEL.md),
[access model](../../domains/attendance/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Curate patterns.
2. Validate before reuse.
3. Retire safely.

<a id="req-work-schedule-templates-001"></a>

## REQ-WORK-SCHEDULE-TEMPLATES-001 — Curate patterns

Create and edit named templates with ordered day/work/break segments and explicit timezone mode. Template use creates an independent draft with a source reference.

Acceptance: Copying preserves source attribution; editing the copy never changes the template or any assigned schedule.

<a id="req-work-schedule-templates-002"></a>

## REQ-WORK-SCHEDULE-TEMPLATES-002 — Validate before reuse

Validate segment order, overlap, day offsets and policy limits. A template is never selected by live workday resolution.

Acceptance: A template ID supplied as a live assignment is denied; conflicting segments produce field-specific errors.

<a id="req-work-schedule-templates-003"></a>

## REQ-WORK-SCHEDULE-TEMPLATES-003 — Retire safely

Retire a template from future selection while retaining copies and history.

Acceptance: Previously copied/published schedules remain unchanged and a retired template is unavailable for new copies.

<a id="req-work-schedule-templates-004"></a>

## REQ-WORK-SCHEDULE-TEMPLATES-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-work-schedule-templates-005"></a>

## REQ-WORK-SCHEDULE-TEMPLATES-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-work-schedule-templates-006"></a>

## REQ-WORK-SCHEDULE-TEMPLATES-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Code, name, status, day patterns, segments, timezone mode, revision and copy source.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Draft template → reusable template → retired; exact publication treatment follows the schedule version rules. It is never a live assignment.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

schedule configuration foundation. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
