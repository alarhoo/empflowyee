# Comp Off Administration — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `COMP_OFF_ADMINISTRATION`; owner `leave`; wave HCM-3.

## SCOPE

Validate and reconcile Attendance work evidence and governed manual comp-off credit.

Actors: Scoped Leave administrator and independent approver.

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

1. Consume explicit evidence.
2. Validate governed credit.
3. Reconcile reversal and expiry.

<a id="req-comp-off-administration-001"></a>

## REQ-COMP-OFF-ADMINISTRATION-001 — Consume explicit evidence

Accept only admitted versioned WorkEvidence for the same employment/date and published Leave comp-off policy; Attendance supplies minutes, Leave derives units.

Acceptance: Same evidence is credited once; mismatched tenant/version/digest rejects; no Timesheet adapter is invented.

<a id="req-comp-off-administration-002"></a>

## REQ-COMP-OFF-ADMINISTRATION-002 — Validate governed credit

Review claims or propose manual evidence with reason and independent approval. No comp-off policy is enabled by default; configured baseline supports 240/480-minute thresholds, one unit/day, 30-day claim window and 90-day credit expiry.

Acceptance: Without a published rule no credit is created; maker cannot approve manual credit and conversion retains its input evidence.

<a id="req-comp-off-administration-003"></a>

## REQ-COMP-OFF-ADMINISTRATION-003 — Reconcile reversal and expiry

Handle linked reversals/replacements; expire only unused units and retain allocations for partial use.

Acceptance: Already-used invalidated credit opens a restricted exception; it never deletes history or silently manufactures replacement units.

<a id="req-comp-off-administration-004"></a>

## REQ-COMP-OFF-ADMINISTRATION-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-comp-off-administration-005"></a>

## REQ-COMP-OFF-ADMINISTRATION-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-comp-off-administration-006"></a>

## REQ-COMP-OFF-ADMINISTRATION-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Evidence reference, approved minutes, work date, policy conversion, credit/remaining units, approval and reconciliation status.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

PendingClaim/PendingValidation → Available → PartlyUsed/Consumed; Expired/Rejected/Reversed alternatives.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Attendance WorkEvidence, Leave ledger and approval foundations. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
