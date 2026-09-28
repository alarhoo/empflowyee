# Apply Leave — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `APPLY_LEAVE`; owner `leave`; wave HCM-3.

## SCOPE

Preview, submit, track, withdraw and request cancellation of own leave with explainable units.

Actors: Employee selecting one authorized own employment.

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

1. Preview dates and portions.
2. Submit with evidence and reservation.
3. Track and withdraw.
4. Cancel approved days.

<a id="req-apply-leave-001"></a>

## REQ-APPLY-LEAVE-001 — Preview dates and portions

Choose eligible policy and local dates/portions; calculate using each published scheduled-day denominator and exact per-day rounded sum. Half-day uses the scheduled midpoint; hourly portions use policy increment.

Acceptance: Reject cross-period/policy-version requests, missing inputs and disallowed overlap; VAC notice below 3 days warns under the baseline.

<a id="req-apply-leave-002"></a>

## REQ-APPLY-LEAVE-002 — Submit with evidence and reservation

Submit the unchanged preview, required reason and clean classified evidence; atomically reserve availability for balance-tracked policies (Unpaid LOP creates no reservation) and open source approval slots.

Acceptance: Concurrent spending cannot produce negative availability; evidence classification cannot be downgraded and failed submission creates no partial reservation.

<a id="req-apply-leave-003"></a>

## REQ-APPLY-LEAVE-003 — Track and withdraw

Read own request days, safe approval progress and employee-visible comments; withdraw an eligible pending request.

Acceptance: Withdrawal cancels pending case and releases any balance-tracked reservation once; a late decision cannot approve the withdrawn request.

<a id="req-apply-leave-004"></a>

## REQ-APPLY-LEAVE-004 — Cancel approved days

Request a full or partial cancellation for eligible days; cancellation approval reverses only posted eligible day units.

Acceptance: Partial cancellation preserves untouched days/history; repeated application cannot credit twice and material edits invalidate prior approval.

<a id="req-apply-leave-005"></a>

## REQ-APPLY-LEAVE-005 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-apply-leave-006"></a>

## REQ-APPLY-LEAVE-006 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-apply-leave-007"></a>

## REQ-APPLY-LEAVE-007 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Employment, eligible policy, date/portion rows, units, warnings, evidence status, request/status and safe approval progress.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Draft → Submitted → PendingApproval → Approved → InProgress → Completed; Rejected/Withdrawn/Cancelled alternatives and CancelPending.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Leave policy/account, published workdays, evidence, approval and Workflow coordination foundations. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
