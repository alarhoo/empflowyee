# My Tasks — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `MY_TASKS`; owner `workflow`; wave HCM-3.

## SCOPE

Discover own assigned/offered work across admitted source domains and invoke only registered permitted actions.

Actors: Current eligible candidate/assignee with Workflow and source entitlements.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/workflow/DOMAIN-MODEL.md),
[business rules](../../domains/workflow/BUSINESS-RULES.md),
[state model](../../domains/workflow/STATE-MODEL.md),
[access model](../../domains/workflow/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Read the current inbox.
2. Inspect and act.
3. Show durable progress.

<a id="req-my-tasks-001"></a>

## REQ-MY-TASKS-001 — Read the current inbox

List assigned/offered tasks using current source discovery/field access, with safe summary, due state and registered link.

Acceptance: Rows/counts disappear when source visibility or entitlement is revoked; an assignment is not authority.

<a id="req-my-tasks-002"></a>

## REQ-MY-TASKS-002 — Inspect and act

Read source-authorized detail and submit an allowed action with exact task/source revisions; direct/candidate-offer modes are admitted; claim/release is deferred.

Acceptance: Unsupported non-approval action is absent, and stale/unauthorized actions fail without domain writes.

<a id="req-my-tasks-003"></a>

## REQ-MY-TASKS-003 — Show durable progress

Display ActionPending/unknown delivery until an authenticated source receipt is reconciled.

Acceptance: Timeout never shows completed or permits a new-key duplicate; same-key replay returns the existing attempt.

<a id="req-my-tasks-004"></a>

## REQ-MY-TASKS-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-my-tasks-005"></a>

## REQ-MY-TASKS-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-my-tasks-006"></a>

## REQ-MY-TASKS-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Safe task title/reference, source module, available/due time, status, current action affordances and delivery progress.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Blocked/Ready/ActionPending/Completed; terminal cancellation/invalidation/expiry requires source truth.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Workflow intake/dispatch and Leave/Attendance source adapters. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
