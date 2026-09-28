# Workflow Operations — functional design

Status: approved functional design, 2026-09-28. Design approval derives from [product-owner resolutions](../../roadmap/HCM-3-DESIGN-APPROVAL.md). Implementation remains Planned.

App `WORKFLOW_OPERATIONS`; owner `workflow`; wave HCM-3.

## SCOPE

Inspect coordination health and recover mirrors, timers and delivery using authoritative source proof.

Actors: Workflow operator with operation-specific current scope and recovery permission.

Authority: [scope](../../roadmap/HCM-3-SCOPE.md),
[domain model](../../domains/workflow/DOMAIN-MODEL.md),
[business rules](../../domains/workflow/BUSINESS-RULES.md),
[state model](../../domains/workflow/STATE-MODEL.md),
[access model](../../domains/workflow/ACCESS-MODEL.md), and
[shared functional requirements](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md).
The shared document is part of this review, including privacy and acceptance.

## JOURNEY

1. Inspect safe exceptions.
2. Recover from proof.
3. Close reconciliation safely.
4. Observe timer progress.

<a id="req-workflow-operations-001"></a>

## REQ-WORKFLOW-OPERATIONS-001 — Inspect safe exceptions

Search authorized instance/task/delivery/timer failures and claim investigation without source decision authority.

Acceptance: Private summaries/reasons and cross-scope existence are omitted; operator title cannot authorize source reads or actions.

<a id="req-workflow-operations-002"></a>

## REQ-WORKFLOW-OPERATIONS-002 — Recover from proof

Query the original dispatch key, resynchronize source state, refresh candidates or repair due work within exact recovery permissions.

Acceptance: Unknown delivery is never resent with a new key; no operator force-complete or direct source status write exists.

<a id="req-workflow-operations-003"></a>

## REQ-WORKFLOW-OPERATIONS-003 — Close reconciliation safely

Resolve only after source/coordination invariants agree; accepted risk is limited to nonblocking warnings with independent review, reason and authenticated-session validity.

Acceptance: Unknown action outcome, identity mismatch and blocking source drift cannot be accepted as risk or marked successful.

<a id="req-workflow-operations-004"></a>

## REQ-WORKFLOW-OPERATIONS-004 — Observe timer progress

Show overdue/lag, lease/retry and bounded reminder/escalation results under the accepted policy.

Acceptance: Timer completion is not domain approval and a stopped worker resumes durable due work without duplicate effects.

<a id="req-workflow-operations-005"></a>

## REQ-WORKFLOW-OPERATIONS-005 — Authorize independently

Apply [COMMON-AUTH](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-auth).

Acceptance: Direct API and queue/count requests deny missing/revoked grants, entitlements, foreign tenants and out-of-scope subjects; two employments cannot share implicit context.

<a id="req-workflow-operations-006"></a>

## REQ-WORKFLOW-OPERATIONS-006 — Provide accessible truthful states

Apply [COMMON-UX](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-ux).

Acceptance: Keyboard and responsive flows, field validation, empty/error/retry, dirty navigation and late-response clearing work without fixture fallback.

<a id="req-workflow-operations-007"></a>

## REQ-WORKFLOW-OPERATIONS-007 — Persist and protect correctly

Apply [COMMON-COMMIT](../../roadmap/HCM-3-FUNCTIONAL-BASELINE.md#common-commit).

Acceptance: Commands retain durable result/audit/receipt and required outbox atomically; concurrency, replay and rollback tests pass. Read-only apps expose no mutations. COMMON-PRIVACY applies to every projection.

## BUSINESS-DATA

Safe exception code/severity, source/workflow references, delivery/lease/retry state, restricted evidence digest and recovery outcome.

Queries are server-owned and scope-filtered before pagination/counting. Sort/filter
only documented safe fields; the TDD must enumerate the exact field allowlist and
cursor binding after this FDD is approved. Calendar queries are bounded date ranges.

## STATES

Exception Open → Investigating → Resolved/AcceptedRisk where allowed; unknown dispatch remains unresolved.

Policy/configuration missing, unavailable dependency, permission denied and a
legitimate empty result are distinct. Failed drafts remain editable; stale
preview requires review, never silent resubmission. Read-only hides mutations.

## DEPENDENCIES

Workflow worker/dispatch/reconciliation, source adapters and authenticated recovery permission. See the [foundation reconciliation](../../roadmap/HCM-3-FOUNDATION-DESIGN.md#reconciliation)
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
