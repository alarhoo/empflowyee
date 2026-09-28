# Leave Policies — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `LEAVE_POLICIES`; owner `leave`; wave HCM-3.

## SCOPE

Configure, preview and publish effective leave eligibility, calculation, accrual and approval policy.

Actors: Leave policy administrator and publisher.

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

1. Draft explicit policy.
2. Review impact.
3. Publish immutably.
4. Control optional capabilities.

<a id="req-leave-policies-001"></a>

## REQ-LEAVE-POLICIES-001 — Draft explicit policy

Use the current Leave baseline: VAC 24/year accruing 2 monthly; seeded types VAC/LOP/ML/PL/BRV/VOTE; no invented sick/casual grant. Complete typed eligibility, increment, rounding, accrual timing/proration and date-window fields before publish.

Acceptance: Seed drafts do not automatically grant unapproved statutory units; absent required parameters block publication instead of receiving hidden defaults.

<a id="req-leave-policies-002"></a>

## REQ-LEAVE-POLICIES-002 — Review impact

Preview enrollment additions/endings, account and open-request effects using versioned workforce and schedule inputs.

Acceptance: Preview changes no account; changed input/draft digest requires a new preview.

<a id="req-leave-policies-003"></a>

## REQ-LEAVE-POLICIES-003 — Publish immutably

Publish a nonoverlapping effective version with current authenticated session and publication permission/scope. Statutory floors, where ratified, cannot be lowered by eligibility exclusion.

Acceptance: A published rule cannot be edited; supersession preserves all referenced calculations and decision evidence.

<a id="req-leave-policies-004"></a>

## REQ-LEAVE-POLICIES-004 — Control optional capabilities

Comp-off is disabled unless a complete policy is explicitly published; encashment admission and LOP funding follow the approved decisions.

Acceptance: No template silently enables comp-off/encashment and no LOP balance bypass is invented.

<a id="req-leave-policies-005"></a>

## REQ-LEAVE-POLICIES-005 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-leave-policies-006"></a>

## REQ-LEAVE-POLICIES-006 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-leave-policies-007"></a>

## REQ-LEAVE-POLICIES-007 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Type, policy/version, eligibility and typed rule sets, effective range, draft validation and impact counts.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Policy version Draft → Published → Retired; impact Running/Ready/Consumed/Failed/Expired.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

published workdays, workforce context, scope/session and impact worker. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
