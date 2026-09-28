# empFLOWyee HCM-3 Foundation v1.0.0

This overlay gives Claude a clean current-domain foundation for HCM-3 and lets it start without rediscovering Leave, Attendance/Work Schedule, and Workflow/Approvals semantics.

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
for design gate results. Implementation is in progress; all 23 business apps
remain Planned until their individual acceptance checks pass.

Step-2 work is tracked in [HCM-3 implementation status](docs/hcm/roadmap/HCM-3-IMPLEMENTATION-STATUS.md),
with slice-specific validation and explicit migration prerequisites.

Local prerequisites and safe finite/poll worker operation are documented in the
[worker runbook](docs/hcm/operations/WORKER.md). Build the shared runtime with
`pnpm nx run hcm-worker:build`; this command does not migrate a database or start
business processing. Only implemented, explicitly registered handlers may run.
