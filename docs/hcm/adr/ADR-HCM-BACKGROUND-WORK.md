# ADR — HCM durable background work

## Status

Accepted, 2026-09-28, by product-owner resolution DEC-HCM3-021 and delegated
technical finalization. See [approval provenance](../roadmap/HCM-3-DESIGN-APPROVAL.md).
This approves the architecture. Local implementation and validation are tracked
in the [implementation status](../roadmap/HCM-3-IMPLEMENTATION-STATUS.md);
cloud infrastructure is not activated by this ADR.

## Context

Leave accrual/expiry, schedule resolution, attendance recalculation, Workflow
timers, action delivery and reconciliation need durable progress outside HTTP
request lifetime. The current database adapter requires an authenticated,
unexpired interactive session. It cannot safely be reused by forging an account
or retaining an expired browser context. No durable outbox/worker exists in the
inspected migrations through `000033`.

[AGENTS.md](../../../AGENTS.md) lists seven deployables and requires an ADR before
introducing a deployable or authentication trust boundary. The
[carry-forward](../roadmap/HCM-CARRY-FORWARD.md#runtime-topology) permits considering
workers for concrete needs; it does not itself approve one. The
[platform taxonomy](../../platform/engineering/nx/project-taxonomy.md) records the seven current application names and the approved planned worker
exception. This ADR explicitly admits the eighth runtime composition; cloud
provisioning and activation remain subject to infrastructure/IAM review.

## Decision

Use one additional HCM background application, `hcm-worker`, with
a finite, bounded drain execution and an optional local polling mode. A thin
bootstrap composes existing domain application handlers. One artifact supports
both modes; runtime configuration selects workloads and batch/time limits. Keep
the seven existing HTTP/web applications unchanged. Do not host durable loops
or cron scheduling in `hcm-api`.

PostgreSQL owns durable work and delivery state. Use domain-owned transactional
outboxes and run items, with shared lease/retry plumbing in existing HCM runtime
application/infrastructure libraries. Workflow owns its timers; no generic
business workflow is moved into runtime. No Redis, broker or new Nx role is
needed for the initial requirements.

Local: an explicitly started CLI polls due work, with graceful stop and bounded
batch processing. Proposed GCP mapping: a Cloud Run Job executes the same finite
drain, invoked by Cloud Scheduler using a dedicated invoker identity. A proposed
one-minute invocation cadence is an engineering starting point, not an approved
SLO or guarantee. Verify current GCP limits, overlap, IAM and measured timer lag
in the infrastructure TDD before provisioning; no cloud deployment is part of
Step 1. If approved latency requires a continuously running consumer, revisit
this ADR rather than pretending a scheduled Job meets it.

## Workload authority

Introduce a separate internal verified workload context issuer under HCM runtime
ownership, with an allow-listed workload and tenant. Do not fabricate
`AuthenticatedHcmContext`, expose an impersonation HTTP endpoint, use persona
cookies or let queue payloads choose arbitrary tenant scope.

Reuse the non-owner, non-BYPASSRLS `hcm_runtime` SQL posture and transaction-local
`hcm.tenant_id`. This accepted workload path uses the issuer and transaction checks in the
[common TDD](../architecture/TDD-HCM-3-COMMON.md#workload); its negative tests remain
mandatory implementation acceptance evidence. Tenant enumeration uses the existing
runtime-owned tenant directory through a minimal active-ID projection; it is
not a bypass-RLS business query. Each tenant batch starts a fresh transaction;
suspended tenants stop new work except explicitly authorized integrity recovery.
Audit needs an additive actor-kind/system-workload attribution without inventing
a Person/UserAccount or weakening existing human attribution.

Automated calculation/accrual acts under a published policy and named workload.
A deferred human decision does not inherit worker authority: the source checks
the real actor's current grant/scope/slot and server-recorded authenticated
session validity again. Expired sessions require renewed online action; querying
an already committed receipt does not execute a new decision. No new step-up
infrastructure is required by DEC-HCM3-016. Workload envelope authenticity
proves origin and integrity, never the actor's permission.

## Atomicity, leases and recovery

Persist immutable intent payload/digest and business key in the producer's
transaction. Tenant-local workers claim due rows with `FOR UPDATE SKIP LOCKED`,
write a monotonically increasing fence, owner, expiry and attempt count, then
commit. Work runs outside that short claim lock. Completion checks the same fence
and expected source revision; a worker whose lease expired cannot publish.

DB-only side effects, business result, receipt, audit and next outbox entry
commit together. External delivery is at least once: fixed idempotency key,
bounded exponential backoff with jitter, query-by-key after ambiguous delivery,
and an operations exception after retry exhaustion. A dead-letter state is not
proof of source rejection. Reconciliation can repair mirrors from source proof,
never fabricate a decision or receipt.

Periodic planners retain a durable cursor per tenant/workload/policy. After a
stop they enumerate missed business dates from that cursor in bounded batches;
the cursor advances only with durable planned items. Accrual uniqueness is
enrollment/rule/date; calculation uniqueness includes input digest; timer fire
uniqueness is task/generation/rule/fire number. Backfills and replay therefore
do not depend on an in-memory clock tick. Fair per-tenant limits prevent one
tenant monopolizing a run. Graceful shutdown stops claims and allows committed
leases to expire if a handler cannot finish.

## Alternatives

| Alternative                    | Assessment                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| HTTP process scheduler         | Rejected: request-driven lifecycle and replica overlap cannot own durable scheduling.                        |
| User-triggered Apply only      | Useful recovery action, insufficient for required accrual/expiry/timers.                                     |
| Redis/BullMQ or broker fleet   | Deferred: another infrastructure dependency without demonstrated need.                                       |
| One worker per domain          | Deferred: three deployments and operational surfaces before workload isolation is measured.                  |
| Separate mode in the API image | Possible packaging reuse, but still a new operational runtime/trust boundary; it must not hide the ADR gate. |

## Acceptance and rollout

Implementation admission records this accepted topology, workload tenant scoping,
additive audit actor attribution and configurable coordination defaults in the
common TDD and reviewed blueprints. Generate the worker only in its foundation
slice after readiness. It uses runtime:api, domain:runtime, type:app; no new Nx
role is introduced. Before cloud
activation: IaC review, Secret Manager bindings, WIF/manual digest promotion,
network access, overlap and timeout settings, metrics and runbook. No startup
migrations and no CI-triggered deployment.

Prove crash before/after commit, overlapping invocations, lease expiry with stale
completion, lost acknowledgements, revoked actors, cross-tenant tampering,
suspended tenants, missed-date catch-up and poison-item fairness. Expose safe
metrics for queue age, oldest due item, retries, lease loss, unknown deliveries
and reconciliation failures. No reasons or personal values in metric labels.
Rollback disables new claims and preserves outbox/receipts; restart an older
artifact only while its payload/schema versions remain compatible.
