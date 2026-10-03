# HCM-3 internal Workflow integration

This record describes the internal coordination dependency needed by Work Schedules
and the requested Leave journey. It does not admit any additional Workflow UI app.

## DomainManifest planning review

Codex reviewed the technical integration on 2026-10-03 under the existing
[delegation](../roadmap/HCM-3-DESIGN-APPROVAL.md). The owning
[Workflow design](../domains/workflow/TECHNICAL-DESIGN.md) supplies the registry,
safe facts, graph/candidate bounds, all-required/any-reject semantics and elapsed
timer defaults. The [logical model](../domains/workflow/DATA-MODEL.md) explicitly
permits DomainManifest instances without a WorkflowDefinition version. No implicit
definition, new business rule, human approval or app acceptance is claimed.

Official Nx generators materialized only the universal contract, application ports
and infrastructure needed for this dependency. Source identity and a canonical
closed-manifest digest enter the existing durable Workflow outbox inside the source
transaction. The planner runs through Runtime's verified workload, immutable intent
reload and lease-fenced completion transaction. Its source adapter must return
fresh tenant-owned case and candidate projections; stored candidates never confer
decision authority.

Migration 54 adds tenant-owned instance, stage, task, candidate, timer, restricted
exception and immutable planning receipt storage, with forced RLS and composite
tenant foreign keys. Source case/slot references are opaque contract identities,
not authorization scope targets. The planner creates every required slot, activates
only the first stage and retains the approved 48-hour due, three reminders and
72-hour escalation instants. No candidate produces a restricted NoCandidates
exception; it does not select an administrator. Stale, unavailable, closed or
already-decided source intake cannot manufacture completed tasks. Existing source
decisions and changed generations require receipt reconciliation.

## Verification

On 2026-10-03, the focused manifest suite passed six tests and the disposable
PostgreSQL intake/planner suite passed five tests. The latter uses the real runtime
role and leased worker, with an explicitly test-owned source adapter. It proves
transaction rollback, deterministic duplicate recovery, changed-key rejection,
later-stage blocking, persisted timer identities, no-candidate handling, stale and
closed-source refusal, negative tenant reads and denied direct task completion.
It does not prove production Attendance candidate selection or end-user approval.

Reproduce from the repository root with Docker available:

```sh
pnpm exec vitest run --config tools/milestones/hcm-3/vitest.config.mts libs/hcm/contracts/workflow/src/lib/approval-manifest.spec.ts
pnpm hcm:db:test libs/hcm/api/workflow/infrastructure/src/lib/intake.database.spec.ts
```

## Remaining delivery

Production source adapters and submit commands, current candidate discovery,
action authority/dispatch, immutable source receipt reconciliation, timer execution
and notifications remain required. This initial planner schema does not grant
runtime transition or delete privileges. It is not registered in the running local
worker yet. Migration 54 has been applied only to disposable test databases.
Work Schedules remains incomplete and no requested milestone is complete.
