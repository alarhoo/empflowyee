# empFLOWyee

## Local HCM review

Use the repository-pinned Node/pnpm runtime and Docker. Install dependencies with
`pnpm install --frozen-lockfile`, then run `pnpm hcm:db:up` to explicitly apply
pending SQL migrations and versioned development seeds to the persistent local
database. This command preserves existing data; it does not reset the database.
Start `pnpm dev:hcm-api` and `pnpm dev:hcm --host=127.0.0.1` in separate terminals.
Open **http://acme.localhost:4302**.

The default local persona is Jim Halpert. The profile menu offers Manager,
HR Operations and Tenant Administrator personas. Inspect all applications shows
all catalogue entries; planned apps remain unavailable and permissions still apply.
See the [local launcher guide](tools/hcm-factory/README.md#runtime-catalogue-and-local-launchpad)
for runtime configuration and smoke checks.

## HCM-3 scope

## Implemented screen updates

Org Chart provides a connected D3 hierarchy and the native Tree view, selected
with Chart / Tree controls. Both use the same paged API and person details.
See the [Org Chart design](docs/hcm/apps/org-chart/TDD.md#connected-chart-composition)
and [validation record](docs/hcm/testing/HCM-2-ORG-CHART-VALIDATION.md) for scope and checks.

HCM-3 contains **23 HCM applications** across three domains:

- Leave: 9 apps
- Attendance & Work Schedule: 10 apps
- Workflow & Approvals: 4 apps

The bundle contains current domain models, logical data models, business rules, state models, access/function maps, cross-domain integration guardrails, a current decision register, and two Claude prompts:

1. prepare/finalize HCM-3 FDD/TDD/readiness;
2. implement HCM-3 after readiness approval.

It intentionally contains no historical implementation lineage and does not override current repository architecture.

The [HCM-3 finalized design review](docs/hcm/roadmap/HCM-3-DESIGN-REVIEW.md)
contains all 23 owning FDD/TDD/blueprint packages, the readiness table, resolved
decisions, SQL/contract reconciliation, accepted worker ADR and implementation
sequence. See the [executed validation record](docs/hcm/testing/HCM-3-PREPARATION-VALIDATION.md)
for design gate results. Implementation is in progress. Work Schedule Templates has passed local acceptance;
the remaining 22 business apps are Planned.

Step-2 work is tracked in [HCM-3 implementation status](docs/hcm/roadmap/HCM-3-IMPLEMENTATION-STATUS.md),
with slice-specific validation and explicit migration prerequisites.

The template API is composed in `hcm-api`; [API validation](docs/hcm/testing/HCM-3-TEMPLATE-API-VALIDATION.md)
and [canonical seed defaults](docs/hcm/testing/HCM-3-SEED-DEFAULTS-VALIDATION.md)
document the backend prerequisites. The [native template acceptance record](docs/hcm/testing/HCM-3-TEMPLATE-UI-VALIDATION.md)
provides UI routes, local prerequisites and reproducible production-build browser checks.

Holiday Calendars is locally accepted with native draft, durable publication,
retirement and dated assignment/supersession journeys backed by PostgreSQL.
Publication requires explicit employment/timezone context. David Wallace opens
`/attendance/holiday-calendars` through Administration → Reference Data and Policies;
see [acceptance and reproduction](docs/hcm/testing/HCM-3-HOLIDAY-PUBLICATION-VALIDATION.md).
Work Schedules, My Schedule and the requested Leave apps remain in progress.
The [Work Schedules integration record](docs/hcm/testing/HCM-3-WORK-SCHEDULES-INTEGRATION.md)
distinguishes implemented editors, assignment review and workday inspection from
remaining approval, Leave-impact and browser acceptance. Its tile is not yet Available.
The internal [Workflow integration record](docs/hcm/testing/HCM-3-WORKFLOW-INTEGRATION.md)
tracks tested source submission/intake/planning separately from pending decisions
and dispatch. Local preparation now applies migrations through 55; the worker can
run AttendanceResolve and WorkflowPlan using the explicit allowlist in its runbook.

Local prerequisites and safe finite/poll worker operation are documented in the
[worker runbook](docs/hcm/operations/WORKER.md). Build the shared runtime with
`pnpm nx run hcm-worker:build`; this command does not migrate a database or start
business processing. The registered AttendanceResolve lane publishes assigned
workdays from current dated inputs with atomic receipts; source producer commands
and other business lanes remain in progress. See the runbook for explicit local
configuration and unavailable-outcome semantics.
