# Leave Administration — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `LEAVE_ADMINISTRATION`; owner `leave`; wave HCM-3.

## SCOPE

Operate scoped enrollments, requests, accounts, accruals and reconciliation exceptions without rewriting the ledger.

Actors: Leave administrator; independent approver for balance adjustments.

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

1. Manage enrollment and requests.
2. Run and reconcile accrual.
3. Adjust with independent approval.
4. Close a period safely.

<a id="req-leave-administration-001"></a>

## REQ-LEAVE-ADMINISTRATION-001 — Manage enrollment and requests

Inspect eligible employments, dated enrollments and requests under the published policy; any on-behalf operation preserves actor and subject.

Acceptance: Incomplete/out-of-scope employment is denied; concurrent employments retain separate accounts and history.

<a id="req-leave-administration-002"></a>

## REQ-LEAVE-ADMINISTRATION-002 — Run and reconcile accrual

Plan or retry due accrual/carry-forward/expiry and reconcile posted balance plus reservations against ledger allocations.

Acceptance: Same enrollment/rule/date posts once; failed items stay visible and run status is derived from actual outcomes.

<a id="req-leave-administration-003"></a>

## REQ-LEAVE-ADMINISTRATION-003 — Adjust with independent approval

Propose nonzero units, effective date, reason and clean evidence; an independent current slot approves before posting.

Acceptance: Maker cannot approve; a correction appends an adjustment/reversal and never updates a prior ledger row.

<a id="req-leave-administration-004"></a>

## REQ-LEAVE-ADMINISTRATION-004 — Close a period safely

Close only after pending runs, reservations and account reconciliation satisfy the domain rules; expose conflicts and governed recovery.

Acceptance: Unresolved reservations/failures block close; late correction never edits a closed period.

<a id="req-leave-administration-005"></a>

## REQ-LEAVE-ADMINISTRATION-005 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-leave-administration-006"></a>

## REQ-LEAVE-ADMINISTRATION-006 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-leave-administration-007"></a>

## REQ-LEAVE-ADMINISTRATION-007 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Employment/enrollment, policy/period, request and account summaries, ledger/allocations, run items, adjustment case and exception details by permission.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Enrollment Pending/Active/Suspended/Ended; period Planned/Open/Closing/Closed; runs and adjustments follow domain state model.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Leave policy/ledger/approval/worker foundation. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
