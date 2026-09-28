# Leave Encashment — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `LEAVE_ENCASHMENT`; owner `leave`; wave HCM-3.

## SCOPE

Inspect units-only encashment configuration and explain unavailable activation until an approved Payroll/Finance consumer contract exists.

Actors: Leave encashment administrator/payroll liaison and independent approver.

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

1. Gate the capability.
2. Inspect units configuration.
3. Expose the consumer boundary.

<a id="req-leave-encashment-001"></a>

## REQ-LEAVE-ENCASHMENT-001 — Gate the capability

Require an Annual-type encashable published policy and admitted consumer contract. Until then show truthful unavailable/configuration state.

Acceptance: No request submission or outgoing handoff is accepted solely because the catalogue app exists.

<a id="req-leave-encashment-002"></a>

## REQ-LEAVE-ENCASHMENT-002 — Inspect units configuration

Read configured Annual-policy units limits and retained-unit settings; link authorized administrators to Leave Policies. No units are reserved or submitted in this release.

Acceptance: Configuration remains units-only; viewing or changing it creates no reservation, request, decision, debit or payment.

<a id="req-leave-encashment-003"></a>

## REQ-LEAVE-ENCASHMENT-003 — Expose the consumer boundary

Document the versioned units-only handoff shape for future admission, and show consumer admission as unavailable. Do not mount handoff, receipt, payment or reconciliation commands.

Acceptance: Direct attempts to call unmounted future endpoints cannot create work; the screen never simulates payment or successful handoff.

<a id="req-leave-encashment-004"></a>

## REQ-LEAVE-ENCASHMENT-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-leave-encashment-005"></a>

## REQ-LEAVE-ENCASHMENT-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-leave-encashment-006"></a>

## REQ-LEAVE-ENCASHMENT-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Units-only policy configuration, unavailable reason, consumerAdmission=false and authorized policy-configuration link. No request, reservation, payment or handoff state.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Unavailable: PolicyNotConfigured or ConsumerContractMissing. Future enabled lifecycle is excluded from this release.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Leave policy configuration and explicit unavailable consumer-admission projection. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
