# Comp Off Encashment — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `COMP_OFF_ENCASHMENT`; owner `leave`; wave HCM-3.

## SCOPE

Let employees claim configured comp-off and inspect the availability of units-only encashment.

Actors: Employee with verified own employment.

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

1. Read own eligible earnings.
2. Claim comp-off.
3. Respect encashment admission.

<a id="req-comp-off-encashment-001"></a>

## REQ-COMP-OFF-ENCASHMENT-001 — Read own eligible earnings

List own admitted work-evidence earnings, published conversion, remaining units and expiry without exposing capture diagnostics.

Acceptance: No policy means explicitly unavailable capability; employees cannot enter invented worked minutes.

<a id="req-comp-off-encashment-002"></a>

## REQ-COMP-OFF-ENCASHMENT-002 — Claim comp-off

Submit a permitted claim within its configured window and track its domain approval; withdraw eligible pending credit requests.

Acceptance: Late/duplicate claims fail; partial consumption and expiry preserve remaining proven units and source evidence.

<a id="req-comp-off-encashment-003"></a>

## REQ-COMP-OFF-ENCASHMENT-003 — Respect encashment admission

Show encashment as unavailable unless the policy and approved consumer contract admit it. Future activation requires its own consumer review; this release exposes configuration and unavailable state only.

Acceptance: No monetary estimate, Paid simulation or submission to a missing consumer; DEC-HCM3-019 fixes the current scope to units-only contract/configuration with disabled submission/handoff.

<a id="req-comp-off-encashment-004"></a>

## REQ-COMP-OFF-ENCASHMENT-004 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-comp-off-encashment-005"></a>

## REQ-COMP-OFF-ENCASHMENT-005 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-comp-off-encashment-006"></a>

## REQ-COMP-OFF-ENCASHMENT-006 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Own earning/date/minutes, requested and remaining units, expiry, claim progress; encashment eligibility/status only if admitted.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Credit Draft/Submitted/PendingApproval/Approved/Posted/Rejected/Withdrawn/Failed; encashment disabled pending admission.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

WorkEvidence and Leave comp-off foundation; encashment admission. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
