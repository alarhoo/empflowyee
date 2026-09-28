# Workflow Definitions — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `WORKFLOW_DEFINITIONS`; owner `workflow`; wave HCM-3.

## SCOPE

Define reusable coordination for registered source contracts without taking ownership of domain approval rules.

Actors: Workflow definition administrator and verified publisher.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/workflow/DOMAIN-MODEL.md),
[business rules](../../domains/workflow/BUSINESS-RULES.md),
[state model](../../domains/workflow/STATE-MODEL.md),
[access model](../../domains/workflow/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Draft a compatible graph.
2. Preview routing.
3. Publish immutable coordination.

<a id="req-workflow-definitions-001"></a>

## REQ-WORKFLOW-DEFINITIONS-001 — Draft a compatible graph

Select a registered source contract, stages, slots, typed conditions, routes and timers within approved limits.

Acceptance: Scripts/arbitrary URLs/unregistered actions or incompatible facts are rejected; the definition cannot weaken source required slots.

<a id="req-workflow-definitions-002"></a>

## REQ-WORKFLOW-DEFINITIONS-002 — Preview routing

Compile deterministically and preview candidate/no-candidate/route/in-flight impacts against fixed source/configuration versions.

Acceptance: Preview mutates no source case; source or draft changes invalidate its digest.

<a id="req-workflow-definitions-003"></a>

## REQ-WORKFLOW-DEFINITIONS-003 — Publish immutable coordination

Require complete satisfiable graph, current authenticated session and publish permission/scope and matching preview; publish nonoverlapping versions.

Acceptance: Published children cannot be edited; existing instances retain their accepted graph/manifest and retired versions stop future selection.

<a id="req-workflow-definitions-004"></a>

## REQ-WORKFLOW-DEFINITIONS-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-workflow-definitions-005"></a>

## REQ-WORKFLOW-DEFINITIONS-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-workflow-definitions-006"></a>

## REQ-WORKFLOW-DEFINITIONS-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Registered subject contract/actions/facts, definition/version, stages/slots/routes/conditions/timers, impact counts.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Definition Draft → Published → Retired; preview Running/Ready/Consumed/Failed/Expired.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

registered source manifests, authority/session and preview worker. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
